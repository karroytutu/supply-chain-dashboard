/**
 * 催收升级通知模板
 * 使用 ActionCard 格式，单个「查看任务」按钮
 */

import { ActionCardBuilder } from '../../builders/action-card.builder';
import type { ActionCardContent } from '../../dingtalk.types';
import type { CollectionTask, EscalationLevel } from '../../../ar-collection/ar-collection.types';

const ACTION_URL = 'https://xly.gzzxd.com/collection/overview';

/** 升级层级中文映射 */
const ESCALATION_LEVEL_NAMES: Record<EscalationLevel, string> = {
  0: '营销师',
  1: '营销主管',
  2: '财务',
};

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
 * 构建升级通知消息（ActionCard 格式）
 */
export function buildEscalationMessage(
  task: CollectionTask,
  fromLevel: EscalationLevel,
  toLevel: EscalationLevel
): { title: string; actionCard: ActionCardContent } {
  const fromName = ESCALATION_LEVEL_NAMES[fromLevel];
  const toName = ESCALATION_LEVEL_NAMES[toLevel];

  const title = `【催收升级】${task.consumer_name || task.consumer_code} 催收任务已升级至${toName}`;

  const markdown = `### 催收升级通知

有催收任务升级需要您处理：

| 项目 | 详情 |
|------|------|
| 任务编号 | ${task.task_no} |
| 客户名称 | ${task.consumer_name || task.consumer_code} |
| 逾期总额 | ${formatAmount(task.total_amount)} |
| 逾期笔数 | ${task.bill_count} 笔 |
| 最大逾期天数 | ${task.max_overdue_days} 天 |
| 升级路径 | ${fromName} → ${toName} |
| 升级原因 | ${task.escalation_reason || '催收超时自动升级'} |

请及时处理该催收任务！

---
推送时间：${formatTimestamp()}`;

  const actionCard = new ActionCardBuilder()
    .setTitle(title)
    .setMarkdown(markdown)
    .setSingleUrl(ACTION_URL, '查看任务')
    .build();

  return { title, actionCard };
}
