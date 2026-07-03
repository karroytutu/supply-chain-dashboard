/**
 * OA节点超时考核规则
 * 基于节点 deadline_at 计算超时天数，按阶梯固定金额考核
 * @module services/oa/timeout/oa-timeout-assessment
 */

import {
  registerAssessmentRule,
  DEFAULT_ALLOWED_TRANSITIONS,
  DEFAULT_STATUS_LABELS,
} from '../../assessment/assessment.rules';
import type {
  CalculationContext,
  CalculationResult,
  AssessmentRecordRow,
  NotificationContent,
} from '../../assessment/assessment.types';
import * as repository from './oa-timeout.repository';
import type { OverdueNode } from './oa-timeout.types';

const MS_PER_DAY = 86400000;

// ==================== 通知构建 ====================

function buildTimeoutNotification(
  records: AssessmentRecordRow[],
  _role: string
): NotificationContent {
  const totalAmount = records.reduce((sum, r) => sum + parseFloat(r.penalty_amount || '0'), 0);

  const tableRows = records
    .map(r => {
      const snapshot = r.rule_snapshot as Record<string, unknown> | null;
      return `| ${r.source_name || '-'} | ${snapshot?.overdue_days || '-'}天 | ¥${parseFloat(r.penalty_amount).toFixed(2)} |`;
    })
    .join('\n');

  const markdown = `### OA节点超时考核

您有 ${records.length} 条审批节点超时考核记录：

| 节点名称 | 超时天数 | 考核金额 |
|----------|----------|----------|
${tableRows}

> 本次考核合计：¥${totalAmount.toFixed(2)}

请及时处理待办审批事项，避免继续产生超时考核。

---
推送时间：${new Date().toLocaleString('zh-CN')}`;

  return {
    title: `【超时考核】您有 ${records.length} 条审批节点超时考核`,
    markdown,
  };
}

// ==================== 规则注册 ====================

registerAssessmentRule({
  category: 'oa_node_timeout',
  ruleType: 'node_timeout',
  name: 'OA节点超时考核',
  description: '基于节点 deadline_at 计算超时天数，按阶梯固定金额考核',
  triggerMode: 'scheduled',
  calculationModel: 'fixed_amount',
  allowedTransitions: DEFAULT_ALLOWED_TRANSITIONS,
  statusLabels: DEFAULT_STATUS_LABELS,
  sourceType: 'oa_approval_node',
  sourceLabel: 'OA审批节点',

  calculate: async (_ctx: CalculationContext): Promise<CalculationResult[]> => {
    // 1. 查询所有配置了 assessment 的超时 pending 节点
    const overdueNodes = await repository.getOverdueNodesWithAssessment();
    if (overdueNodes.length === 0) return [];

    const results: CalculationResult[] = [];

    for (const node of overdueNodes) {
      const assessmentCfg = node.timeout_config?.assessment;
      if (!assessmentCfg || !assessmentCfg.tiers || assessmentCfg.tiers.length === 0) continue;

      // 跳过免考核节点
      if (assessmentCfg.exemptNodeNames?.includes(node.node_name)) continue;

      // 计算超时天数
      const overdueMs = Date.now() - new Date(node.deadline_at!).getTime();
      const overdueDays = Math.floor(overdueMs / MS_PER_DAY);

      // 跳过宽限期（gracePeriodMinutes 转换为天）
      const graceMinutes = node.timeout_config?.gracePeriodMinutes ?? 0;
      if (overdueMs < graceMinutes * 60000) continue;

      // 匹配阶梯
      const tier = assessmentCfg.tiers.find(t =>
        overdueDays >= t.minOverdueDays &&
        (t.maxOverdueDays === null || overdueDays < t.maxOverdueDays)
      );

      if (!tier) continue; // 未匹配任何阶梯，不考核

      results.push({
        category: 'oa_node_timeout',
        rule_type: 'node_timeout',
        source_type: 'oa_approval_node',
        source_id: node.id,
        source_no: node.instance_no,
        source_name: node.node_name,
        assessment_user_id: node.assigned_user_ids?.[0] ?? 0,
        assessment_user_name: node.first_assigned_user_name || '',
        assessment_role: 'operator',
        base_amount: 0,
        penalty_rate: 0,
        overdue_days: overdueDays,
        penalty_amount: tier.penaltyAmount,
        oa_instance_id: node.instance_id,
        rule_snapshot: {
          tier_name: tier.name,
          tiers: assessmentCfg.tiers,
          instance_no: node.instance_no,
        },
      });
    }

    return results;
  },

  buildNotification: buildTimeoutNotification,
});
