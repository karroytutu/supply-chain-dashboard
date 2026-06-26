/**
 * OA系统模块类型定义
 * @module types/oa
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

/** 分类颜色（Tag 展示用） */
export const CATEGORY_COLORS: Record<FormCategory, string> = {
  finance: 'gold',
  supply_chain: 'green',
  marketing: 'magenta',
  hr: 'blue',
  admin: 'purple',
};

/** 分类选项（Select 下拉用） */
export const CATEGORY_OPTIONS: Array<{ value: FormCategory; label: string }> = [
  { value: 'finance', label: '财务' },
  { value: 'supply_chain', label: '供应链' },
  { value: 'marketing', label: '营销' },
  { value: 'hr', label: '人事' },
  { value: 'admin', label: '行政' },
];

export type ActiveCategory = FormCategory | 'all';

// =====================================================
// 表单字段相关类型
// =====================================================

export type FormFieldType =
  | 'text'
  | 'textarea'
  | 'number'
  | 'money'
  | 'select'
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
  | 'signature' // 电子签名（手写签名控件，支持复用历史签名）
  // ERP 参考数据字段类型
  | 'asset_search'
  | 'erp_department'
  | 'erp_staff'
  | 'erp_payment_account'
  | 'erp_asset_category'
  // ERP 参考数据字段类型（客户授信审批使用）
  | 'erp_customer'
  | 'erp_settlement_order'
  // ERP 参考数据字段类型（客户档案修改使用）
  | 'erp_grade'
  | 'erp_group'
  | 'erp_area'
  // ERP 参考数据字段类型（采购审批使用）
  | 'erp_supplier'
  | 'erp_purchase_order'
  | 'erp_prepayment'
  | 'erp_supplier_income'
  | 'formula' // 公式计算字段（自动根据表达式求值，不可手动编辑）
  | 'modal_select' // 统一弹窗多选控件（配置驱动，支持远程搜索+固定选项+多条件筛选）
  | 'tree_select' // 树形弹窗选择器（可展开/折叠的 Tree 控件，支持父子联动勾选）
  | 'bank_account_selector'; // 银行账户历史选择器（弹窗选择，自动填充户名/账号/银行/开户行）

/**
 * 表格一键分摊配置（table 类型字段的通用能力）
 *
 * 业务场景：物流费用申请中，用户输入一笔总费用后，系统按比例自动分摊到每个商品行。
 * 例如：总金额 100 元，3 行结算金额分别为 300/500/200（合计 1000），
 *       按金额分摊后每行费用金额 = 30.00 / 50.00 / 20.00 元。
 */
export interface AllocateConfig {
  /** 支持的分摊方式（by_amount=按金额占比, by_quantity=按数量占比） */
  methods: Array<'by_amount' | 'by_quantity'>;
  /** 分摊结果写入哪个子字段 key（如 'feeAmount'） */
  targetField: string;
  /** 按金额分摊时，读取哪个子字段作为权重（如 'settleAmount'） */
  amountWeightField?: string;
  /** 按数量分摊时，读取哪个子字段作为权重（如 'quantity'） */
  quantityWeightField?: string;
  /** 分摊后需要反算的派生字段（如 费用单价 = 费用金额 ÷ 数量） */
  derivedFields?: Array<{
    target: string;     // 写入的子字段 key（如 'feeUnitPrice'）
    dividend: string;   // 被除数字段 key（如 'feeAmount'）
    divisor: string;    // 除数字段 key（如 'quantity'）
    precision: number;  // 小数位数
  }>;
}

