/**
 * 催收考核规则实现（3条规则）
 * 从 ar-assessment-calculate.ts 迁移到统一规则框架
 *
 * 规则说明：
 * - tier1(3-5天): 营销师 10元/任务, 营销经理 20元/任务（固定金额）
 * - tier2(5-7天): 营销师 20元/任务, 营销经理 40元/任务（固定金额，累加到 tier1）
 * - tier3(7天以上): 营销师 按欠款70%, 营销经理 按欠款30%（比例）
 */

import { registerAssessmentRule, DEFAULT_ALLOWED_TRANSITIONS, DEFAULT_STATUS_LABELS } from '../assessment.rules';
import type { CalculationContext, CalculationResult, AssessmentRecordRow, NotificationContent } from '../assessment.types';
import { getUsersByRole } from '../utils';
import { AR_ASSESSMENT_EFFECTIVE_DATE } from '../../../utils/constants';
import { appQuery } from '../../../db/appPool';

// ==================== 内部类型 ====================

/** 活跃催收任务行 */
interface ActiveTask {
  id: number;
  task_no: string;
  consumer_name: string;
  manager_user_id: number | null;
  manager_user_name: string | null;
  total_amount: string;
  assessment_start_time: Date;
}

/** 已有考核记录（用于去重） */
interface ExistingRecord {
  source_id: number;
  rule_type: string;
  assessment_user_id: number;
}

// ==================== 常量 ====================

/** 考核生效日期 */
const EFFECTIVE_DATE = new Date(AR_ASSESSMENT_EFFECTIVE_DATE);

/** 催收考核规则配置 */
const AR_TIER_CONFIG = {
  tier1: { name: '一级考核(3-5天)', minDays: 3, maxDays: 5, marketerAmount: 10, supervisorAmount: 20 },
  tier2: { name: '二级考核(5-7天)', minDays: 5, maxDays: 7, marketerAmount: 20, supervisorAmount: 40 },
  tier3: { name: '三级考核(7天以上)', minDays: 7, maxDays: null, marketerRatio: 0.7, supervisorRatio: 0.3 },
} as const;

// ==================== 共用查询逻辑 ====================

/**
 * 查询活跃待考核催收任务
 */
async function queryActiveTasks(): Promise<ActiveTask[]> {
  const result = await appQuery<ActiveTask>(
    `SELECT id, task_no, consumer_name, manager_user_id, manager_user_name,
            total_amount, assessment_start_time
     FROM ar_collection_tasks
     WHERE status IN ('collecting', 'escalated', 'difference_processing')
       AND assessment_start_time IS NOT NULL
       AND created_at >= $1`,
    [EFFECTIVE_DATE]
  );
  return result.rows;
}

/**
 * 查询已有统一考核记录（去重用）
 */
async function queryExistingRecords(sourceIds: number[], ruleType: string): Promise<Set<string>> {
  if (sourceIds.length === 0) return new Set();

  const result = await appQuery<ExistingRecord>(
    `SELECT source_id, rule_type, assessment_user_id
     FROM assessment_records
     WHERE source_id = ANY($1) AND rule_type = $2 AND category = 'ar_collection'`,
    [sourceIds, ruleType]
  );

  return new Set(result.rows.map(r => `${r.source_id}:${r.assessment_user_id}`));
}

/**
 * 计算超时天数（以生效日期与实际开始时间的较大值作为起点）
 */
function calculateOverdueDays(assessmentStartTime: Date): number {
  const startTime = new Date(assessmentStartTime);
  const effectiveStartTime = startTime.getTime() < EFFECTIVE_DATE.getTime()
    ? EFFECTIVE_DATE
    : startTime;
  const diffMs = Date.now() - effectiveStartTime.getTime();
  return Math.floor(diffMs / 86400000);
}

// ==================== 通知构建 ====================

/**
 * 构建催收考核通知内容
 */
function buildArNotification(records: AssessmentRecordRow[], role: string): NotificationContent {
  const totalAmount = records.reduce((sum, r) => sum + parseFloat(r.penalty_amount || '0'), 0);
  const roleName = role === 'marketer' ? '营销师' : '营销经理';

  const tableRows = records.map(r => {
    return `| ${r.source_no || '-'} | ${r.source_name || '-'} | ${r.overdue_days}天 | ¥${parseFloat(r.penalty_amount).toFixed(2)} |`;
  }).join('\n');

  const markdown = `### 催收考核通知

${roleName}，您有 ${records.length} 条新增考核记录：

| 任务编号 | 客户名称 | 超时天数 | 考核金额 |
|----------|----------|----------|----------|
${tableRows}

> 本次考核合计：¥${totalAmount.toFixed(2)}

请尽快处理催收任务，避免触发更高级别考核。

---
推送时间：${new Date().toLocaleString('zh-CN')}`;

  return {
    title: `【催收考核】您有 ${records.length} 条新增考核记录`,
    markdown,
  };
}

