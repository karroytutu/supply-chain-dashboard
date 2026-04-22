/**
 * 催收考核计算引擎
 * 实现阶梯式累进考核规则的自动化计算
 */

import { appQuery } from '../../db/appPool';
import { getUsersByRole } from '../return-penalty';
import {
  ASSESSMENT_RULES,
  TIER_NAMES,
  type AssessmentTier,
  type AssessmentRole,
  type CalculationResult,
} from './ar-assessment.types';

/** 活跃任务行 */
interface ActiveTask {
  id: number;
  task_no: string;
  consumer_name: string;
  manager_user_id: number | null;
  manager_user_name: string | null;
  total_amount: string;
  assessment_start_time: Date;
}

/** 已有考核记录行 */
interface ExistingRecord {
  task_id: number;
  assessment_tier: AssessmentTier;
  assessment_user_id: number;
}

/** 考核生效日期：2026-04-23 */
const EFFECTIVE_DATE = new Date(2026, 3, 23);

/**
 * 计算催收考核
 * 查询活跃待考核任务，按阶梯规则生成考核记录
 * 考核自 2026-04-23 起生效，此前超时不计入考核
 */
export async function calculateArAssessments(): Promise<CalculationResult[]> {
  console.log('[ArAssessment] 开始考核计算...');

  const results: CalculationResult[] = [];

  // 1. 查询活跃待考核任务
  const taskResult = await appQuery<ActiveTask>(
    `SELECT id, task_no, consumer_name, manager_user_id, manager_user_name,
            total_amount, assessment_start_time
     FROM ar_collection_tasks
     WHERE status IN ('collecting', 'escalated', 'difference_processing')
       AND assessment_start_time IS NOT NULL`
  );

  if (taskResult.rows.length === 0) {
    console.log('[ArAssessment] 无活跃待考核任务');
    return results;
  }

  // 2. 查询已有考核记录（防止重复）
  const taskIds = taskResult.rows.map(t => t.id);
  const existingResult = await appQuery<ExistingRecord>(
    `SELECT task_id, assessment_tier, assessment_user_id
     FROM ar_assessment_records
     WHERE task_id = ANY($1)`,
    [taskIds]
  );

  const existingSet = new Set<string>();
  for (const row of existingResult.rows) {
    existingSet.add(`${row.task_id}:${row.assessment_tier}:${row.assessment_user_id}`);
  }

  // 3. 获取营销主管用户列表
  const supervisors = await getUsersByRole('marketing_supervisor');
  const supervisorMap = new Map(supervisors.map(s => [s.id, s.name]));

  // 4. 计算当前时间（北京时区）
  const now = new Date();

  // 5. 按层级处理
  const tiers: AssessmentTier[] = ['tier1', 'tier2', 'tier3'];

  for (const tier of tiers) {
    const rule = ASSESSMENT_RULES[tier];
    let processedCount = 0;
    let createdCount = 0;

    for (const task of taskResult.rows) {
      // 计算超时天数：以生效日期与实际开始时间的较大值作为起点
      const startTime = new Date(task.assessment_start_time);
      const effectiveStartTime = startTime.getTime() < EFFECTIVE_DATE.getTime()
        ? EFFECTIVE_DATE
        : startTime;
      const diffMs = now.getTime() - effectiveStartTime.getTime();
      const overdueDays = Math.floor(diffMs / 86400000);

      if (overdueDays < rule.minDays) continue;
      processedCount++;

      const totalAmount = parseFloat(task.total_amount) || 0;

      // 为营销师创建记录
      if (task.manager_user_id) {
        const key = `${task.id}:${tier}:${task.manager_user_id}`;
        if (!existingSet.has(key)) {
          const penaltyAmount = calculatePenaltyAmount(tier, 'marketer', totalAmount);
          await insertAssessmentRecord(
            task.id, tier, task.manager_user_id, task.manager_user_name || '',
            'marketer', totalAmount, overdueDays, penaltyAmount, rule
          );
          existingSet.add(key);
          createdCount++;
        }
      }

      // 为每个营销主管创建记录
      for (const [supervisorId, supervisorName] of supervisorMap) {
        const key = `${task.id}:${tier}:${supervisorId}`;
        if (!existingSet.has(key)) {
          const penaltyAmount = calculatePenaltyAmount(tier, 'marketing_supervisor', totalAmount);
          await insertAssessmentRecord(
            task.id, tier, supervisorId, supervisorName,
            'marketing_supervisor', totalAmount, overdueDays, penaltyAmount, rule
          );
          existingSet.add(key);
          createdCount++;
        }
      }
    }

    results.push({ tier, processedCount, createdCount });
    console.log(`[ArAssessment] ${rule.name}: 处理 ${processedCount} 个任务, 创建 ${createdCount} 条记录`);
  }

  const totalCreated = results.reduce((sum, r) => sum + r.createdCount, 0);
  console.log(`[ArAssessment] 考核计算完成，共创建 ${totalCreated} 条记录`);

  return results;
}

/**
 * 计算单条考核金额
 */
function calculatePenaltyAmount(
  tier: AssessmentTier,
  role: AssessmentRole,
  totalAmount: number
): number {
  if (tier === 'tier1') {
    const rule = ASSESSMENT_RULES.tier1;
    return role === 'marketer' ? rule.marketerAmount : rule.supervisorAmount;
  }
  if (tier === 'tier2') {
    const rule = ASSESSMENT_RULES.tier2;
    return role === 'marketer' ? rule.marketerAmount : rule.supervisorAmount;
  }
  if (tier === 'tier3') {
    const rule = ASSESSMENT_RULES.tier3;
    const ratio = role === 'marketer' ? rule.marketerRatio : rule.supervisorRatio;
    return Math.round(totalAmount * ratio * 100) / 100;
  }

  return 0;
}

/**
 * 插入考核记录（幂等：ON CONFLICT DO NOTHING）
 */
async function insertAssessmentRecord(
  taskId: number,
  tier: AssessmentTier,
  userId: number,
  userName: string,
  role: AssessmentRole,
  baseAmount: number,
  overdueDays: number,
  penaltyAmount: number,
  rule: typeof ASSESSMENT_RULES[AssessmentTier]
): Promise<void> {
  await appQuery(
    `INSERT INTO ar_assessment_records (
      task_id, assessment_tier, assessment_user_id, assessment_user_name,
      assessment_role, base_amount, overdue_days, penalty_amount,
      assessment_rule_snapshot, calculated_at, status
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW(), 'pending')
    ON CONFLICT (task_id, assessment_tier, assessment_user_id) DO NOTHING`,
    [
      taskId,
      tier,
      userId,
      userName,
      role,
      baseAmount,
      overdueDays,
      penaltyAmount,
      JSON.stringify({
        tier,
        ruleName: rule.name,
        ...rule,
      }),
    ]
  );
}
