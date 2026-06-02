/**
 * 催收管理 - 钉钉通知服务（统一导出入口）
 * ActionCard 与预警消息已拆分到 ar-collection-notify-cards.ts
 * @module services/ar-collection/ar-collection-notify
 */

import { appQuery } from '../../db/appPool';
import { sendWorkNotification } from '../dingtalk.service';
import type { SendMessageOptions } from '../dingtalk.service';
import type { CollectionTask, EscalationLevel } from './ar-collection.types';

// Re-export from cards module
export {
  buildEscalationActionCard,
  buildVerifyResultActionCard,
  buildRollbackActionCard,
  buildUpcomingWarningMessage,
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
 * @syncTo 前端 RollbackModal.tsx 中的 LEVEL_LABELS 必须与此保持一致
 */
export const ESCALATION_LEVEL_NAMES: Record<EscalationLevel, string> = {
  0: '营销师',
  1: '营销经理',
  2: '财务',
};

const ACTION_URL = 'https://xly.gzzxd.com/collection/overview';

function formatTimestamp(): string {
  return new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' });
}

function formatAmount(amount: number | null): string {
  if (amount === null || amount === undefined) return '¥0.00';
  return `¥${Number(amount).toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/** 根据用户ID列表查询钉钉用户ID */
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
    console.error('[CollectionNotify] 查询钉钉用户ID失败:', error);
    return [];
  }
}

/** 根据角色编码查询钉钉用户ID列表 */
async function getDingtalkUserIdsByRole(roleCode: string): Promise<string[]> {
  try {
    const result = await appQuery<{ dingtalk_user_id: string }>(
      `SELECT u.dingtalk_user_id
       FROM users u
       JOIN user_roles ur ON u.id = ur.user_id
       JOIN roles r ON ur.role_id = r.id
       WHERE r.code = $1 AND u.status = 1 AND r.status = 1
         AND u.dingtalk_user_id IS NOT NULL`,
      [roleCode]
    );
    return result.rows
      .map(row => row.dingtalk_user_id)
      .filter(id => id && id !== 'dev_admin');
  } catch (error) {
    console.error('[CollectionNotify] 获取角色用户失败:', roleCode, error);
    return [];
  }
}

/** 统一通知发送入口（通知失败仅记录日志） */
export async function sendCollectionNotification(params: NotifyParams): Promise<void> {
  try {
    const { userIds, title, content, options } = params;
    const dingtalkIds = await getDingtalkUserIds(userIds);
    if (dingtalkIds.length === 0) {
      console.log('[CollectionNotify] 无有效接收者，跳过通知:', title);
      return;
    }
    const result = await sendWorkNotification(dingtalkIds, title, content, options);
    console.log('[CollectionNotify] 通知发送结果:', title, result);
  } catch (error) {
    console.error('[CollectionNotify] 通知发送失败:', params.title, error);
  }
}

/** 发送通知给指定角色的所有用户 */
export async function sendCollectionNotificationByRole(
  roleCode: string,
  title: string,
  content: string,
  options?: SendMessageOptions
): Promise<void> {
  try {
    const dingtalkIds = await getDingtalkUserIdsByRole(roleCode);
    if (dingtalkIds.length === 0) {
      console.log('[CollectionNotify] 角色无有效用户，跳过通知:', roleCode, title);
      return;
    }
    const result = await sendWorkNotification(dingtalkIds, title, content, options);
    console.log('[CollectionNotify] 角色通知发送结果:', roleCode, result);
  } catch (error) {
    console.error('[CollectionNotify] 角色通知发送失败:', roleCode, title, error);
  }
}

// ============================================
// 消息模板函数
// ============================================

/** 构建延期到期提醒消息 */
export function buildExtensionExpiryMessage(task: CollectionTask, daysLeft: number): MessageTemplate {
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
点击查看详情: ${ACTION_URL}

推送时间：${formatTimestamp()}`;

  return { title, content };
}

/** 构建升级通知消息模板 */
export function buildEscalationMessage(
  task: CollectionTask,
  fromLevel: EscalationLevel,
  toLevel: EscalationLevel
): MessageTemplate {
  const fromName = ESCALATION_LEVEL_NAMES[fromLevel];
  const toName = ESCALATION_LEVEL_NAMES[toLevel];
  const title = `【催收升级】${task.consumer_name || task.consumer_code} 催收任务已升级至${toName}`;

  const content = `### 催收升级通知

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
点击查看详情: ${ACTION_URL}

推送时间：${formatTimestamp()}`;

  return { title, content };
}

/** 构建核销结果通知消息模板 */
export function buildVerifyResultMessage(task: CollectionTask, verified: boolean): MessageTemplate {
  const statusText = verified ? '已通过' : '未通过';
  const icon = verified ? '✅' : '❌';
  const title = `${icon}【核销结果】${task.consumer_name || task.consumer_code} 核销${statusText}`;

  const content = `### 核销结果通知

您提交的催收核销申请处理结果如下：

| 项目 | 详情 |
|------|------|
| 任务编号 | ${task.task_no} |
| 客户名称 | ${task.consumer_name || task.consumer_code} |
| 应收总额 | ${formatAmount(task.total_amount)} |
| 核销结果 | ${icon} ${statusText} |

${verified ? '核销已确认，任务将更新为已核销状态。' : '核销未通过，请检查后重新提交或联系结算会计确认。'}

---
点击查看详情: ${ACTION_URL}

推送时间：${formatTimestamp()}`;

  return { title, content };
}
