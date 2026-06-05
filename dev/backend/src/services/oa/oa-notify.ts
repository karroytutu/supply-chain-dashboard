/**
 * OA通知服务 - 基础设施与统一导出入口
 * 通知处理函数已拆分到 oa-notify-handlers.ts
 * @module services/oa/oa-notify
 */

import { appQuery as query } from '../../db/appPool';
import type { FormSchema } from './oa.types';

// Re-export notification handlers
export {
  notifyPendingApproval,
  notifyApproved,
  notifyRejected,
  notifyTransferred,
  notifyCountersign,
  notifyWithdrawn,
  notifyCc,
} from './oa-notify-handlers';

// Re-export shared user resolver（用户解析已抽取至 services/notification/）
export { getDingtalkUserIds } from '../notification';

// =====================================================
// 通知参数类型
// =====================================================

export interface NotifyParams {
  instanceId: number;
  instanceNo: string;
  title: string;
  formTypeName: string;
  applicantName: string;
  nodeName?: string;
  nodeOrder?: number;
  reason?: string;
  fromUserName?: string;
  rejectUserName?: string;
  formSchema?: FormSchema;
  formData?: Record<string, unknown>;
}

// =====================================================
// 辅助函数
// =====================================================

/** 构建 DingtalkNotifyParams */
export function toDingtalkParams(params: NotifyParams) {
  return {
    instanceId: params.instanceId,
    instanceNo: params.instanceNo,
    title: params.title,
    formTypeName: params.formTypeName,
    applicantName: params.applicantName,
    nodeName: params.nodeName,
    nodeOrder: params.nodeOrder,
    reason: params.reason,
    fromUserName: params.fromUserName,
    rejectUserName: params.rejectUserName,
    formSchema: params.formSchema,
    formData: params.formData,
  };
}

/** 保存通知TaskId映射 */
export async function saveTaskMapping(
  instanceId: number,
  taskId: number | undefined,
  receiverUserIds: number[],
  notificationType: string
): Promise<void> {
  if (!taskId) return;
  for (const userId of receiverUserIds) {
    await query(
      `INSERT INTO oa_notification_task_mapping (instance_id, task_id, receiver_user_id, notification_type)
       VALUES ($1, $2, $3, $4)`,
      [instanceId, taskId, userId, notificationType]
    );
  }
}