// ==================== tier1 规则 ====================

registerAssessmentRule({
  category: 'ar_collection',
  ruleType: 'tier1',
  name: AR_TIER_CONFIG.tier1.name,
  description: '催收任务超时3-5天，营销师考核10元/任务，营销经理考核20元/任务',
  triggerMode: 'scheduled',
  calculationModel: 'fixed_amount',
  allowedTransitions: DEFAULT_ALLOWED_TRANSITIONS,
  statusLabels: DEFAULT_STATUS_LABELS,
  sourceType: 'ar_collection_task',
  sourceLabel: '催收任务',

  calculate: async (ctx: CalculationContext): Promise<CalculationResult[]> => {
    const config = AR_TIER_CONFIG.tier1;
    const tasks = await queryActiveTasks();
    if (tasks.length === 0) return [];

    const sourceIds = tasks.map(t => t.id);
    const existingSet = await queryExistingRecords(sourceIds, 'tier1');
    const supervisors = await getUsersByRole('marketing_manager');
    const results: CalculationResult[] = [];

    for (const task of tasks) {
      const overdueDays = calculateOverdueDays(task.assessment_start_time);
      if (overdueDays < config.minDays || overdueDays >= config.maxDays) continue;

      const totalAmount = parseFloat(task.total_amount) || 0;

      // 营销师记录
      if (task.manager_user_id && !existingSet.has(`${task.id}:${task.manager_user_id}`)) {
        results.push({
          category: 'ar_collection',
          rule_type: 'tier1',
          source_type: 'ar_collection_task',
          source_id: task.id,
          source_no: task.task_no,
          source_name: task.consumer_name,
          assessment_user_id: task.manager_user_id,
          assessment_user_name: task.manager_user_name || '',
          assessment_role: 'marketer',
          base_amount: totalAmount,
          penalty_rate: 0,
          overdue_days: overdueDays,
          penalty_amount: config.marketerAmount,
          rule_snapshot: { tier: 'tier1', ruleName: config.name, marketerAmount: config.marketerAmount },
        });
      }

      // 营销经理记录
      for (const supervisor of supervisors) {
        if (!existingSet.has(`${task.id}:${supervisor.id}`)) {
          results.push({
            category: 'ar_collection',
            rule_type: 'tier1',
            source_type: 'ar_collection_task',
            source_id: task.id,
            source_no: task.task_no,
            source_name: task.consumer_name,
            assessment_user_id: supervisor.id,
            assessment_user_name: supervisor.name,
            assessment_role: 'marketing_manager',
            base_amount: totalAmount,
            penalty_rate: 0,
            overdue_days: overdueDays,
            penalty_amount: config.supervisorAmount,
            rule_snapshot: { tier: 'tier1', ruleName: config.name, supervisorAmount: config.supervisorAmount },
          });
        }
      }
    }

    return results;
  },

  buildNotification: buildArNotification,
});

// ==================== tier2 规则 ====================