export interface FormField {
  key: string;
  label: string;
  type: FormFieldType;
  required: boolean;
  placeholder?: string;
  defaultValue?: unknown;
  disabled?: boolean;
  /** table 类型专用：行锁定（禁止添加/删除行），适用于行数据由外部逻辑填充的场景 */
  rowLocked?: boolean;
  /** table 类型专用：一键分摊配置，启用后表格上方显示分摊操作区（标准金额输入 + 方式下拉，选好自动触发） */
  allocate?: AllocateConfig;
  bizAlias?: string;
  print?: boolean;
  options?: Array<{ value: string | number; label: string; key?: string }>;
  /** select 类型：从另一个字段的值动态生成选项（如从 modal_select 带入的 _goodsUnits 中提取单位列表） */
  optionsFromField?: string;
  unit?: string;
  min?: number;
  max?: number;
  precision?: number;
  suffix?: string;
  maxLength?: number;
  maxCount?: number;
  accept?: string;
  multiple?: boolean;
  format?: string;
  addressModel?: 'city' | 'district' | 'street';
  upper?: boolean;
  limit?: 5 | 10;
  children?: FormField[];
  statField?: Array<{ componentId: string; label: string }>;
  link?: string;
  content?: string;
  /** 条件显示（支持单个条件、AND条件数组、或ConditionGroup） */
  visibleWhen?: ConditionDef | ConditionDef[] | ConditionGroup;
  /** 条件必填（满足条件时字段变为必填） */
  requiredWhen?: ConditionDef | ConditionDef[] | ConditionGroup;
  /** ERP参考数据API标识 */
  searchApi?: 'erp_assets' | 'erp_departments' | 'erp_staff' | 'erp_payment_accounts' | 'erp_asset_categories' | 'erp_customers' | 'erp_settlement_orders' | 'erp_grades' | 'erp_groups' | 'erp_areas' | 'erp_suppliers' | 'erp_prepayments' | 'erp_supplier_incomes' | 'erp_purchase_orders' | 'erp_supplier_debts' | 'purchase_settlements' | 'promotion_goods';
  /** tree_select: 树形数据 API 标识 */
  treeSearchApi?: string;
  /** 选择后自动填充其他字段，key=目标字段名，value=选中对象的属性名 */
  autoFill?: Record<string, string>;
  /** 级联字段key（如 erp_staff 级联 erp_department 的值） */
  cascadeFrom?: string;
  /** modal_select: 级联参数映射 { API参数名: 表单字段名 } */
  cascadeParams?: Record<string, string>;
  /** modal_select: 静态查询参数（固定过滤条件，与 cascadeParams 的动态参数互补） */
  defaultQueryParams?: Record<string, string | number | boolean>;
  /** modal_select: 值字段（选中后存储的 ID/key） */
  valueKey?: string;
  /** modal_select: 显示字段（Tag/小表格主列） */
  labelKey?: string;
  /** modal_select: 金额字段（只读展示合计行） */
  amountKey?: string;
  /** modal_select: 弹窗表格列定义 */
  columns?: ModalSelectColumn[];
  /** modal_select: 筛选条件配置 */
  filters?: ModalSelectFilter[];
  /** modal_select: 是否启用分页 */
  paginated?: boolean;
  /** modal_select: 限定可选范围来自另一个 modal_select 字段已选中的记录 */
  scopeFromField?: string;
  /** modal_select: 搜索框提示文字 */
  searchPlaceholder?: string;
  /** ERP字段选中后，将显示名称存入 formData 的哪个 key（如 'customerName'） */
  nameField?: string;
  /** asset_search 显示哪些子字段 */
  displayFields?: string[];
  /** photo 类型用途：storefront=门头照，license=营业执照（默认 license） */
  photoPurpose?: 'license' | 'storefront';
  /** 公式表达式（formula 类型使用），如 "quantity * unitPrice" 或 "sum(lines.amount)" */
  formula?: string;
  /** 公式结果精度（小数位数），默认 2 */
  formulaPrecision?: number;
  /** 是否在表单中隐藏（值仍存储在 formData 中，供 autoFill 等机制使用） */
  hidden?: boolean;
  /** table 类型专用：列分组标识，相同值的列归入同一分组表头（Ant Design 嵌套列） */
  columnGroup?: string;
  /** table 类型专用：分组表头提示文字，显示在分组标题末尾（如"选填"） */
  columnGroupTip?: string;
  /** table 类型专用：自动同步值，从同行另一个字段复制值（源字段变更时实时同步） */
  syncFrom?: string;
}

