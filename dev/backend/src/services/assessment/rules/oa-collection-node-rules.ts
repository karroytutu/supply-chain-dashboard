/**
 * OA催收节点考核规则实现
 * @module services/assessment/rules/oa-collection-node-rules
 *
 * 基于 OA 审批节点的独立考核（替代旧的 ar_collection_tasks 考核）：
 * - 每个节点只考核该节点负责人
 * - 基于节点创建时间(created_at)独立计算超时
 * - L0/L2: 3-5天¥10, 5-7天¥20, 7天+全额
 * - L1: 3-5天¥50, 5-7天¥100, 7天+全额
 * - 差异处理/发函: 同L2标准
 * - 起诉节点: 无时限不考核
 */

import {
  registerAssessmentRule,
  DEFAULT_ALLOWED_TRANSITIONS,
  DEFAULT_STATUS_LABELS,
} from '../assessment.rules';
import type {
  CalculationContext,
  CalculationResult,
  AssessmentRecordRow,
  NotificationContent,
} from '../assessment.types';
import { appQuery } from '../../../db/appPool';
import { ROLE_CODES } from '../../../utils/constants';

// ==================== 内部类型 ====================

/** 未完成的OA催收节点 */
interface PendingOaNode {
  node_id: number;
  instance_id: number;
  instance_no: string;
  node_name: string;
  role_code: string;
  assigned_user_id: number | null;
  assigned_user_name: string | null;
  created_at: Date;
  form_data_total_amount: string | null;
  consumer_name: string | null;
}

/** 已有考核记录（用于去重） */
interface ExistingRecord {
  source_id: number;
  rule_type: string;
  assessment_user_id: number;
}

// ==================== 考核标准配置 ====================

interface TierConfig {
  minDays: number;
  maxDays: number | null; // null = 无上限
  amount: number | null;  // null = 按比例
  ratio: number | null;   // null = 固定金额
  name: string;
}

/** 各角色的考核标准 */
const ROLE_TIER_CONFIG: Record<string, TierConfig[]> = {
  // L0 营销师 / L2 财务 / 差异处理 / 发函（相同标准）
  [ROLE_CODES.MARKETER]: [
    { minDays: 3, maxDays: 5, amount: 10, ratio: null, name: '一级考核(3-5天)' },
    { minDays: 5, maxDays: 7, amount: 20, ratio: null, name: '二级考核(5-7天)' },
    { minDays: 7, maxDays: null, amount: null, ratio: 1.0, name: '三级考核(7天+)' },
  ],
  [ROLE_CODES.CURRENT_ACCOUNTANT]: [
    { minDays: 3, maxDays: 5, amount: 10, ratio: null, name: '一级考核(3-5天)' },
    { minDays: 5, maxDays: 7, amount: 20, ratio: null, name: '二级考核(5-7天)' },
    { minDays: 7, maxDays: null, amount: null, ratio: 1.0, name: '三级考核(7天+)' },
  ],
  // L1 营销经理（更高标准）
  [ROLE_CODES.MARKETING_MANAGER]: [
    { minDays: 3, maxDays: 5, amount: 50, ratio: null, name: '一级考核(3-5天)' },
    { minDays: 5, maxDays: 7, amount: 100, ratio: null, name: '二级考核(5-7天)' },
    { minDays: 7, maxDays: null, amount: null, ratio: 1.0, name: '三级考核(7天+)' },
  ],
};

/** 不考核的节点角色/名称 */
const EXEMPT_NODE_NAMES = ['起诉立案', '庭审进展', '判决结果', '执行进展', '更新催收状态'];

// ==================== 共用查询 ====================

/** 查询未完成的OA催收节点 */
async function queryPendingOaNodes(): Promise<PendingOaNode[]> {
  const result = await appQuery<PendingOaNode>(
    `SELECT
       n.id AS node_id,
       n.instance_id,
       i.instance_no,
       n.node_name,
       n.role_code,
       n.assigned_user_id,
       n.assigned_user_name,
       n.created_at,
       i.form_data->>'totalAmount' AS form_data_total_amount,
       i.form_data->>'consumerName' AS consumer_name
     FROM oa_approval_nodes n
     JOIN oa_approval_instances i ON n.instance_id = i.id
     JOIN oa_form_types ft ON i.form_type_id = ft.id
     WHERE ft.code = 'ar_collection'
       AND n.status = 'pending'
       AND n.node_type = 'role'
       AND n.assigned_user_id IS NOT NULL
       AND n.created_at IS NOT NULL`
  );
  return result.rows;
}

/** 查询已有考核记录（去重） */
async function queryExistingRecords(sourceIds: number[], ruleType: string): Promise<Set<string>> {
  if (sourceIds.length === 0) return new Set();
  const result = await appQuery<ExistingRecord>(
    `SELECT source_id, rule_type, assessment_user_id
     FROM assessment_records
     WHERE source_id = ANY($1) AND rule_type = $2 AND category = 'oa_collection'`,
    [sourceIds, ruleType]
  );
  return new Set(result.rows.map(r => `${r.source_id}:${r.assessment_user_id}`));
}

/**
 * 批量查询已有考核记录（支持多 rule_type，避免 N+1）
 * 返回 Set<`${rule_type}:${source_id}:${assessment_user_id}`>
 */
