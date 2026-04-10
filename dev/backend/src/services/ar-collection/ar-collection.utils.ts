/**
 * 催收管理 - 工具函数
 */

/**
 * 将蛇形命名转换为驼峰命名
 */
function toCamelCase(str: string): string {
  return str.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase());
}

/**
 * 将对象的键从蛇形命名转换为驼峰命名
 */
export function toCamelCaseKeys<T>(obj: any): T {
  if (obj === null || obj === undefined) return obj;
  if (Array.isArray(obj)) {
    return obj.map(item => toCamelCaseKeys(item)) as T;
  }
  if (typeof obj !== 'object') return obj;

  const result: any = {};
  for (const key of Object.keys(obj)) {
    const camelKey = toCamelCase(key);
    result[camelKey] = obj[key];
  }
  return result;
}

/**
 * 任务字段映射（数据库字段 -> 接口字段）
 */
export function transformTask(task: any): any {
  if (!task) return task;
  return {
    id: task.id,
    taskNo: task.task_no,
    consumerCode: task.consumer_code,
    consumerName: task.consumer_name,
    managerUserId: task.manager_user_id,
    managerUserName: task.manager_user_name,
    totalAmount: Number(task.total_amount) || 0,
    billCount: task.bill_count,
    status: task.status,
    currentHandlerId: task.current_handler_id,
    currentHandlerRole: task.current_handler_role,
    batchType: task.batch_type,
    batchDate: task.batch_date,
    priority: task.priority,
    firstOverdueDate: task.first_overdue_date,
    maxOverdueDays: task.max_overdue_days,
    escalationLevel: task.escalation_level,
    escalationCount: task.escalation_count,
    lastEscalatedAt: task.last_escalated_at,
    lastEscalatedBy: task.last_escalated_by,
    escalationReason: task.escalation_reason,
    extensionCount: task.extension_count,
    currentExtensionId: task.current_extension_id,
    extensionUntil: task.extension_until,
    canExtend: task.can_extend,
    collectionCount: task.collection_count,
    lastCollectionAt: task.last_collection_at,
    createdAt: task.created_at,
    updatedAt: task.updated_at,
    // 关联字段
    currentHandlerName: task.handler_name,
    managerName: task.manager_name,
    pendingRole: task.pending_role,
  };
}

/**
 * 任务明细字段映射
 */
export function transformDetail(detail: any): any {
  if (!detail) return detail;
  return {
    id: detail.id,
    taskId: detail.task_id,
    erpBillId: detail.erp_bill_id,
    billTypeName: detail.bill_type_name,
    totalAmount: Number(detail.total_amount) || 0,
    leftAmount: Number(detail.left_amount) || 0,
    billOrderTime: detail.bill_order_time,
    expireTime: detail.expire_time,
    overdueDays: detail.overdue_days,
    status: detail.status,
    processType: detail.process_type,
    processAmount: Number(detail.process_amount) || 0,
    processAt: detail.process_at,
    processedBy: detail.processed_by,
    processedByName: detail.processed_by_name,
    remark: detail.remark,
    createdAt: detail.created_at,
  };
}

/**
 * 操作日志字段映射
 */
export function transformAction(action: any): any {
  if (!action) return action;
  return {
    id: action.id,
    taskId: action.task_id,
    detailIds: action.detail_ids,
    actionType: action.action_type,
    actionResult: action.action_result,
    remark: action.remark,
    operatorId: action.operator_id,
    operatorName: action.operator_name,
    operatorRole: action.operator_role,
    createdAt: action.created_at,
  };
}

/**
 * 法律进展字段映射
 */
export function transformLegalProgress(progress: any): any {
  if (!progress) return progress;
  return {
    id: progress.id,
    taskId: progress.task_id,
    action: progress.action,
    description: progress.description,
    attachmentUrl: progress.attachment_url,
    operatorId: progress.operator_id,
    createdAt: progress.created_at,
  };
}
