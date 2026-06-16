/**
 * OA模块类型定义
 * @module services/oa/oa.types
 */

// =====================================================
// 表单分类相关类型
// =====================================================

/**
 * 表单分类类型
 * 参考：钉钉OA分类
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
 * 参考：钉钉OA控件
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
  | 'location'
  | 'radio'
  | 'signature' // 电子签名（手写签名控件，支持复用历史签名）
  // ERP 参考数据字段类型（固定资产审批使用）
  | 'asset_search' // 搜索选择ERP资产
  | 'erp_department' // 选择ERP部门
  | 'erp_staff' // 选择ERP员工
  | 'erp_payment_account' // 选择ERP付款账户
  | 'erp_asset_category' // 选择ERP资产分类
  // ERP 参考数据字段类型（客户授信审批使用）
  | 'erp_customer' // 搜索选择ERP客户
  | 'erp_settlement_order' // 搜索选择ERP结算单（多选）
  // ERP 参考数据字段类型（客户档案修改使用）
  | 'erp_grade' // 选择ERP客户等级
  | 'erp_group' // 选择ERP客户渠道（分组）
  | 'erp_area'; // 选择ERP客户片区（区域）

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
  options?: Array<{ value: string | number; label: string; key?: string }>;
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
  /** 明细控件子字段 */
  children?: FormField[];
  /** 明细统计字段 */
  statField?: Array<{ componentId: string; label: string }>;
  /** 文字说明控件超链接 */
  link?: string;
  /** 文字说明控件内容 */
  content?: string;
  /** 条件显示（支持单个条件或AND条件数组） */
  visibleWhen?: ConditionDef | ConditionDef[];
  /** 条件必填（满足条件时字段变为必填） */
  requiredWhen?: ConditionDef | ConditionDef[];
  /** ERP参考数据API标识（erp_* 类型使用） */
  searchApi?:
    | 'erp_assets'
    | 'erp_departments'
    | 'erp_staff'
    | 'erp_payment_accounts'
    | 'erp_asset_categories'
    | 'erp_customers'
    | 'erp_settlement_orders'
    | 'erp_grades'
    | 'erp_groups'
    | 'erp_areas';
  /** 选择后自动填充其他字段，key=目标字段名，value=选中对象的属性名 */
  autoFill?: Record<string, string>;
  /** 级联字段key（如 erp_staff 级联 erp_department 的值） */
  cascadeFrom?: string;
  /** ERP字段选中后，将显示名称存入 formData 的哪个 key（如 'customerName'） */
  nameField?: string;
  /** ERP多选字段选中后，将结构化明细(JSON)存入 formData 的哪个 key（如 'holdSettlementOrderDetails'） */
  detailsField?: string;
  /** asset_search 显示哪些子字段 */
  displayFields?: string[];
  /** photo 类型用途：storefront=门头照，license=营业执照（默认 license） */
  photoPurpose?: 'license' | 'storefront';
}

/**
 * 表单结构定义
 */
export interface FormSchema {
  fields: FormField[];
}

// =====================================================
// 节点级字段权限与交互类型
// =====================================================

/**
 * 字段权限类型
 * - editable: 可编辑（字段显示且可编辑）
 * - readonly: 只读（字段显示但不可编辑，灰色展示）
 * - hidden: 隐藏（字段不显示，默认值）
 */
export type FieldPermission = 'editable' | 'readonly' | 'hidden';

/**
 * 节点交互类型（固化类型，不允许自由组合）
 * - approval: 审批型（同意/拒绝为主按钮，退回/转交/加签折叠到更多）
 * - operation: 操作型（完成/更新为主按钮，退回/转交折叠到更多）
 *
 * 未配置时默认为 'approval'，与现有表单行为一致
 */
export type NodeInteractionType = 'approval' | 'operation';

// =====================================================
// 审批流程相关类型
// =====================================================

/**
 * 环节类型 — 描述环节做什么
 * - approval: 审批环节（通过/驳回）
 * - data_input: 数据录入环节（审批 + 录入表单数据）
 * - auto: 自动执行环节（系统回调，无处理人）
 * - countersign: 运行时加签环节（由当前处理人手动添加）
 */
