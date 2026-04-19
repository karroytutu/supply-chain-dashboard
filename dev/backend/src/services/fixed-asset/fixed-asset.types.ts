/**
 * 固定资产审批模块 - 共享类型定义
 * @module services/fixed-asset/fixed-asset.types
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

/** 清理方式 → incrdecrId 映射 */
export const DISPOSAL_INCRDECR_MAP: Record<DisposalType, number> = {
  sale: 5,
  inventory_loss: 8,
};

/** 费用科目映射 */
export const FEE_SUBJECT = {
  /** 购置固定资产 - 采购流程 */
  PURCHASE: { subjectId: 217, subjectName: '购置固定资产' },
  /** 维修费用 - 维修流程 */
  MAINTENANCE: { subjectId: 412, subjectName: '维修费用' },
  /** 资产清理收入 - 清理流程 */
  DISPOSAL_INCOME: { subjectId: 209, subjectName: '资产清理收入' },
} as const;

/** 折旧方法 */
export const DEPRECIATION_METHODS = [
  { label: '年限平均法', value: 'YEARS_AVERAGE_METHOD' },
] as const;

/** 资产申请记录 */
export interface AssetApplication {
  id: number;
  applicationNo: string;
  type: ApplicationType;
  status: ApplicationStatus;
  formData: Record<string, any>;
  oaInstanceId: number | null;
  erpRequestLog: Record<string, any> | null;
  erpResponseData: Record<string, any> | null;
  applicantId: number;
  applicantName: string | null;
  departmentId: number | null;
  remark: string | null;
  createdAt: Date;
  updatedAt: Date;
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
  [key: string]: any;
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
  roles?: Array<{ id: number; name: string; positionId: number; positionName: string }>;
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
  // 阶段3追加
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
  // 阶段7追加
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

/** 维修询价明细 */
export interface MaintenanceQuotation {
  supplierName: string;
  quotationPrice: string;
  quotationNote?: string;
  quotationAttachmentUrls?: string[];
}

/** ERP 回调创建的资产记录 */
export interface CreatedAssetRecord {
  lineIndex: number;
  unitIndex: number;
  erpAssetId: number;
  code: string;
}

/** 创建申请请求参数 */
export interface CreateApplicationRequest {
  type: ApplicationType;
  formData: Record<string, any>;
  remark?: string;
}

/** 申请列表查询参数 */
export interface ApplicationListParams {
  type?: ApplicationType;
  status?: ApplicationStatus;
  page?: number;
  pageSize?: number;
}
