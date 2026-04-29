/**
 * 催收管理 DTO 类型定义
 * API 请求/响应的 camelCase 类型，与数据库 snake_case 实体对应
 */

import type {
  TaskStatus,
  DetailStatus,
  Priority,
  BatchType,
  EscalationLevel,
  ActionType,
  ActionResult,
  LegalActionType,
  ProcessType,
  EntryRuleSnapshot,
} from './ar-collection.types';

// ==================== 响应 DTO ====================

/** 催收任务响应 DTO */
export interface CollectionTaskDTO {
  id: number;
  taskNo: string;
  consumerCode: string;
  consumerName: string | null;
  managerUserId: number | null;
  managerUserName: string | null;
  totalAmount: number;
  billCount: number;
  status: TaskStatus;
  currentHandlerId: number | null;
  currentHandlerRole: string | null;
  batchType: BatchType;
  batchDate: string;
  priority: Priority | null;
  firstOverdueDate: string | null;
  maxOverdueDays: number;
  escalationLevel: EscalationLevel;
  escalationCount: number;
  lastEscalatedAt: string | null;
  lastEscalatedBy: number | null;
  escalationReason: string | null;
  extensionCount: number;
  currentExtensionId: number | null;
  extensionUntil: string | null;
  canExtend: boolean;
  collectionCount: number;
  lastCollectionAt: string | null;
  assessmentStartTime: string | null;
  assessmentTiers: string[];
  entryReasons: string[];
  entryRuleSnapshot: EntryRuleSnapshot | null;
  createdAt: string;
  updatedAt: string;
  currentHandlerName: string | null;
  managerName: string | null;
  pendingRole: string | null;
}

/** 催收明细响应 DTO */
export interface CollectionDetailDTO {
  id: number;
  taskId: number;
  erpBillId: string | null;
  billNo: string | null;
  billTypeName: string | null;
  totalAmount: number;
  leftAmount: number;
  billOrderTime: string | null;
  expireTime: string | null;
  overdueDays: number | null;
  status: DetailStatus;
  processType: ProcessType | null;
  processAmount: number;
  processAt: string | null;
  processedBy: number | null;
  processedByName: string | null;
  remark: string | null;
  hoardTag: string | null;
  createdAt: string;
}

/** 操作日志响应 DTO */
export interface CollectionActionDTO {
  id: number;
  taskId: number;
  detailIds: number[] | null;
  actionType: ActionType;
  actionResult: ActionResult | null;
  remark: string | null;
  attachmentUrl: string | null;
  operatorId: number | null;
  operatorName: string | null;
  operatorRole: string | null;
  createdAt: string;
}

/** 法律进展响应 DTO */
export interface LegalProgressDTO {
  id: number;
  taskId: number;
  action: LegalActionType;
  description: string | null;
  attachmentUrl: string | null;
  operatorId: number | null;
  createdAt: string;
}

// ==================== 请求 DTO ====================

/** 申请延期请求 DTO */
export interface CreateExtensionDTO {
  extensionDays: number;
  detailIds: number[];
  evidenceFileId?: number;
  signatureData?: string;
  reason?: string;
}

/** 标记差异请求 DTO */
export interface MarkDifferenceDTO {
  detailIds: number[];
  remark: string;
}

/** 升级处理请求 DTO */
export interface EscalateDTO {
  reason: string;
}

/** 差异解决请求 DTO */
export interface ResolveDifferenceDTO {
  detailIds: number[];
  remark: string;
}
