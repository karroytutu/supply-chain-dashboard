/**
 * 催收管理 - 钉钉通知服务（统一导出入口）
 * ActionCard 与预警消息已拆分到 ar-collection-notify-cards.ts
 * @module services/ar-collection/ar-collection-notify
 */

import type { SendMessageOptions } from '../dingtalk.service';
import { sendNotification } from '../notification';
import type { CollectionTask, EscalationLevel } from './ar-collection.types';
import { config } from '../../config';

// Re-export from cards module
export {
  buildMergedWarningMessage,
} from './ar-collection-notify-cards';
export type { WarningDebtItem } from './ar-collection-notify-cards';

/** 通知发送参数 */
interface NotifyParams {
  userIds: number[];
  title: string;
  content: string;
  options?: SendMessageOptions;
}

/** 消息模板返回结构 */
interface MessageTemplate {
  title: string;
  content: string;
}

/**
 * 升级层级中文映射
 */
export const ESCALATION_LEVEL_NAMES: Record<EscalationLevel, string> = {
  0: '营销师',
  1: '营销经理',
  2: '财务',
};

// 催收管理页跳转URL（钉钉跳转始终使用生产域名）
export const getCollectionActionUrl = (): string => `${config.dingtalk.baseUrl}/collection/overview`;

function formatTimestamp(): string {
  return new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' });
}

function formatAmount(amount: number | null): string {
  if (amount === null || amount === undefined) return '¥0.00';
  return `¥${Number(amount).toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/** 统一通知发送入口（委托给共享通知服务） */
export async function sendCollectionNotification(params: NotifyParams): Promise<void> {
  await sendNotification(params);
}

// ============================================
// 消息模板函数
// ============================================

/** 构建延期到期提醒消息 */
export function buildExtensionExpiryMessage(
  task: CollectionTask,
  daysLeft: number
): MessageTemplate {
  const urgency = daysLeft <= 1 ? '【紧急】' : '';
  const title = `${urgency}【延期到期】${task.consumer_name || task.consumer_code} 的延期将在 ${daysLeft} 天后到期`;

  const content = `### 延期到期提醒

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
点击查看详情: ${getCollectionActionUrl()}

推送时间：${formatTimestamp()}`;

  return { title, content };
}
