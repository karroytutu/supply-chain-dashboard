/**
 * 统一考核管理 - 钉钉通知服务
 * 按用户分组，为每个用户构建包含所有待处理记录的通知
 */

import { getAssessmentRule } from './assessment.rules';
import { getDingtalkUserIdMap } from './utils';
import { sendWorkNotification } from '../dingtalk.service';
import type { AssessmentRecordRow, NotificationContent } from './assessment.types';
import { ASSESSMENT_CATEGORY_LABELS, ASSESSMENT_ROLE_LABELS } from './assessment.types';

/** 推送跳转地址 */
const ACTION_URL = 'https://xly.gzzxd.com/assessment';

/**
 * 格式化金额为人民币字符串
 */
function formatAmount(amount: number | string | null): string {
  if (amount === null || amount === undefined) return '¥0.00';
  return `¥${Number(amount).toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/**
 * 发送考核通知（统一入口）
 * 按 assessment_user_id 分组，为每个用户构建包含所有待处理记录的通知
 * @param records 需发送通知的考核记录
 */
export async function sendAssessmentNotifications(
  records: AssessmentRecordRow[]
): Promise<void> {
  if (records.length === 0) return;

  // 1. 按 assessment_user_id 分组
  const userGroupMap = new Map<number, AssessmentRecordRow[]>();
  for (const record of records) {
    const existing = userGroupMap.get(record.assessment_user_id) || [];
    existing.push(record);
    userGroupMap.set(record.assessment_user_id, existing);
  }

  // 2. 批量获取钉钉用户ID映射
  const allUserIds = Array.from(userGroupMap.keys());
  const dingtalkIdMap = await getDingtalkUserIdMap(allUserIds);

  // 3. 逐用户发送通知
  let sentCount = 0;
  for (const [userId, userRecords] of userGroupMap) {
    const dingtalkId = dingtalkIdMap.get(userId);
    if (!dingtalkId) {
      console.warn(`[Assessment] 用户 ${userId} 未绑定钉钉，跳过通知`);
      continue;
    }

    try {
      const userName = userRecords[0].assessment_user_name || '用户';
      const notification = buildNotificationContent(userRecords, userName);

      await sendWorkNotification(
        [dingtalkId],
        notification.title,
        notification.markdown
      );
      sentCount++;
    } catch (error) {
      console.error(`[Assessment] 发送通知失败: userId=${userId}`, error);
    }
  }

  console.log(`[Assessment] 通知发送完成: ${sentCount}/${userGroupMap.size}`);
}

/**
 * 构建通知内容（按用户分组后的记录）
 * @param userRecords 某用户的所有考核记录
 * @param userName 用户姓名
 */
function buildNotificationContent(
  userRecords: AssessmentRecordRow[],
  userName: string
): NotificationContent {
  // 按分类分组构建通知内容
  const categoryGroups = new Map<string, AssessmentRecordRow[]>();
  for (const record of userRecords) {
    const existing = categoryGroups.get(record.category) || [];
    existing.push(record);
    categoryGroups.set(record.category, existing);
  }

  // 构建 Markdown 表格
  const sections: string[] = [];
  let totalAmount = 0;

  for (const [category, groupRecords] of categoryGroups) {
    const categoryLabel = ASSESSMENT_CATEGORY_LABELS[category as keyof typeof ASSESSMENT_CATEGORY_LABELS] || category;

    const tableRows = groupRecords.map(r => {
      const rule = getAssessmentRule(r.category, r.rule_type);
      const ruleName = rule ? rule.name : r.rule_type;
      const amount = parseFloat(r.penalty_amount) || 0;
      totalAmount += amount;
      return `| ${ruleName} | ${r.source_no || '-'} | ${r.overdue_days}天 | ${formatAmount(amount)} |`;
    }).join('\n');

    sections.push(`**${categoryLabel}**

| 规则 | 来源编号 | 超时天数 | 考核金额 |
|------|---------|---------|---------|
${tableRows}`);
  }

  const markdown = `### 考核通知

${userName}：

您有以下考核记录，请尽快处理：

${sections.join('\n\n')}

> 本次考核合计：${formatAmount(totalAmount)}

---
推送时间：${new Date().toLocaleString('zh-CN')}`;

  return {
    title: `【考核通知】您有 ${userRecords.length} 条待处理考核记录`,
    markdown,
  };
}
