/**
 * OA审批模块类型定义
 * @module types/oa-approval
 */

// =====================================================
// 表单分类相关类型
// =====================================================

export type FormCategory = 'finance' | 'supply_chain' | 'marketing' | 'hr' | 'admin';

export const CATEGORY_LABELS: Record<FormCategory, string> = {
  finance: '财务',
  supply_chain: '供应链',
  marketing: '营销',
  hr: '人事',
  admin: '行政',
};

// =====================================================
// 表单字段相关类型
// =====================================================

export type FormFieldType =
  | 'text'
  | 'textarea'
  | 'number'
  | 'money'
  | 'select'
  | 'multi-select'
  | 'date'
  | 'datetime'
  | 'date-range'
  | 'upload'
  | 'photo'
  | 'user-select'
  | 'user'
  | 'department'
  | 'dept'
  | 'cascader'
  | 'address'
  | 'table'
  | 'rating'
  | 'text-note'
  | 'relate-approval'
  | 'location'
  | 'radio'
  // ERP 参考数据字段类型
  | 'asset_search'
  | 'erp_department'
  | 'erp_staff'
  | 'erp_payment_account'
  | 'erp_asset_category';

export interface FormField {
  key: string;
  label: string;
  type: FormFieldType;
  required: boolean;
  placeholder?: string;
  defaultValue?: unknown;
  disabled?: boolean;
  bizAlias?: string;
  print?: boolean;
  options?: Array<{ value: string; label: string; key?: string }>;
  unit?: string;
  min?: number;
  max?: number;
  precision?: number;
  suffix?: string;
  maxLength?: number;
  maxCount?: number;
  multiple?: boolean;
  format?: string;
  addressModel?: 'city' | 'district' | 'street';
  upper?: boolean;
  limit?: 5 | 10;
  tableViewMode?: 'list' | 'table';
  children?: FormField[];
  statField?: Array<{ componentId: string; label: string }>;
  link?: string;
  content?: string;
  /** 条件显示（支持单个条件或AND条件数组） */
  visibleWhen?: ConditionDef | ConditionDef[];
  /** 条件必填（满足条件时字段变为必填） */
  requiredWhen?: ConditionDef | ConditionDef[];
  /** ERP参考数据API标识 */
  searchApi?: 'erp_assets' | 'erp_departments' | 'erp_staff' | 'erp_payment_accounts' | 'erp_asset_categories';
  /** 选择后自动填充其他字段，key=目标字段名，value=选中对象的属性名 */
  autoFill?: Record<string, string>;
  /** 级联字段key（如 erp_staff 级联 erp_department 的值） */
  cascadeFrom?: string;
  /** asset_search 显示哪些子字段 */
  displayFields?: string[];
}

export interface FormSchema {
  fields: FormField[];
}

// =====================================================
// 审批流程相关类型
// =====================================================

export type NodeType = 'role' | 'dynamic_supervisor' | 'specific_user' | 'countersign' | 'data_input';

export interface ConditionDef {
  field: string;
  operator: '>' | '<' | '==' | '>=' | '<=';
  value: number | string;
}

/** 数据录入节点 - 录入字段定义 */
export interface NodeInputField {
  name: string;
  label: string;
  type: 'text' | 'number' | 'date' | 'select' | 'upload' | 'amount' | 'table'
    | 'asset_search' | 'erp_department' | 'erp_staff' | 'erp_payment_account' | 'erp_asset_category';
  required?: boolean;
  options?: Array<{ label: string; value: unknown }>;
  defaultValue?: unknown;
  readonly?: boolean;
  columns?: NodeInputField[];
  searchApi?: 'erp_assets' | 'erp_departments' | 'erp_staff' | 'erp_payment_accounts' | 'erp_asset_categories';
  autoFill?: Record<string, string>;
  cascadeFrom?: string;
  visibleWhen?: ConditionDef | ConditionDef[];
  requiredWhen?: ConditionDef | ConditionDef[];
}

/** 数据录入节点 - 录入表单 Schema */
export interface NodeInputSchema {
  fields: NodeInputField[];
}

export interface WorkflowNodeDef {
  order: number;
  name: string;
  type: NodeType;
  roleCode?: string;
  userId?: number;
  condition?: ConditionDef;
  /** 数据录入表单 schema（仅 data_input 类型） */
  inputSchema?: NodeInputSchema;
}

export interface WorkflowDef {
  nodes: WorkflowNodeDef[];
  ccRoles?: string[];
}

// =====================================================
// 表单类型定义
// =====================================================

export interface FormTypeDefinition {
  code: string;
  name: string;
  icon: string;
  category: FormCategory;
  sortOrder: number;
  description: string;
  version: number;
  formSchema: FormSchema;
  workflowDef: WorkflowDef;
}

// =====================================================
// 审批状态相关类型
// =====================================================

export type ApprovalStatus = 'pending' | 'approved' | 'rejected' | 'cancelled' | 'withdrawn';

export type ApprovalNodeStatus = 'pending' | 'approved' | 'rejected' | 'transferred' | 'skipped' | 'cancelled';

