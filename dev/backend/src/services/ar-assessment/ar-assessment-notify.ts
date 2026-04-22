/**
 * 催收考核钉钉通知服务
 * 只在考核生成时推送一次通知，按角色生成不同的消息内容
 */

import { appQuery } from '../../db/appPool';
import { sendWorkNotification } from '../dingtalk.service';
import type { ActionCardContent } from '../dingtalk.service';
import {
  TIER_NAMES,
  NEXT_TIER_WARNING,
  MAX_TIER_WARNING,
  type AssessmentTier,
  type AssessmentRole,
  type AssessmentRecord,
} from './ar-assessment.types';

/** 推送跳转地址 */
const ACTION_URL = 'https://xly.gzzxd.com/collection/assessment';

/**
 * 格式化金额
 */
function formatAmount(amount: number | null): string {
  if (amount === null || amount === undefined) return '¥0.00';
  return `¥${Number(amount).toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/**
 * 根据用户ID查询钉钉用户ID
 */
async function getDingtalkUserIds(userIds: number[]): Promise<string[]> {
  if (!userIds || userIds.length === 0) return [];

  try {
    const placeholders = userIds.map((_, i) => `$${i + 1}`).join(',');
    const result = await appQuery<{ dingtalk_user_id: string }>(
      `SELECT dingtalk_user_id FROM users
       WHERE id IN (${placeholders}) AND status = 1 AND dingtalk_user_id IS NOT NULL`,
      userIds
    );
    return result.rows
      .map(row => row.dingtalk_user_id)
      .filter(id => id && id !== 'dev_admin');
  } catch (error) {
    console.error('[ArAssessmentNotify] 查询钉钉用户ID失败:', error);
    return [];
  }
}

/**
 * 构建考核生成通知的 ActionCard 消息（按角色生成不同内容）
 */
function buildAssessmentCreatedActionCard(
  records: AssessmentRecord[],
  role: AssessmentRole
): ActionCardContent {
  // 构建表格行
  const tableRows = records.map(r => {
    const tierName = TIER_NAMES[r.assessmentTier];
    return `| ${tierName} | ${r.consumerName || '-'} | ${r.taskNo || '-'} | ${r.overdueDays}天 | ${formatAmount(r.penaltyAmount)} |`;
  }).join('\n');

  // 合计金额
  const totalAmount = records.reduce((sum, r) => sum + r.penaltyAmount, 0);

  // 找最高层级（tier3 > tier2 > tier1）
  const tierOrder: AssessmentTier[] = ['tier3', 'tier2', 'tier1'];
  const maxTier = tierOrder.find(t => records.some(r => r.assessmentTier === t)) || 'tier1';

  // 生成预告文案
  const warningConfig = NEXT_TIER_WARNING[maxTier];
  let warningText: string;
  if (warningConfig) {
    warningText = warningConfig[role];
  } else {
    warningText = MAX_TIER_WARNING;
  }

  const markdown = `您有以下催收考核记录，请尽快处理：

| 层级 | 客户名称 | 任务编号 | 超时天数 | 考核金额 |
|------|---------|---------|---------|---------|
${tableRows}

> 本次新增考核合计：${formatAmount(totalAmount)}

⚠️ 请尽快处理催收任务，避免触发更高级别考核：
${warningText}`;

  return {
    title: `【催收考核】您有 ${records.length} 条新增考核记录`,
    markdown,
    singleTitle: '查看详情',
    singleUrl: ACTION_URL,
  };
}

/**
 * 发送考核生成通知（按用户+角色分组）
 */
export async function sendAssessmentCreatedNotifications(
  records: AssessmentRecord[]
): Promise<void> {
  if (!records || records.length === 0) {
    console.log('[ArAssessmentNotify] 无新增考核记录，跳过通知');
    return;
  }

  // 按 (assessment_user_id, assessment_role) 分组
  const userGroupMap = new Map<string, { userId: number; role: AssessmentRole; records: AssessmentRecord[] }>();

  for (const record of records) {
    const key = `${record.assessmentUserId}:${record.assessmentRole}`;
    const existing = userGroupMap.get(key);
    if (existing) {
      existing.records.push(record);
    } else {
      userGroupMap.set(key, {
        userId: record.assessmentUserId,
        role: record.assessmentRole as AssessmentRole,
        records: [record],
      });
    }
  }

  // 收集所有用户ID用于批量查询钉钉ID
  const allUserIds = Array.from(userGroupMap.values()).map(g => g.userId);
  const dingtalkIdMap = new Map<number, string>();

  if (allUserIds.length > 0) {
    const dingtalkResult = await appQuery<{ id: number; dingtalk_user_id: string }>(
      `SELECT id, dingtalk_user_id FROM users
       WHERE id = ANY($1) AND status = 1 AND dingtalk_user_id IS NOT NULL`,
      [allUserIds]
    );
    for (const row of dingtalkResult.rows) {
      if (row.dingtalk_user_id && row.dingtalk_user_id !== 'dev_admin') {
        dingtalkIdMap.set(row.id, row.dingtalk_user_id);
      }
    }
  }

  // 逐用户发送通知
  let sentCount = 0;
  for (const [, group] of userGroupMap) {
    const dingtalkId = dingtalkIdMap.get(group.userId);
    if (!dingtalkId) {
      console.warn(`[ArAssessmentNotify] 用户 ${group.userId} 未绑定钉钉，跳过通知`);
      continue;
    }

    try {
      const actionCard = buildAssessmentCreatedActionCard(group.records, group.role);
      // 使用第一条记录的业务信息
      const firstRecord = group.records[0];

      await sendWorkNotification([dingtalkId], actionCard.title, '', {
        msgType: 'actionCard',
        actionCard,
        businessType: 'ar_assessment',
        businessId: firstRecord.taskId,
        businessNo: firstRecord.taskNo,
      });
      sentCount++;
    } catch (err) {
      console.error(`[ArAssessmentNotify] 发送通知失败: userId=${group.userId}`, err);
    }
  }

  console.log(`[ArAssessmentNotify] 发送完成: ${sentCount}/${userGroupMap.size}`);
}

/**
 * 发送考核生成通知入口（定时任务调用）
 */
export async function notifyAssessmentCreated(
  createdCount: number
): Promise<void> {
  if (createdCount === 0) return;

  try {
    // 查询今天创建的 pending 记录
    const result = await appQuery<any>(
      `SELECT
        a.id,
        a.task_id,
        a.assessment_tier,
        a.assessment_user_id,
        a.assessment_user_name,
        a.assessment_role,
        a.base_amount,
        a.overdue_days,
        a.penalty_amount,
        a.assessment_rule_snapshot,
        a.status,
        a.calculated_at,
        a.created_at,
        a.updated_at,
        t.task_no,
        t.consumer_name
      FROM ar_assessment_records a
      LEFT JOIN ar_collection_tasks t ON a.task_id = t.id
      WHERE a.created_at::date = CURRENT_DATE
        AND a.status = 'pending'
      ORDER BY a.assessment_user_id, a.assessment_tier`
    );

    if (result.rows.length === 0) return;

    // 转换为 AssessmentRecord
    const records: AssessmentRecord[] = result.rows.map((row: any) => ({
      id: row.id,
      taskId: row.task_id,
      taskNo: row.task_no,
      consumerName: row.consumer_name,
      assessmentTier: row.assessment_tier,
      assessmentUserId: row.assessment_user_id,
      assessmentUserName: row.assessment_user_name,
      assessmentRole: row.assessment_role,
      baseAmount: parseFloat(row.base_amount) || 0,
      overdueDays: row.overdue_days,
      penaltyAmount: parseFloat(row.penalty_amount) || 0,
      assessmentRuleSnapshot: row.assessment_rule_snapshot
        ? (typeof row.assessment_rule_snapshot === 'string'
          ? JSON.parse(row.assessment_rule_snapshot)
          : row.assessment_rule_snapshot)
        : null,
      status: row.status,
      handleRemark: row.handle_remark,
      handledBy: row.handled_by,
      handledAt: row.handled_at,
      calculatedAt: row.calculated_at,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }));

    await sendAssessmentCreatedNotifications(records);
  } catch (error) {
    console.error('[ArAssessmentNotify] 发送考核通知失败:', error);
  }
}