/** modal_select 弹窗表格列定义 */
export interface ModalSelectColumn {
  title: string;
  dataIndex: string;
  format?: 'date' | 'money' | 'text';
  width?: number;
  ellipsis?: boolean;
  align?: 'left' | 'right' | 'center';
}

/** modal_select 筛选条件配置 */
export interface ModalSelectFilter {
  type: 'keyword' | 'date-range' | 'select';
  /** API 参数名 */
  key: string;
  label?: string;
  placeholder?: string;
  /** 默认值，如 'last7days' */
  defaultValue?: string;
  /** select 类型的数据源 API */
  searchApi?: string;
}

export interface FormSchema {
  /** 业务字段：用户需要看到或填写的字段，参与权限配置 */
  fields: FormField[];
  /** 系统数据：系统内部辅助数据，不参与权限校验和前端渲染 */
  internalFields?: FormField[];
}

// =====================================================
// 节点级字段权限与交互类型
// =====================================================

/** 字段权限类型 */
export type FieldPermission = 'editable' | 'readonly' | 'hidden';

/**
 * 字段权限 DB 覆盖配置结构
 * - nodes: 按节点 order 配置的字段权限覆盖，"0"=发起阶段，"1"-"N"=审批环节
 */
export interface FieldPermissionsOverride {
  /** 节点权限配置。"0"=发起阶段，"1"-"N"=审批环节 */
  nodes: Record<string, Record<string, FieldPermission>>;
}

/** 查看权限类型（非办理人查看详情时使用，仅 readonly/hidden） */
export type ViewPermission = 'readonly' | 'hidden';

/**
 * 查看权限配置结构
 * - nodes: 按节点 order 配置的查看权限覆盖，"0"=发起阶段（发起人），"1"-"N"=审批环节
 * - 未配置时默认全部隐藏
 */
export interface ViewPermissionsOverride {
  nodes: Record<string, Record<string, ViewPermission>>;
  /** 数据查看人（非流程参与人，通过 dataReadRoles 匹配）的查看权限 */
  dataRead?: Record<string, ViewPermission>;
}

/**
 * @deprecated 已废弃，后端不再使用 interactionType 字段，改为根据 NodeType 决定按钮布局。
 * 保留类型定义以兼容旧代码，请勿在新代码中使用。
 */
export type NodeInteractionType = 'approval' | 'operation';

// =====================================================
// 节点时限配置类型
// =====================================================

/** 节点时限配置 */
export interface TimeoutConfig {
  /** 时限时长（分钟） */
  durationMinutes: number;
  /** 免考核宽限期（分钟） */
  gracePeriodMinutes?: number;
  /** 催办策略（不配置=不催办） */
  reminder?: ReminderConfig;
  /** 考核规则（不配置=不考核） */
  assessment?: AssessmentConfig;
}

/** 催办策略 */
export interface ReminderConfig {
  firstReminderDelayMinutes?: number;
  intervalMinutes?: number;
  maxReminders?: number;
  ccSupervisorAfterCount?: number;
}

/** 考核规则 */
export interface AssessmentConfig {
  tiers: AssessmentTier[];
  exemptNodeNames?: string[];
}

/** 考核分级 */
export interface AssessmentTier {
  name: string;
  minOverdueDays: number;
  maxOverdueDays: number | null;
  penaltyAmount: number;
}

// =====================================================
// 审批流程相关类型
// =====================================================

export type NodeType = 'approval' | 'handle' | 'auto' | 'cc';

export type SignMode = 'or' | 'and';

