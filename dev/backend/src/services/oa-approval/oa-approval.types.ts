/**
 * OA审批模块类型定义
 * @module services/oa-approval/oa-approval.types
 */

// =====================================================
// 表单分类相关类型
// =====================================================

/**
 * 表单分类类型
 * 参考：钉钉OA审批分类
 */
export type FormCategory = 'finance' | 'supply_chain' | 'marketing' | 'hr' | 'admin';

/**
 * 分类中文名称映射
 */
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

/**
 * 表单字段类型
 * 参考：钉钉OA审批控件
 */
export type FormFieldType =
  | 'text'
  | 'textarea'
  | 'number'
  | 'money'
  | 'select'
  | 'multi-select'
  | 'date'
  | 'date-range'
  | 'upload'
  | 'photo'
  | 'user-select'
  | 'department'
  | 'cascader'
  | 'address'
  | 'table'
  | 'rating'
  | 'text-note'
  | 'relate-approval'
  | 'location';

/**
 * 表单字段定义
 */
export interface FormField {
  /** 字段标识，camelCase */
  key: string;
  /** 显示标签 */
  label: string;
  /** 字段类型 */
  type: FormFieldType;
  /** 是否必填 */
  required: boolean;
  /** 占位提示 */
  placeholder?: string;
  /** 默认值 */
  defaultValue?: unknown;
  /** 是否禁用 */
  disabled?: boolean;
  /** 业务标识，表单内唯一 */
  bizAlias?: string;
  /** 是否参与打印，默认true */
  print?: boolean;

  // 类型特定属性
  /** select 类型选项 */
  options?: Array<{ value: string; label: string; key?: string }>;
  /** number 类型单位 */
  unit?: string;
  /** number 类型最小值 */
  min?: number;
  /** number 类型最大值 */
  max?: number;
  /** number 类型小数位数 */
  precision?: number;
  /** number 类型后缀 */
  suffix?: string;
  /** text/textarea 最大长度 */
  maxLength?: number;
  /** upload 类型最大文件数 */
  maxCount?: number;
  /** user-select/department 是否多选 */
  multiple?: boolean;
  /** date 类型格式 */
  format?: string;
  /** 省市区控件模式 */
  addressModel?: 'city' | 'district' | 'street';
  /** 金额控件是否显示大写 */
  upper?: boolean;
  /** 评分控件分制 */
  limit?: 5 | 10;
  /** 明细控件填写方式 */
  tableViewMode?: 'list' | 'table';
  /** 明细控件子字段 */
  children?: FormField[];
  /** 明细统计字段 */
  statField?: Array<{ componentId: string; label: string }>;
  /** 文字说明控件超链接 */
  link?: string;
  /** 文字说明控件内容 */
  content?: string;
  /** 条件显示 */
  visibleWhen?: { field: string; operator: '==' | '!=' | '>' | '<'; value: unknown };
}

/**
 * 表单结构定义
 */
export interface FormSchema {
  fields: FormField[];
}

// =====================================================
// 审批流程相关类型
// =====================================================

/**
 * 审批节点类型
 */
export type NodeType = 'role' | 'dynamic_supervisor' | 'specific_user' | 'countersign' | 'data_input';

/**
 * 数据录入节点 - 录入字段定义
 */
export interface NodeInputField {
  /** 字段名 */
  name: string;
  /** 显示名 */
  label: string;
  /** 字段类型 */
  type: 'text' | 'number' | 'date' | 'select' | 'upload' | 'amount' | 'table';
  /** 是否必填 */
  required?: boolean;
  /** select 类型的选项 */
  options?: Array<{ label: string; value: any }>;
  /** 默认值 */
  defaultValue?: any;
  /** 是否只读 */
  readonly?: boolean;
  /** table 类型的列定义 */
  columns?: NodeInputField[];
}

/**
 * 数据录入节点 - 录入表单 Schema
 */
export interface NodeInputSchema {
  /** 录入表单字段定义 */
  fields: NodeInputField[];
}

/**
 * 条件定义
 */
export interface ConditionDef {
  /** formSchema 中的字段 key */
  field: string;
  /** 比较操作符 */
  operator: '>' | '<' | '==' | '>=' | '<=';
  /** 比较值 */
  value: number | string;
}

/**
 * 审批节点定义
 */
export interface WorkflowNodeDef {
  /** 节点顺序，从1开始 */
  order: number;
  /** 节点显示名称 */
  name: string;
  /** 节点类型 */
  type: NodeType;
  /** 角色编码（type=role 时必填） */
  roleCode?: string;
  /** 指定用户ID（type=specific_user 时必填） */
  userId?: number;
  /** 条件定义（条件节点） */
  condition?: ConditionDef;
  /** 数据录入表单 schema（仅 data_input 类型） */
  inputSchema?: NodeInputSchema;
}

/**
 * 审批流程定义
 */
export interface WorkflowDef {
  /** 审批节点列表 */
  nodes: WorkflowNodeDef[];
  /** 抄送角色列表 */
  ccRoles?: string[];
}

// =====================================================
// 表单类型定义
// =====================================================

/**
 * 表单类型定义接口
 */