export type Urgency = 'normal' | 'high' | 'urgent';

// =====================================================
// 审批实例相关类型
// =====================================================

export interface ApprovalInstance {
  id: number;
  instanceNo: string;
  formTypeCode: string;
  formTypeName: string;
  formTypeIcon: string | null;
  title: string;
  status: ApprovalStatus;
  urgency: Urgency;
  applicantId: number;
  applicantName: string;
  applicantDept: string | null;
  currentNodeOrder: number;
  currentNodeName: string | null;
  submittedAt: string;
  completedAt: string | null;
}

export interface ApprovalNode {
  id: number;
  nodeOrder: number;
  nodeName: string;
  nodeType: string;
  assignedUserId: number | null;
  assignedUserName: string | null;
  approverName?: string | null;  // Alias for assignedUserName
  status: ApprovalNodeStatus;
  comment: string | null;
  actedAt: string | null;
  actionAt?: string | null;  // Alias for actedAt
  isCountersign: boolean;
}

export interface ApprovalAction {
  id: number;
  actionType: string;
  operatorId: number | null;
  operatorName: string | null;
  actionUserName?: string | null;  // Alias for operatorName
  nodeOrder: number | null;
  comment: string | null;
  details: Record<string, unknown> | null;
  actionAt: string;
  createdAt?: string;  // Alias for actionAt
}

export interface CcUser {
  id: number;
  userId: number;
  userName: string | null;
  readAt: string | null;
}

/** ERP处理元数据 */
export interface ErpMeta {
  status: 'pending' | 'paying' | 'purchasing' | 'storing' | 'completed' | 'erp_failed';
  responseData: Record<string, unknown>;
  requestLog: Record<string, unknown> | null;
  applicationNo: string;
  retries: number;
}

export interface ApprovalDetail extends ApprovalInstance {
  formData: Record<string, unknown>;
  nodes: ApprovalNode[];
  actions: ApprovalAction[];
  ccUsers: CcUser[];
  erpMeta: ErpMeta | null;
}

// =====================================================
// 统计相关类型
// =====================================================

export interface ApprovalStats {
  total: number;
  pending: number;
  processed: number;
  approved: number;
  rejected: number;
  my: number;
  cc: number;
}

// =====================================================
// 查询参数类型
// =====================================================

export type ViewMode = 'pending' | 'processed' | 'my' | 'cc';

export interface ApprovalListParams {
  viewMode: ViewMode;
  formTypeCode?: string;
  status?: ApprovalStatus;
  urgency?: Urgency;
  startDate?: string;
  endDate?: string;
  page?: number;
  pageSize?: number;
}

// =====================================================
// 请求体类型
// =====================================================

export interface SubmitApprovalRequest {
  formTypeCode: string;
  formData: Record<string, unknown>;
  title: string;
  urgency?: Urgency;
}

export interface ApprovalActionRequest {
  action: 'approve' | 'reject' | 'transfer' | 'countersign' | 'withdraw';
  comment?: string;
  attachments?: Array<{ url: string; name: string }>;
  transferToUserId?: number;
  countersignUserIds?: number[];
  countersignType?: 'before' | 'after';
}

// =====================================================
// 站内消息相关类型
// =====================================================

export interface InAppMessage {
  id: number;
  userId: number;
  type: 'approval_pending' | 'cc' | 'result';
  title: string;
  content: string | null;
  instanceId: number | null;
  isRead: boolean;
  readAt: string | null;
  createdAt: string;
}

// =====================================================
// 工具类型
// =====================================================

export const STATUS_LABELS: Record<ApprovalStatus, string> = {
  pending: '审批中',
  approved: '已通过',
  rejected: '已拒绝',
  cancelled: '已取消',
  withdrawn: '已撤回',
};

export const STATUS_COLORS: Record<ApprovalStatus, string> = {
  pending: 'blue',
  approved: 'green',
  rejected: 'red',
  cancelled: 'default',
  withdrawn: 'orange',
};

export const URGENCY_LABELS: Record<Urgency, string> = {
  normal: '普通',
  high: '紧急',
  urgent: '非常紧急',
};

export const URGENCY_COLORS: Record<Urgency, string> = {
  normal: 'default',
  high: 'orange',
  urgent: 'red',
};

export const NODE_STATUS_LABELS: Record<ApprovalNodeStatus, string> = {
  pending: '待审批',
  approved: '已通过',
  rejected: '已拒绝',
  transferred: '已转交',
  skipped: '已跳过',
  cancelled: '已取消',
};

export const NODE_STATUS_COLORS: Record<ApprovalNodeStatus, string> = {
  pending: 'blue',
  approved: 'green',
  rejected: 'red',
  transferred: 'orange',
  skipped: 'default',
  cancelled: 'default',
};

// =====================================================
// 类型别名（向后兼容）
// =====================================================

/** @deprecated 使用 ApprovalInstance */
export type OaApprovalInstance = ApprovalInstance;

/** @deprecated 使用 ApprovalNode */
export type OaApprovalNode = ApprovalNode;

/** @deprecated 使用 ApprovalAction */
export type OaApprovalAction = ApprovalAction;