export interface HandlerRule {
  roleCode?: string;
  useSupervisor?: boolean;
  userId?: number;
  useApplicant?: boolean;
}

export interface ConditionDef {
  field: string;
  operator: '>' | '<' | '==' | '>=' | '<=' | 'not_empty' | 'is_empty';
  value?: number | string;
}

/** 条件组：支持 OR（match='any'）或 AND（match='all'）逻辑 */
export interface ConditionGroup {
  match: 'any' | 'all';
  conditions: ConditionDef[];
}

/** 数据录入节点 - 录入字段定义
 * @deprecated inputSchema 机制已废弃，字段统一迁移至 formSchema + fieldPermissions
 */
export interface NodeInputField {
  name: string;
  label: string;
  type: 'text' | 'number' | 'date' | 'select' | 'upload' | 'amount' | 'table'
    | 'asset_search' | 'erp_department' | 'erp_staff' | 'erp_payment_account' | 'erp_asset_category'
    | 'erp_customer' | 'erp_settlement_order'
    | 'erp_grade' | 'erp_group' | 'erp_area'
    | 'erp_prepayment' | 'erp_supplier_income';
  required?: boolean;
  options?: Array<{ label: string; value: unknown }>;
  defaultValue?: unknown;
  readonly?: boolean;
  columns?: NodeInputField[];
  searchApi?: 'erp_assets' | 'erp_departments' | 'erp_staff' | 'erp_payment_accounts' | 'erp_asset_categories' | 'erp_customers' | 'erp_settlement_orders' | 'erp_grades' | 'erp_groups' | 'erp_areas' | 'erp_suppliers' | 'erp_prepayments' | 'erp_supplier_incomes' | 'erp_purchase_orders';
  autoFill?: Record<string, string>;
  cascadeFrom?: string;
  multiple?: boolean;
  visibleWhen?: ConditionDef | ConditionDef[] | ConditionGroup;
  requiredWhen?: ConditionDef | ConditionDef[] | ConditionGroup;
}

/** 数据录入节点 - 录入表单 Schema
 * @deprecated inputSchema 机制已废弃，字段统一迁移至 formSchema + fieldPermissions
 */
export interface NodeInputSchema {
  fields: NodeInputField[];
}

export interface WorkflowNodeDef {
  order: number;
  name: string;
  type: NodeType;
  /** @deprecated 使用 handler.roleCode 代替 */
  roleCode?: string;
  /** @deprecated 使用 handler.userId 代替 */
  userId?: number;
  handler?: HandlerRule;
  signMode?: SignMode;
  condition?: ConditionDef | ConditionDef[] | ConditionGroup;
  /** 数据录入表单 schema（仅 data_input 类型）
   * @deprecated inputSchema 机制已废弃，字段统一迁移至 formSchema + fieldPermissions
   */
  inputSchema?: NodeInputSchema;
  /** @deprecated 字段权限已改为 DB 唯一来源，代码中不再定义 */
  fieldPermissions?: Record<string, FieldPermission>;
  /** 下拉选项过滤：控制 select 类型字段的可选选项 */
  fieldOptionFilter?: Record<string, string[]>;
  /**
   * @deprecated 已废弃，后端不再使用 interactionType 字段，改为根据 nodeType 决定按钮布局。
   * 保留字段以兼容旧代码，请勿在新代码中使用。
   */
  interactionType?: NodeInteractionType;
  /** 条件业务描述（管理员视角的可读文本，如"任一商品可售天数 > 45天"） */
  conditionDescription?: string;
  /** 抄送角色编码列表（仅 cc 类型节点使用） */
  ccRoles?: string[];
  /** 节点时限配置（不配置表示无时限约束） */
  timeout?: TimeoutConfig;
}

