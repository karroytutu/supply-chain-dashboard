/**
 * 营业执照补交超时考核规则
 * 授信审批通过后7天内未补交营业执照，逾期期间按10元/天考核营销员
 * @module services/assessment/rules/credit-license-rules
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
import {
  CREDIT_LICENSE_PENALTY_PER_DAY,
  CREDIT_LICENSE_DEFERRED_DEADLINE_DAYS,
} from '../../../utils/constants';
import { appQuery } from '../../../db/appPool';
import * as deferredRepository from '../../credit-license/credit-license.repository';

// ==================== 通知构建 ====================

/**
 * 构建执照考核通知内容
 */
function buildCreditLicenseNotification(
  records: AssessmentRecordRow[],
  _role: string
): NotificationContent {
  const totalAmount = records.reduce((sum, r) => sum + parseFloat(r.penalty_amount || '0'), 0);

  const tableRows = records
    .map(r => {
      return `| ${r.source_name || '-'} | ${r.overdue_days || '-'}天 | ¥${parseFloat(r.penalty_amount).toFixed(2)} |`;
    })
    .join('\n');

  const markdown = `### 营业执照补交超时考核

您有 ${records.length} 条营业执照补交超时考核记录：

| 客户名称 | 逾期天数 | 考核金额 |
|----------|----------|----------|
${tableRows}

> 本次考核合计：¥${totalAmount.toFixed(2)}

请尽快补交营业执照，考核将持续累计直到上传为止。

---
推送时间：${new Date().toLocaleString('zh-CN')}`;

  return {
    title: `【执照考核】您有 ${records.length} 条营业执照补交超时考核`,
    markdown,
  };
}

// ==================== 规则注册 ====================

registerAssessmentRule({
  category: 'credit_license',
  ruleType: 'license_timeout',
  name: '营业执照补交超时考核',
  description: '授信审批通过后7天内未补交营业执照，逾期期间按10元/天考核营销员',
  triggerMode: 'scheduled',
  calculationModel: 'per_day',
  allowedTransitions: DEFAULT_ALLOWED_TRANSITIONS,
  statusLabels: DEFAULT_STATUS_LABELS,
  sourceType: 'credit_license_deferred',
  sourceLabel: '营业执照补交',

  calculate: async (_ctx: CalculationContext): Promise<CalculationResult[]> => {
    // 1. 查询所有 overdue 状态的延期补交记录
    const overdueRecords = await deferredRepository.getOverdueAssessmentTargets();
    if (overdueRecords.length === 0) return [];

    const results: CalculationResult[] = [];
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    for (const record of overdueRecords) {
      const deadlineDate = new Date(record.deadline);
      deadlineDate.setHours(0, 0, 0, 0);

      const diffTime = today.getTime() - deadlineDate.getTime();
      const overdueDays = Math.max(1, Math.ceil(diffTime / (1000 * 60 * 60 * 24)));
      const penaltyAmount = overdueDays * CREDIT_LICENSE_PENALTY_PER_DAY;

      // 查询审批实例编号
      const instanceResult = await appQuery<{ instance_no: string }>(
        'SELECT instance_no FROM oa_approval_instances WHERE id = $1',
        [record.oa_instance_id]
      );
      const instanceNo = instanceResult.rows[0]?.instance_no || '';

      results.push({
        category: 'credit_license',
        rule_type: 'license_timeout',
        source_type: 'credit_license_deferred',
        source_id: record.id,
        source_no: instanceNo,
        source_name: record.customer_name || '',
        assessment_user_id: record.applicant_id,
        assessment_user_name: record.applicant_name || '',
        assessment_role: 'marketer',
        base_amount: 0,
        penalty_rate: CREDIT_LICENSE_PENALTY_PER_DAY,
        overdue_days: overdueDays,
        penalty_amount: penaltyAmount,
        rule_snapshot: {
          ruleName: '营业执照补交超时考核',
          penaltyPerDay: CREDIT_LICENSE_PENALTY_PER_DAY,
          deadlineDays: CREDIT_LICENSE_DEFERRED_DEADLINE_DAYS,
          deadline: record.deadline,
          customerId: record.customer_id,
        },
      });
    }

    return results;
  },

  buildNotification: buildCreditLicenseNotification,
});