async function queryExistingRecordsBatch(
  sourceIds: number[],
  ruleTypes: string[]
): Promise<Set<string>> {
  if (sourceIds.length === 0 || ruleTypes.length === 0) return new Set();
  const result = await appQuery<ExistingRecord>(
    `SELECT source_id, rule_type, assessment_user_id
     FROM assessment_records
     WHERE source_id = ANY($1) AND rule_type = ANY($2) AND category = 'oa_collection'`,
    [sourceIds, ruleTypes]
  );
  return new Set(result.rows.map(r => `${r.rule_type}:${r.source_id}:${r.assessment_user_id}`));
}

/** 计算超时天数（自然日） */
function calculateOverdueDays(createdAt: Date): number {
  const diffMs = Date.now() - new Date(createdAt).getTime();
  return Math.floor(diffMs / 86400000);
}

// ==================== 通知构建 ====================

function buildOaNodeNotification(records: AssessmentRecordRow[], role: string): NotificationContent {
  const totalAmount = records.reduce((sum, r) => sum + parseFloat(r.penalty_amount || '0'), 0);
  const roleName = role === 'marketer' ? '营销师'
    : role === 'marketing_manager' ? '营销经理'
    : role === 'current_accountant' ? '财务'
    : role;

  const tableRows = records
    .map(r => `| ${r.source_no || '-'} | ${r.source_name || '-'} | ${r.overdue_days}天 | ¥${parseFloat(r.penalty_amount).toFixed(2)} |`)
    .join('\n');

  const markdown = `### OA催收考核通知\n\n${roleName}，您有 ${records.length} 条新增考核记录：\n\n| 实例编号 | 客户名称 | 超时天数 | 考核金额 |\n|----------|----------|----------|----------|\n${tableRows}\n\n> 本次考核合计：¥${totalAmount.toFixed(2)}`;

  return {
    title: `【OA催收考核】您有 ${records.length} 条新增考核记录`,
    markdown,
  };
}

// ==================== 注册规则 ====================

registerAssessmentRule({
  category: 'oa_collection',
  ruleType: 'oa_node_timeout',
  name: 'OA催收节点超时考核',
  description: '基于OA审批节点创建时间计算超时，按角色分级考核',
  triggerMode: 'scheduled',
  calculationModel: 'fixed_amount',
  allowedTransitions: DEFAULT_ALLOWED_TRANSITIONS,
  statusLabels: DEFAULT_STATUS_LABELS,
  sourceType: 'oa_approval_node',
  sourceLabel: 'OA催收节点',

  calculate: async (_ctx: CalculationContext): Promise<CalculationResult[]> => {
    const nodes = await queryPendingOaNodes();
    if (nodes.length === 0) return [];

    const sourceIds = nodes.map(n => n.node_id);

    // 预查询所有 tier 类型的已有记录（避免 N+1）
    const allTierRuleTypes = Object.values(ROLE_TIER_CONFIG)
      .flat()
      .map(t => `oa_node_${t.name}`);
    const uniqueRuleTypes = [...new Set(allTierRuleTypes)];
    const existingBatch = await queryExistingRecordsBatch(sourceIds, uniqueRuleTypes);

    const results: CalculationResult[] = [];

    for (const node of nodes) {
      // 跳过不考核的节点
      if (EXEMPT_NODE_NAMES.includes(node.node_name)) continue;
      if (!node.assigned_user_id) continue;

      const overdueDays = calculateOverdueDays(node.created_at);
      if (overdueDays < 3) continue; // 3天内不考核

      const roleCode = node.role_code || '';
      const tierConfigs = ROLE_TIER_CONFIG[roleCode];
      if (!tierConfigs) continue; // 无对应考核标准

      // 确定当前处于哪个考核级别
      for (const tier of tierConfigs) {
        if (overdueDays < tier.minDays) continue;
        if (tier.maxDays !== null && overdueDays >= tier.maxDays) continue;

        const ruleTypeKey = `oa_node_${tier.name}`;
        const dedupeKey = `${ruleTypeKey}:${node.node_id}:${node.assigned_user_id}`;

        // 使用预查询的结果去重
        if (existingBatch.has(dedupeKey)) continue;

        const totalAmount = parseFloat(node.form_data_total_amount || '0');
        let penaltyAmount: number;

        if (tier.ratio !== null) {
          penaltyAmount = Math.round(totalAmount * tier.ratio * 100) / 100;
        } else {
          penaltyAmount = tier.amount!;
        }

        results.push({
          category: 'oa_collection',
          rule_type: ruleTypeKey,
          source_type: 'oa_approval_node',
          source_id: node.node_id,
          source_no: node.instance_no,
          source_name: node.consumer_name || '',
          assessment_user_id: node.assigned_user_id,
          assessment_user_name: node.assigned_user_name || '',
          assessment_role: roleCode as any,
          base_amount: totalAmount,
          penalty_rate: tier.ratio || 0,
          overdue_days: overdueDays,
          penalty_amount: penaltyAmount,
          rule_snapshot: {
            tier: tier.name,
            nodeRole: roleCode,
            nodeName: node.node_name,
          },
        });
      }
    }

    return results;
  },

  buildNotification: buildOaNodeNotification,
});