export interface FormTypeDefinition {
  /** 唯一编码，kebab-case */
  code: string;
  /** 显示名称 */
  name: string;
  /** 图标 */
  icon: string;
  /** 分类 */
  category: FormCategory;
  /** 同分类内排序 */
  sortOrder: number;
  /** 简要描述 */
  description: string;
  /** 版本号 */
  version: number;
  /** 表单字段定义 */
  formSchema: FormSchema;
  /** 审批流程定义 */
  workflowDef: WorkflowDef;
  /** 审批通过回调（整个流程完成时触发，可选） */
  onApproved?: (instance: OaApprovalInstanceRow, formData: Record<string, unknown>) => Promise<void>;
  /** 审批驳回回调（可选） */
  onRejected?: (instance: OaApprovalInstanceRow, formData: Record<string, unknown>) => Promise<void>;
  /** data_input 节点完成回调（可选，按节点序号分发） */
  onNodeCompleted?: (instance: OaApprovalInstanceRow, nodeOrder: number, nodeData: Record<string, unknown>, formData: Record<string, unknown>) => Promise<void>;
}

// =====================================================
// 数据库行映射类型
// =====================================================

/**
 * oa_form_types 表行
 */
export interface OaFormTypeRow {
  id: number;
  code: string;
  name: string;
  icon: string | null;
  category: FormCategory;
  sort_order: number;
  description: string | null;
  form_schema: FormSchema;
  workflow_def: WorkflowDef;
  is_active: boolean;
  version: number;
  created_at: Date;
  updated_at: Date;
}

/**
 * 审批实例状态
 */
export type ApprovalStatus = 'pending' | 'approved' | 'rejected' | 'cancelled' | 'withdrawn';

/**
 * 审批节点状态
 */
export type ApprovalNodeStatus = 'pending' | 'approved' | 'rejected' | 'transferred' | 'skipped' | 'cancelled';

/**
 * 紧急程度
 */
export type Urgency = 'normal' | 'high' | 'urgent';

/**
 * oa_approval_instances 表行
 */
export interface OaApprovalInstanceRow {
  id: number;
  instance_no: string;
  form_type_id: number;
  title: string;
  form_data: Record<string, unknown>;
  status: ApprovalStatus;
  urgency: Urgency;
  applicant_id: number;
  applicant_name: string;
  applicant_dept: string | null;
  current_node_order: number;
  submitted_at: Date;
  completed_at: Date | null;
  created_at: Date;
  updated_at: Date;
}

/**
 * oa_approval_nodes 表行
 */
export interface OaApprovalNodeRow {
  id: number;
  instance_id: number;
  node_order: number;
  node_name: string;
  node_type: NodeType;
  role_code: string | null;
  assigned_user_id: number | null;
  assigned_user_name: string | null;
  status: ApprovalNodeStatus;
  comment: string | null;
  acted_at: Date | null;
  is_countersign: boolean;
  countersign_parent_node_id: number | null;
  input_schema: NodeInputSchema | null;
  input_data: Record<string, unknown> | null;
  created_at: Date;
  updated_at: Date;
}

/**
 * oa_approval_cc 表行
 */
export interface OaApprovalCcRow {
  id: number;
  instance_id: number;
  user_id: number;
  user_name: string | null;
  read_at: Date | null;
  created_at: Date;
}

/**
 * 操作类型
 */
export type ApprovalActionType = 'submit' | 'approve' | 'reject' | 'transfer' | 'countersign' | 'withdraw' | 'cancel' | 'resubmit';

/**
 * oa_approval_actions 表行
 */
export interface OaApprovalActionRow {
  id: number;
  instance_id: number;
  action_type: ApprovalActionType;
  operator_id: number | null;
  operator_name: string | null;
  node_order: number | null;
  comment: string | null;
  details: Record<string, unknown> | null;
  action_at: Date;
}

/**
 * oa_in_app_messages 表行
 */
export interface OaInAppMessageRow {
  id: number;
  user_id: number;
  type: 'approval_pending' | 'cc' | 'result';
  title: string;
  content: string | null;
  instance_id: number | null;
  is_read: boolean;
  read_at: Date | null;
  created_at: Date;
}

// =====================================================
// API 请求/响应类型
// =====================================================

/**
 * 审批操作类型
 */
export type ApprovalAction = 'approve' | 'reject' | 'transfer' | 'countersign' | 'withdraw';

/**
 * 审批操作请求
 */
export interface ApprovalActionRequest {
  action: ApprovalAction;
  /** 审批意见/备注 */
  comment?: string;
  /** 附件列表 */
  attachments?: Array<{ url: string; name: string }>;
  /** 转交目标用户ID（action=transfer时必填） */
  transferToUserId?: number;
  /** 加签用户ID列表（action=countersign时必填） */
  countersignUserIds?: number[];
  /** 加签类型：前加签/后加签 */
  countersignType?: 'before' | 'after';
  /** data_input 节点的录入数据 */
  inputData?: Record<string, unknown>;
}

/**
 * 提交审批请求
 */
export interface SubmitApprovalRequest {
  /** 表单类型编码 */
  formTypeCode: string;
  /** 表单数据 */
  formData: Record<string, unknown>;
  /** 摘要标题 */
  title: string;
  /** 紧急程度 */
  urgency?: Urgency;
}

/**
 * 审批列表查询模式
 */
export type ViewMode = 'pending' | 'processed' | 'my' | 'cc';

/**
 * 审批列表查询参数
 */
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

/**
 * 审批统计数据
 */
export interface ApprovalStats {
  pending: number;
  processed: number;
  my: number;
  cc: number;
}

/**
 * 站内消息类型
 */
export type InAppMessageType = 'approval_pending' | 'cc' | 'result';

/**
 * 创建站内消息参数
 */
export interface CreateMessageParams {
  userId: number;
  type: InAppMessageType;
  title: string;
  content?: string;
  instanceId?: number;
}
