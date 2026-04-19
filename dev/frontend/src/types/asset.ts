/**
 * 固定资产管理模块类型定义
 */

/** 申请类型 */
export type ApplicationType = 'purchase' | 'transfer' | 'maintenance' | 'disposal';

/** 申请状态 */
export type ApplicationStatus =
  | 'pending'
  | 'quoting'
  | 'paying'
  | 'purchasing'
  | 'storing'
  | 'approved'
  | 'rejected'
  | 'cancelled'
  | 'completed'
  | 'erp_failed';

/** 领用调拨子类型 */
export type TransferType = 'requisition' | 'transfer';

/** 紧急程度 */
export type AssetUrgency = 'normal' | 'urgent' | 'critical';

/** 清理方式 */
export type DisposalType = 'sale' | 'inventory_loss';

/** 资产申请记录 */
export interface AssetApplication {
  id: number;
  applicationNo: string;
  type: ApplicationType;
  status: ApplicationStatus;
  formData: Record<string, unknown>;
  oaInstanceId: number | null;
  erpResponseData: Record<string, unknown> | null;
  applicantId: number;
  applicantName: string | null;
  departmentId: number | null;
  remark: string | null;
  createdAt: string;
  updatedAt: string;
}

/** 舟谱资产简要信息 */
export interface ErpAsset {
  id: number;
  code: string;
  name: string;
  assetTypeId?: number;
  assetTypeName?: string;
  deptId?: number;
  deptName?: string;
  userId?: number;
  userName?: string;
  depositAddress?: string;
  originalValue?: string;
  accumulatedDepreciation?: string;
  netValue?: string;
  usageStatus?: string;
  usageStatusStr?: string;
  [key: string]: unknown;
}

/** 舟谱资产分类 */
export interface ErpAssetCategory {
  id: number;
  name: string;
  parentId?: number;
  children?: ErpAssetCategory[];
}

/** 舟谱员工 */
export interface ErpStaff {
  id: number;
  name: string;
  shortName?: string;
  deptId: number;
  deptName: string;
  phone?: string;
  isAdmin?: boolean;
}

/** 舟谱部门 */
export interface ErpDepartment {
  deptId: number;
  deptName: string;
}

/** 舟谱付款账户 */
export interface ErpPaymentAccount {
  id: number;
  pid: number;
  level: number;
  code: string;
  text: string;
  name: string;
  initAmount: string;
  state: string;
  children?: ErpPaymentAccount[] | null;
}

/** 采购明细行 */
export interface PurchaseLine {
  assetName: string;
  specification: string;
  quantity: number;
  estimatedBudget: string;
  supplierName?: string;
  quotationPrice?: string;
  quotationTotal?: string;
  assetTypeId?: number;
  deptId?: number;
  userId?: number;
  depositAddress?: string;
  estimatedResidualValueRate?: number;
  depreciationMethod?: string;
  estimatedServiceMonths?: number;
  quotationNote?: string;
  quotationAttachmentUrls?: string[];
  actualPrice?: string;
  arrivalDate?: string;
  note?: string;
  units?: UnitAllocation[];
}

/** 逐件分配 */
export interface UnitAllocation {
  deptId: number;
  userId: number;
  depositAddress: string;
}

/** 采购表单数据 */
export interface PurchaseFormData {
  purchaseReason: string;
  urgency: AssetUrgency;
  attachmentUrls: string[];
  lines: PurchaseLine[];
  paymentAmount?: string;
  paymentDate?: string;
  paymentSubjectId?: number;
  receiptUrls?: string[];
  paymentNote?: string;
  purchaseDate?: string;
  purchaseNote?: string;
}

/** 调拨明细行 */
export interface TransferLine {
  erpAssetId: number;
  assetNo: string;
  assetName: string;
  currentDeptName?: string;
  currentUserName?: string;
  currentLocation?: string;
  toDeptId: number;
  toUserId: number;
  toDepositAddress: string;
}

/** 调拨表单数据 */
export interface TransferFormData {
  transferType: TransferType;
  transferDate: string;
  reason: string;
  lines: TransferLine[];
}

/** 维修询价明细 */
export interface MaintenanceQuotation {
  supplierName: string;
  quotationPrice: string;
  quotationNote?: string;
  quotationAttachmentUrls?: string[];
}

/** 维修表单数据 */
export interface MaintenanceFormData {
  erpAssetId: number;
  assetNo: string;
  assetName: string;
  description: string;
  estimatedCost: string;
  urgency: AssetUrgency;
  attachmentUrls: string[];
  quotations?: MaintenanceQuotation[];
  paymentAmount?: string;
  paymentDate?: string;
  paymentSubjectId?: number;
  receiptUrls?: string[];
  paymentNote?: string;
}

/** 清理表单数据 */
export interface DisposalFormData {
  erpAssetId: number;
  assetNo: string;
  assetName: string;
  originalValue?: string;
  accumulatedDepreciation?: string;
  netValue?: string;
  disposalType: DisposalType;
  disposalReason: string;
  hasIncome: boolean;
  disposalValue?: string;
  disposalDate: string;
  attachmentUrls: string[];
}

/** ERP 回调创建的资产记录 */
export interface CreatedAssetRecord {
  lineIndex: number;
  unitIndex: number;
  erpAssetId: number;
  code: string;
}

/** 申请列表查询参数 */
export interface ApplicationListParams {
  type?: ApplicationType;
  status?: ApplicationStatus;
  page?: number;
  pageSize?: number;
}

/** 分页结果 */
export interface PaginatedResult<T> {
  data: T[];
  total: number;
  page: number;
  pageSize: number;
}

/** 申请状态标签映射 */
export const APPLICATION_STATUS_MAP: Record<ApplicationStatus, { label: string; color: string }> = {
  pending: { label: '待审批', color: 'blue' },
  quoting: { label: '询价中', color: 'orange' },
  paying: { label: '支付中', color: 'orange' },
  purchasing: { label: '采购中', color: 'orange' },
  storing: { label: '入库中', color: 'orange' },
  approved: { label: '审批通过', color: 'green' },
  rejected: { label: '已驳回', color: 'red' },
  cancelled: { label: '已取消', color: 'default' },
  completed: { label: '已完成', color: 'green' },
  erp_failed: { label: 'ERP操作失败', color: 'red' },
};

/** 申请类型标签映射 */
export const APPLICATION_TYPE_MAP: Record<ApplicationType, { label: string; icon: string }> = {
  purchase: { label: '采购申请', icon: 'ShoppingCartOutlined' },
  transfer: { label: '领用调拨', icon: 'SwapOutlined' },
  maintenance: { label: '维修申请', icon: 'ToolOutlined' },
  disposal: { label: '清理申请', icon: 'DeleteOutlined' },
};