registerAssessmentRule({
  category: 'ar_collection',
  ruleType: 'tier2',
  name: AR_TIER_CONFIG.tier2.name,
  description: '催收任务超时5-7天，营销师考核20元/任务，营销经理考核40元/任务',
  triggerMode: 'scheduled',
  calculationModel: 'fixed_amount',
  allowedTransitions: DEFAULT_ALLOWED_TRANSITIONS,
  statusLabels: DEFAULT_STATUS_LABELS,
  sourceType: 'ar_collection_task',
  sourceLabel: '催收任务',

  calculate: async (ctx: CalculationContext): Promise<CalculationResult[]> => {
    const config = AR_TIER_CONFIG.tier2;
    const tasks = await queryActiveTasks();
    if (tasks.length === 0) return [];

    const sourceIds = tasks.map(t => t.id);
    const existingSet = await queryExistingRecords(sourceIds, 'tier2');
    const supervisors = await getUsersByRole('marketing_manager');
    const results: CalculationResult[] = [];

    for (const task of tasks) {
      const overdueDays = calculateOverdueDays(task.assessment_start_time);
      if (overdueDays < config.minDays || overdueDays >= config.maxDays) continue;

      const totalAmount = parseFloat(task.total_amount) || 0;

      // 营销师记录
      if (task.manager_user_id && !existingSet.has(`${task.id}:${task.manager_user_id}`)) {
        results.push({
          category: 'ar_collection',
          rule_type: 'tier2',
          source_type: 'ar_collection_task',
          source_id: task.id,
          source_no: task.task_no,
          source_name: task.consumer_name,
          assessment_user_id: task.manager_user_id,
          assessment_user_name: task.manager_user_name || '',
          assessment_role: 'marketer',
          base_amount: totalAmount,
          penalty_rate: 0,
          overdue_days: overdueDays,
          penalty_amount: config.marketerAmount,
          rule_snapshot: { tier: 'tier2', ruleName: config.name, marketerAmount: config.marketerAmount },
        });
      }

      // 营销经理记录
      for (const supervisor of supervisors) {
        if (!existingSet.has(`${task.id}:${supervisor.id}`)) {
          results.push({
            category: 'ar_collection',
            rule_type: 'tier2',
            source_type: 'ar_collection_task',
            source_id: task.id,
            source_no: task.task_no,
            source_name: task.consumer_name,
            assessment_user_id: supervisor.id,
            assessment_user_name: supervisor.name,
            assessment_role: 'marketing_manager',
            base_amount: totalAmount,
            penalty_rate: 0,
            overdue_days: overdueDays,
            penalty_amount: config.supervisorAmount,
            rule_snapshot: { tier: 'tier2', ruleName: config.name, supervisorAmount: config.supervisorAmount },
          });
        }
      }
    }

    return results;
  },

  buildNotification: buildArNotification,
});

// ==================== tier3 规则 ====================

registerAssessmentRule({
  category: 'ar_collection',
  ruleType: 'tier3',
  name: AR_TIER_CONFIG.tier3.name,
  description: '催收任务超时7天以上，营销师按欠款70%考核，营销经理按欠款30%考核',
  triggerMode: 'scheduled',
  calculationModel: 'ratio',
  allowedTransitions: DEFAULT_ALLOWED_TRANSITIONS,
  statusLabels: DEFAULT_STATUS_LABELS,
  sourceType: 'ar_collection_task',
  sourceLabel: '催收任务',

  calculate: async (ctx: CalculationContext): Promise<CalculationResult[]> => {
    const config = AR_TIER_CONFIG.tier3;
    const tasks = await queryActiveTasks();
    if (tasks.length === 0) return [];

    const sourceIds = tasks.map(t => t.id);
    const existingSet = await queryExistingRecords(sourceIds, 'tier3');
    const supervisors = await getUsersByRole('marketing_manager');
    const results: CalculationResult[] = [];

    for (const task of tasks) {
      const overdueDays = calculateOverdueDays(task.assessment_start_time);
      if (overdueDays < config.minDays) continue;

      const totalAmount = parseFloat(task.total_amount) || 0;

      // 营销师记录：按欠款金额 70% 考核
      if (task.manager_user_id && !existingSet.has(`${task.id}:${task.manager_user_id}`)) {
        const penaltyAmount = Math.round(totalAmount * config.marketerRatio * 100) / 100;
        results.push({
          category: 'ar_collection',
          rule_type: 'tier3',
          source_type: 'ar_collection_task',
          source_id: task.id,
          source_no: task.task_no,
          source_name: task.consumer_name,
          assessment_user_id: task.manager_user_id,
          assessment_user_name: task.manager_user_name || '',
          assessment_role: 'marketer',
          base_amount: totalAmount,
          penalty_rate: config.marketerRatio,
          overdue_days: overdueDays,
          penalty_amount: penaltyAmount,
          rule_snapshot: { tier: 'tier3', ruleName: config.name, marketerRatio: config.marketerRatio },
        });
      }

      // 营销经理记录：按欠款金额 30% 考核
      for (const supervisor of supervisors) {
        if (!existingSet.has(`${task.id}:${supervisor.id}`)) {
          const penaltyAmount = Math.round(totalAmount * config.supervisorRatio * 100) / 100;
          results.push({
            category: 'ar_collection',
            rule_type: 'tier3',
            source_type: 'ar_collection_task',
            source_id: task.id,
            source_no: task.task_no,
            source_name: task.consumer_name,
            assessment_user_id: supervisor.id,
            assessment_user_name: supervisor.name,
            assessment_role: 'marketing_manager',
            base_amount: totalAmount,
            penalty_rate: config.supervisorRatio,
            overdue_days: overdueDays,
            penalty_amount: penaltyAmount,
            rule_snapshot: { tier: 'tier3', ruleName: config.name, supervisorRatio: config.supervisorRatio },
          });
        }
      }
    }

    return results;
  },

  buildNotification: buildArNotification,
});
