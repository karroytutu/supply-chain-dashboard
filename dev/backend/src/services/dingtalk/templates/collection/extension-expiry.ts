/**
 * 催收延期到期提醒模板
 * 使用 ActionCard 格式，单个「查看任务」按钮
 */

import { ActionCardBuilder } from '../../builders/action-card.builder';
import type { ActionCardContent } from '../../dingtalk.types';
import type { CollectionTask } from '../../../ar-collection/ar-collection.types';

const ACTION_URL = 'https://xly.gzzxd.com/collection/overview';

/**
 * 格式化时间戳
 */
function formatTimestamp(): string {
  return new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' });
}

/**
 * 格式化金额
 */
function formatAmount(amount: number | null): string {
  if (amount === null || amount === undefined) return '¥0.00';
  return `¥${Number(amount).toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/**
 * 构建延期到期提醒消息（ActionCard 格式）
 */
export function buildExtensionExpiryMessage(
  task: CollectionTask,
  daysLeft: number
): { title: string; actionCard: ActionCardContent } {
  const urgency = daysLeft <= 1 ? '【紧急】' : '';

  const title = `${urgency}【延期到期】${task.consumer_name || task.consumer_code} 的延期将在 ${daysLeft} 天后到期`;

  const markdown = `### 延期到期提醒

${urgency}您负责的催收任务延期即将到期：

| 项目 | 详情 |
|------|------|
| 任务编号 | ${task.task_no} |
| 客户名称 | ${task.consumer_name || task.consumer_code} |
| 逾期总额 | ${formatAmount(task.total_amount)} |
| 延期到期日 | ${task.extension_until || '未知'} |
| 剩余天数 | ${daysLeft} 天 |

延期到期后任务将恢复为催收中状态，请及时跟进处理！

---
推送时间：${formatTimestamp()}`;

  const actionCard = new ActionCardBuilder()
    .setTitle(title)
    .setMarkdown(markdown)
    .setSingleUrl(ACTION_URL, '查看任务')
    .build();

  return { title, actionCard };
}