export type NodeType = 'approval' | 'data_input' | 'auto' | 'countersign';

/**
 * 处理人规则 — 描述如何确定环节的处理人
 */
export interface HandlerRule {
  /** 按角色：查找拥有该角色的用户 */
  roleCode?: string;
  /** 按主管：查找申请人同部门的管理角色用户 */
  useSupervisor?: boolean;
  /** 指定人：直接指定用户 ID */
  userId?: number;
}

/**
 * 签署模式
 * - or: 或签（任一人通过即可）
 * - and: 会签（所有人都要通过）
 */
export type SignMode = 'or' | 'and';

/**
 * 数据录入节点 - 录入字段定义
 */
export interface NodeInputField {
  /** 字段名 */
  name: string;
  /** 显示名 */
  label: string;
  /** 字段类型 */
  type:
    | 'text'
    | 'number'
    | 'date'
    | 'select'
    | 'upload'
    | 'amount'
    | 'table'
    | 'asset_search'
    | 'erp_department'
    | 'erp_staff'
    | 'erp_payment_account'
    | 'erp_asset_category'
    | 'erp_customer'
    | 'erp_settlement_order';
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
  /** ERP参考数据API标识 */
  searchApi?:
    | 'erp_assets'
    | 'erp_departments'
    | 'erp_staff'
    | 'erp_payment_accounts'
    | 'erp_asset_categories'
    | 'erp_customers'
    | 'erp_settlement_orders'
    | 'erp_grades'
    | 'erp_groups'
    | 'erp_areas';
  /** 选择后自动填充其他字段 */
  autoFill?: Record<string, string>;
  /** 级联字段key */
  cascadeFrom?: string;
  /** ERP字段选中后，将显示名称存入 formData 的哪个 key */
  nameField?: string;
  /** 条件显示 */
  visibleWhen?: ConditionDef | ConditionDef[];
  /** 条件必填 */
  requiredWhen?: ConditionDef | ConditionDef[];
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

// =====================================================
// 节点时限配置相关类型
// =====================================================

/** 节点时限配置 */
export interface TimeoutConfig {
  /** 时限时长（分钟），不配置表示无时限 */
  durationMinutes: number;
  /** 免考核宽限期（分钟），默认 0 */
  gracePeriodMinutes?: number;
  /** 催办策略（不配置=不催办，仅记录超时状态） */
  reminder?: ReminderConfig;
  /** 考核规则（不配置=超时不考核） */
  assessment?: AssessmentConfig;
}

/** 催办策略 */
export interface ReminderConfig {
  /** 首次催办延迟（分钟，相对 deadline_at） */
  firstReminderDelayMinutes?: number;
  /** 催办间隔（分钟） */
  intervalMinutes?: number;
  /** 最大催办次数 */
  maxReminders?: number;
  /** 催办N次后抄送上级，0=不抄送 */
  ccSupervisorAfterCount?: number;
}

/** 考核规则 */
export interface AssessmentConfig {
  /** 考核分级（按超时天数分级，每级固定金额） */
  tiers: AssessmentTier[];
  /** 免考核的节点名称列表 */
  exemptNodeNames?: string[];
}

/** 考核分级 */
export interface AssessmentTier {
  /** 分级名称（如 '一级考核(3-5天)'） */
  name: string;
  /** 超时天数下限（含） */
  minOverdueDays: number;
  /** 超时天数上限（不含），null=无上限 */
  maxOverdueDays: number | null;
  /** 该档固定考核金额（元） */
  penaltyAmount: number;
}

/**
 * 审批节点定义
 */
export interface WorkflowNodeDef {
  /** 节点顺序，从1开始 */
  order: number;
  /** 节点显示名称 */
  name: string;
  /** 环节类型（做什么） */
  type: NodeType;
  /** 处理人规则（找谁做，approval / data_input 类型必填） */
  handler?: HandlerRule;
  /** 签署模式（多人时怎么协同），默认 'or' */
  signMode?: SignMode;
  /** 条件定义（条件节点），支持单个条件或 AND 条件数组 */
  condition?: ConditionDef | ConditionDef[];
  /** 数据录入表单 schema（仅 data_input 类型） */
  inputSchema?: NodeInputSchema;
  /** 字段权限配置：控制每个字段在该节点下的可见/可编辑状态 */
  fieldPermissions?: Record<string, FieldPermission>;
  /** 下拉选项过滤：控制 select 类型字段的可选选项（独立于权限） */
  fieldOptionFilter?: Record<string, string[]>;
  /** 节点交互类型：决定显示哪些操作按钮（默认 'approval'） */
  interactionType?: NodeInteractionType;
  /** 节点时限配置（不配置表示无时限约束） */
  timeout?: TimeoutConfig;
}

/**
 * 审批流程定义
 */
export interface WorkflowDef {
  /** 审批节点列表 */
  nodes: WorkflowNodeDef[];
  /** 抄送角色列表 */
  ccRoles?: string[];
  /** 指定在哪个审批节点（node_order）通过后触发抄送。未配置时默认为最后一个审批节点的 order */
  ccAfterNode?: number;
}

// =====================================================
// 流程预览相关类型
// =====================================================

/**
 * 流程预览上下文结果
 * resolvePreviewContext 回调的返回值，用于在表单填写阶段动态注入计算字段
 */
export interface PreviewContextResult {
  /** 注入到 formData 的上下文字段（如 _needsManagerApproval） */
  contextFields: Record<string, unknown>;
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
  /** 提交前回调：业务校验和数据增强，返回值合并到 formData */
  beforeSubmit?: (
    formData: Record<string, unknown>,
    userId: number
  ) => Promise<Record<string, unknown>>;
  /** 审批通过回调（整个流程完成时触发，可选） */
  onApproved?: (instance: OaInstanceRow, formData: Record<string, unknown>) => Promise<void>;
  /** 审批驳回回调（可选） */
  onRejected?: (instance: OaInstanceRow, formData: Record<string, unknown>) => Promise<void>;
  /** data_input 节点完成回调（可选，按节点序号分发） */
  onNodeCompleted?: (
    instance: OaInstanceRow,
    nodeOrder: number,
    nodeData: Record<string, unknown>,
    formData: Record<string, unknown>
  ) => Promise<void>;
  /** 动态抄送角色解析（可选）
   * 在 beforeSubmit 之后调用，接收已增强的 formData，
   * 返回角色编码数组。优先级高于 workflowDef.ccRoles。
   * 不提供此回调的表单类型继续使用 workflowDef.ccRoles 静态配置。
   */
  getCCRoles?: (formData: Record<string, unknown>) => string[];
  /** 流程预览上下文解析（可选）
   * 在表单填写阶段调用，根据当前表单数据动态注入计算字段，
   * 用于流程预览中的条件节点过滤。
   * 与 beforeSubmit 的区别：无校验、无副作用、出错时返回空上下文。
   * 不提供此回调的表单类型，流程预览使用原始 formData 评估条件。
   */
  resolvePreviewContext?: (
    formData: Record<string, unknown>,
    userId: number
  ) => Promise<PreviewContextResult>;
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
 * - pending: 等待人工审批
 * - processing: auto 节点异步执行中（系统处理中）
 * - approved: 审批通过（终态）
 * - rejected: 人工驳回（终态）
 * - erp_failed: auto 节点系统执行失败（可重试）
 * - cancelled: 已取消（终态）
 * - withdrawn: 已撤回（终态）
 */
export type ApprovalStatus =
  | 'pending'
  | 'processing'
  | 'approved'
  | 'rejected'
  | 'erp_failed'
  | 'cancelled'
  | 'withdrawn';

/**
 * 审批节点状态
 * - processing: auto 节点异步执行中
 * - failed: auto 节点执行失败（可重试，区别于人工 rejected）
 */
export type ApprovalNodeStatus =
  | 'pending'
  | 'processing'
  | 'approved'
  | 'rejected'
  | 'transferred'
  | 'failed'
  | 'skipped'
  | 'cancelled';

/**
 * 外部系统交互追踪元数据
 * 存储在 oa_approval_instances.erp_meta 中
 * 用于追踪所有外部系统（ERP 等）的交互状态，非限于 ERP
 */
export interface ErpMeta {
  /** 外部系统处理状态 */
  status:
    | 'pending'
    | 'processing'
    | 'paying'
    | 'purchasing'
    | 'storing'
    | 'completed'
    | 'erp_completed'
    | 'erp_failed';
  /** ERP返回数据（账单ID、资产ID等） */
  responseData: Record<string, unknown>;
  /** ERP错误信息 */
  requestLog: Record<string, unknown> | null;
  /** APA编号（用于ERP备注） */
  applicationNo: string;
  /** 重试次数 */
  retries: number;
}

/**
 * oa_approval_instances 表行
 */
export interface OaInstanceRow {
  id: number;
  instance_no: string;
  form_type_id: number;
  title: string;
  form_data: Record<string, unknown>;
  status: ApprovalStatus;
  applicant_id: number;
  applicant_name: string;
  applicant_dept: string | null;
  current_node_order: number;
  /** ERP处理元数据 */
  erp_meta: ErpMeta | null;
  submitted_at: Date;
  completed_at: Date | null;
  created_at: Date;
  updated_at: Date;
}

/**
 * oa_approval_nodes 表行
 */
export interface OaNodeRow {
  id: number;
  instance_id: number;
  node_order: number;
  node_name: string;
  node_type: NodeType;
  role_code: string | null;
  assigned_user_id: number | null;
  assigned_user_name: string | null;
  /** 审批人头像URL（LEFT JOIN users 表获取） */
  assigned_user_avatar?: string | null;
  status: ApprovalNodeStatus;
  /** 签署模式：or=或签，and=会签，NULL=单人环节 */
  sign_mode: SignMode | null;
  comment: string | null;
  acted_at: Date | null;
  is_countersign: boolean;
  countersign_parent_node_id: number | null;
  input_schema: NodeInputSchema | null;
  input_data: Record<string, unknown> | null;
  /** 节点截止时间 */
  deadline_at: Date | null;
  /** 时限配置快照（创建时从 WorkflowNodeDef.timeout 复制） */
  timeout_config: TimeoutConfig | null;
  /** 最后催办时间 */
  last_reminder_at: Date | null;
  /** 已催办次数 */
  reminder_count: number;
  /** 首次抄送上级时间 */
  cc_supervisor_at: Date | null;
  created_at: Date;
  updated_at: Date;
}

/**
 * oa_approval_cc 表行
 */
export interface OaCcRow {
  id: number;
  instance_id: number;
  user_id: number;
  user_name: string | null;
  /** 抄送人头像URL（LEFT JOIN users 表获取） */
  avatar?: string | null;
  read_at: Date | null;
  created_at: Date;
}

/**
 * 操作类型
 */
export type ApprovalActionType =
  | 'submit'
  | 'approve'
  | 'reject'
  | 'transfer'
  | 'countersign'
  | 'withdraw'
  | 'cancel'
  | 'resubmit'
  | 'update' // 操作型节点的"更新"操作（保存数据，不触发流转）
  | 'comment'; // 独立评论（不执行审批动作，仅留言）

/**
 * oa_approval_actions 表行
 */
export interface OaActionRow {
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
  startDate?: string;
  endDate?: string;
  /** 模糊搜索审批编号(instance_no)和标题(title) */
  keyword?: string;
  /** 模糊搜索申请人姓名(applicant_name) */
  applicantName?: string;
  page?: number;
  pageSize?: number;
}

/**
 * 审批统计数据
 */
export interface ApprovalStats {
  total: number;
  pending: number;
  processed: number;
  approved: number;
  rejected: number;
  /** @deprecated 与 total 值相同，请使用 total，下个版本移除 */
  my: number;
  cc: number;
}
