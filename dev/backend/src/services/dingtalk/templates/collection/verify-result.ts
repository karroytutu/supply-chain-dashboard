/**
 * 核销结果通知模板
 * 使用 ActionCard 格式，单个「查看详情」按钮
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
 * 构建核销结果通知消息（ActionCard 格式）
 */
export function buildVerifyResultMessage(
  task: CollectionTask,
  verified: boolean
): { title: string; actionCard: ActionCardContent } {
  const statusText = verified ? '已通过' : '未通过';
  const icon = verified ? '✅' : '❌';

  const title = `${icon}【核销结果】${task.consumer_name || task.consumer_code} 核销${statusText}`;

  const resultNote = verified
    ? '核销已确认，任务将更新为已核销状态。'
    : '核销未通过，请检查后重新提交或联系出纳确认。';

  const markdown = `### 核销结果通知

您提交的催收核销申请处理结果如下：

| 项目 | 详情 |
|------|------|
| 任务编号 | ${task.task_no} |
| 客户名称 | ${task.consumer_name || task.consumer_code} |
| 应收总额 | ${formatAmount(task.total_amount)} |
| 核销结果 | ${icon} ${statusText} |

${resultNote}

---
推送时间：${formatTimestamp()}`;

  const actionCard = new ActionCardBuilder()
    .setTitle(title)
    .setMarkdown(markdown)
    .setSingleUrl(ACTION_URL, '查看详情')
    .build();

  return { title, actionCard };
}
