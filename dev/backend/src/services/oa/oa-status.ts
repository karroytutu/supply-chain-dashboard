/**
 * OA 审批系统 - 状态与动作常量集中定义
 * @module services/oa/oa-status
 *
 * 新代码优先从此模块导入常量，旧代码在后续迭代中逐步替换。
 */

// =====================================================
// 审批实例状态
// =====================================================

export const APPROVAL_STATUS = {
  PENDING: 'pending',
  PROCESSING: 'processing',
  APPROVED: 'approved',
  REJECTED: 'rejected',
  ERP_FAILED: 'erp_failed',
  CANCELLED: 'cancelled',
  WITHDRAWN: 'withdrawn',
} as const;

export type ApprovalStatusValue = (typeof APPROVAL_STATUS)[keyof typeof APPROVAL_STATUS];

/** 审批实例终态集合 */
export const TERMINAL_APPROVAL_STATUSES: readonly ApprovalStatusValue[] = [
  APPROVAL_STATUS.APPROVED,
  APPROVAL_STATUS.REJECTED,
  APPROVAL_STATUS.WITHDRAWN,
  APPROVAL_STATUS.CANCELLED,
];

// =====================================================
// 审批节点状态
// =====================================================

export const NODE_STATUS = {
  PENDING: 'pending',
  PROCESSING: 'processing',
  APPROVED: 'approved',
  REJECTED: 'rejected',
  TRANSFERRED: 'transferred',
  FAILED: 'failed',
  SKIPPED: 'skipped',
  CANCELLED: 'cancelled',
} as const;

export type NodeStatusValue = (typeof NODE_STATUS)[keyof typeof NODE_STATUS];

/** 审批节点终态集合 */
export const TERMINAL_NODE_STATUSES: readonly NodeStatusValue[] = [
  NODE_STATUS.APPROVED,
  NODE_STATUS.REJECTED,
  NODE_STATUS.TRANSFERRED,
  NODE_STATUS.FAILED,
  NODE_STATUS.SKIPPED,
  NODE_STATUS.CANCELLED,
];

// =====================================================
// 审批动作类型
// =====================================================

export const ACTION_TYPE = {
  SUBMIT: 'submit',
  APPROVE: 'approve',
  REJECT: 'reject',
  TRANSFER: 'transfer',
  COUNTERSIGN: 'countersign',
  WITHDRAW: 'withdraw',
  COMMENT: 'comment',
  UPDATE: 'update',
  RETRY_AUTO_NODE: 'retry_auto_node',
} as const;

export type ActionTypeValue = (typeof ACTION_TYPE)[keyof typeof ACTION_TYPE];

// =====================================================
// 签署模式
// =====================================================

export const SIGN_MODE = {
  OR: 'or',
  AND: 'and',
} as const;

export type SignModeValue = (typeof SIGN_MODE)[keyof typeof SIGN_MODE];

// =====================================================
// 节点类型
// =====================================================

export const NODE_TYPE = {
  APPROVAL: 'approval',
  DATA_INPUT: 'data_input',
  AUTO: 'auto',
  COUNTERSIGN: 'countersign',
} as const;

export type NodeTypeValue = (typeof NODE_TYPE)[keyof typeof NODE_TYPE];