export interface WorkflowDef {
  nodes: WorkflowNodeDef[];
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
  /** 允许发起此表单的角色编码列表 */
  allowedRoles?: string[];
  /** 可查看该表单数据的角色编码列表 */
  dataReadRoles?: string[];
  /** 可导出该表单数据的角色编码列表 */
  dataExportRoles?: string[];
  /** 允许发起此表单的用户ID列表 */
  allowedUsers?: number[];
  /** 可查看该表单数据的用户ID列表 */
  dataReadUsers?: number[];
  /** 可导出该表单数据的用户ID列表 */
  dataExportUsers?: number[];
  /** 字段权限 DB 覆盖值（发起阶段 + 环节覆盖） */
  fieldPermissions?: FieldPermissionsOverride;
  /** 查看权限 DB 覆盖值（非办理人查看详情时使用） */
  viewPermissions?: ViewPermissionsOverride;
}

// =====================================================
// 审批状态相关类型
// =====================================================

export type ApprovalStatus = 'pending' | 'processing' | 'approved' | 'rejected' | 'erp_failed' | 'cancelled' | 'withdrawn';

export type ApprovalNodeStatus = 'pending' | 'processing' | 'approved' | 'rejected' | 'transferred' | 'failed' | 'cancelled' | 'send_back';

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
  applicantId: number;
  applicantName: string;
  applicantDept: string | null;
  /** 申请人头像URL */
  applicantAvatar?: string | null;
  currentNodeOrder: number;
  currentNodeName: string | null;
  /** 当前节点处理人姓名 */
  currentApproverName: string | null;
  /** 当前节点截止时间（仅 pending 状态有值） */
  currentNodeDeadlineAt: string | null;
  submittedAt: string;
  completedAt: string | null;
  /** 抄送是否未读（仅“抄送我的”列表中有意义） */
  isUnread?: boolean;
  /** 表单字段预览摘要 */
  previewFields: Array<{ label: string; value: string }>;
}

export interface ApprovalNode {
  id: number;
  nodeOrder: number;
  /** 执行轮次（退回后重新走同一环节时 round + 1） */
  round: number;
  nodeName: string;
  nodeType: string;
  roleCode?: string | null;
  /** 候选审批人 ID 数组（或签/会签时存多人） */
  assignedUserIds: number[] | null;
  /** 候选审批人姓名数组 */
  assignedUserNames: string[] | null;
  /** 审批人头像URL（取第一人） */
  assignedUserAvatar?: string | null;
  status: ApprovalNodeStatus;
  comment: string | null;
  actedAt: string | null;
  actionAt?: string | null;  // Alias for actedAt
  isCountersign: boolean;
  /** 签署模式：or=或签, and=会签 */
  signMode?: SignMode | null;
  /** 节点截止时间 */
  deadlineAt: string | null;
  /** 时限配置快照 */
  timeoutConfig: TimeoutConfig | null;
  /** 已催办次数 */
  reminderCount: number;
  /** 首次抄送上级时间 */
  ccSupervisorAt: string | null;
}

/** 操作附件元数据（图片/文件） */
export interface AttachmentMeta {
  /** 原始文件名 */
  name: string;
  /** 服务器存储路径 */
  url: string;
  /** 文件大小（字节） */
  size: number;
  /** MIME 类型 */
  type: string;
  /** 是否为图片 */
  isImage: boolean;
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
  attachments: AttachmentMeta[];
  actionAt: string;
  createdAt?: string;  // Alias for actionAt
}

export interface CcUser {
  id: number;
  userId: number;
  userName: string | null;
  /** 抄送人头像URL */
  avatar?: string | null;
  readAt: string | null;
  /** 触发抄送的 CC 节点 order，null 表示旧机制数据 */
  sourceNodeOrder?: number | null;
}

/** ERP处理元数据 */
export interface ErpMeta {
  status: 'pending' | 'processing' | 'paying' | 'purchasing' | 'storing' | 'completed' | 'erp_completed' | 'erp_failed';
  responseData: Record<string, unknown>;
  requestLog: Record<string, unknown> | null;
  applicationNo: string;
  retries: number;
}

export interface ApprovalDetail extends ApprovalInstance {
  formData: Record<string, unknown>;
  formSchema: FormSchema;
  workflowDef: WorkflowDef | null;
  nodes: ApprovalNode[];
  actions: ApprovalAction[];
  ccUsers: CcUser[];
  erpMeta: ErpMeta | null;
  /** 字段权限 DB 覆盖值（发起阶段 + 环节覆盖） */
  fieldPermissions?: FieldPermissionsOverride;
  /** 查看权限 DB 覆盖值（非办理人查看详情时使用） */
  viewPermissions?: ViewPermissionsOverride;
  /** 可查看该表单数据的角色列表（前端判断数据查看人身份用） */
  dataReadRoles?: string[];
  /** 可查看该表单数据的用户ID列表（前端判断数据查看人身份用） */
  dataReadUsers?: number[];
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
  keyword?: string;
  applicantName?: string;
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
// 工具类型
// =====================================================

export const STATUS_LABELS: Record<ApprovalStatus, string> = {
  pending: '处理中',
  processing: '处理中',
  approved: '已通过',
  rejected: '已拒绝',
  erp_failed: '处理失败',
  cancelled: '已取消',
  withdrawn: '已撤回',
};

export const STATUS_COLORS: Record<ApprovalStatus, string> = {
  pending: 'blue',
  processing: 'processing',
  approved: 'green',
  rejected: 'red',
  erp_failed: 'error',
  cancelled: 'default',
  withdrawn: 'orange',
};

export const NODE_STATUS_LABELS: Record<ApprovalNodeStatus, string> = {
  pending: '待处理',
  processing: '处理中',
  approved: '已通过',
  rejected: '已拒绝',
  transferred: '已转交',
  failed: '执行失败',
  cancelled: '已取消',
  send_back: '已退回',
};

export const NODE_STATUS_COLORS: Record<ApprovalNodeStatus, string> = {
  pending: 'blue',
  processing: 'processing',
  approved: 'green',
  rejected: 'red',
  transferred: 'orange',
  failed: 'error',
  cancelled: 'default',
  send_back: 'orange',
};

// =====================================================
// 类型别名（向后兼容）
// =====================================================

/** @deprecated 使用 ApprovalInstance */
export type OaInstance = ApprovalInstance;

/** @deprecated 使用 ApprovalNode */
export type OaNode = ApprovalNode;

/** @deprecated 使用 ApprovalAction */
export type OaAction = ApprovalAction;

// =====================================================
// 流程交接相关类型
// =====================================================

export interface AffectedFormType {
  code: string;
  name: string;
  category: string;
  affectedNodes: Array<{ order: number; name: string }>;
}

export interface AffectedInstance {
  nodeId: number;
  instanceId: number;
  instanceNo: string;
  title: string;
  formTypeName: string;
  formTypeCode: string;
  nodeOrder: number;
  nodeName: string;
}

export interface HandoverScanResult {
  formTypes: AffectedFormType[];
  instances: AffectedInstance[];
  summary: {
    formTypeCount: number;
    instanceCount: number;
    nodeCount: number;
  };
}

export interface HandoverExecuteRequest {
  sourceUserId: number;
  targetUserId: number;
  formTypeCodes?: string[];
  /** 选定的在途审批单节点 ID（不传则交接所有在途节点） */
  instanceIds?: number[];
  includeInFlightInstances?: boolean;
}

export interface HandoverExecuteResult {
  handoverId: number;
  instancesUpdated: number;
  affectedInstanceIds: number[];
}

export interface HandoverHistoryItem {
  id: number;
  sourceUserName: string;
  targetUserName: string;
  operatorName: string;
  instancesUpdated: number;
  affectedFormTypeCodes: string[];
  affectedInstanceIds: number[];
  createdAt: string;
}
