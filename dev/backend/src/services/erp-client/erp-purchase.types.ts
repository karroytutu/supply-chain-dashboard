/**
 * ERP 采购相关类型定义
 * @module services/erp-client/erp-purchase.types
 */

// =====================================================
// 采购订单
// =====================================================

/** 采购订单列表项 */
export interface PurchaseOrderListItem {
  billId: number;
  billStr: string;
  supplierId: number;
  supplierName: string;
  supplierCode?: string;
  state: 'UN_APPROVED' | 'SIGN' | 'CANCEL' | string;
  billFrom: string;
  salesmanId: number;
  salesmanName: string;
  deptId: number;
  deptName: string;
  warehouseId: number;
  warehouseName: string;
  totalAmount: string;
  stockInTotalAmount?: string | null;
  payAmount?: string | null;
  debtAmount?: string | null;
  approveTime?: string | null;
  operDateTime: string;
  workDateTime: string;
  operName: string;
  remark?: string;
  antiAudit: boolean;
}

/** 采购订单详情（含行项） */
export interface PurchaseOrderDetailResponse {
  id: number;
  billStr: string;
  sophonOrderNo?: string;
  state: string;
  billType: string;
  worktime: string;
  createTime: string;
  salesmanId: number;
  salesmanName: string;
  operId: number;
  operName: string;
  deptId: number;
  deptName: string;
  supplierId: number;
  supplierName: string;
  warehouseId: number;
  warehouseName: string;
  qualityType: string;
  totalAmount: string;
  totalTaxAmount: string;
  totalNoTaxAmount: string;
  remark?: string;
  details: PurchaseOrderLineItem[];
}

/** 采购订单行项 */
export interface PurchaseOrderLineItem {
  platformDetailId?: number;
  detailId: number;
  seq: number;
  goodsId: number;
  currUnitId: string;
  barcode?: string;
  realPrice: string;
  origPrice?: string;
  realtimeCostPrice?: string;
  costPrice?: string;
  guidePrice?: string;
  quantity: number;
  /** 基本单位数量 */
  quantityS: number;
  /** 混合单位显示（如 "100件"） */
  quantityMix?: string;
  subAmount: string;
  remark?: string;
  taxRatio?: string;
  noTaxAmount?: string;
  currBasePreCostPrice?: string;
  goodsInfo: PurchaseGoodsInfo;
  goodsPriceInfo: PurchaseGoodsPriceInfo;
  stockInfo: PurchaseStockInfo;
  goodsDeliveryInfo?: PurchaseDeliveryInfo;
}

/** 商品基础信息 */
export interface PurchaseGoodsInfo {
  goodsId: number;
  goodsName: string;
  categoryId?: number;
  categoryChain?: string;
  baseUnitId: string;
  baseUnitName: string;
  pkgUnitId: string;
  pkgUnitName: string;
  pkgUnitFactor: number;
  midUnitId?: string | null;
  midUnitName?: string | null;
  midUnitFactor?: number | null;
  unitFactorName?: string;
  pkgBarcode?: string;
  baseBarcode?: string;
  baseUnitType?: number;
  shelfLife: number;
  specifications?: string;
  brandId?: number;
  brandName?: string;
  typeName?: string;
  mainSupplierName?: string;
  mainSupplierId?: number;
}

/** 商品价格信息 */
export interface PurchaseGoodsPriceInfo {
  allowAltPrice?: boolean;
  /** 基本单位默认售价 */
  baseDefaultPrice?: string;
  /** 包装单位默认售价 */
  pkgDefaultPrice?: string;
  /** 基本单位采购价（定价） */
  basePurchasePrice?: string;
  /** 包装单位采购价（定价） */
  pkgPurchasePrice?: string;
  /** 基本单位上次采购价 */
  baseLastPurchasePrice?: string;
  /** 包装单位上次采购价 */
  pkgLastPurchasePrice?: string;
  /** 基本单位实时成本价 */
  baseRealtimeCostPrice?: string;
  /** 包装单位实时成本价 */
  pkgRealtimeCostPrice?: string;
  /** 基本单位参考成本价 */
  referenceCostPrice?: string;
  /** 包装单位参考成本价 */
  pkgReferenceCostPrice?: string;
}

/** 商品库存信息 */
export interface PurchaseStockInfo {
  /** 当前库存（基本单位） */
  quantity: number;
  /** 锁定库存 */
  lockedQuantity?: number;
  /** 实物库存 */
  physicalQuantity: number;
  /** 在途库存（基本单位） */
  roadInQuantity: number;
}

/** 商品物流信息 */
export interface PurchaseDeliveryInfo {
  pkgVolume?: number;
  baseVolume?: number;
  pkgWeight?: number;
  baseWeight?: number;
  specifications?: string;
}

// =====================================================
// 创建/更新采购订单请求
// =====================================================

/** 创建采购订单请求 */
export interface CreatePurchaseOrderRequest {
  supplierId: string | number;
  warehouseId: number;
  salesmanId: number;
  deptId?: number;
  workDate: string;
  remark?: string;
  billType: 'PURCHASE_ORDER';
  details: CreatePurchaseOrderDetail[];
  /** 更新时传入已有 billId，新建时留空 */
  billId?: string | number;
  billStr?: string;
  qualityType?: string;
  billFrom?: string;
  uuid?: string;
}

/** 创建采购订单行项 */
export interface CreatePurchaseOrderDetail {
  goodsId: number;
  currUnitId: string;
  realPrice: string;
  quantity: string;
  subAmount: string;
  taxRatio?: string;
  remark?: string;
  guidePrice?: string | null;
  propertyForBill?: string;
}

// =====================================================
// 预付款相关
// =====================================================

/** 可用普通预付款（list-trader-prepay 响应） */
export interface AvailablePrepayment {
  id: number;
  traderId: number;
  traderType: string;
  type: 'PRE_PAID';
  prePayType: 'NORMAL' | string;
  paidBillStr: string;
  totalAmount: string;
  realPaidAmount: string;
  writeOffAmount?: string | null;
  leftAmount: string;
  wipeOffAmount?: string | null;
  availableAmount: string;
  state: 'APPROVED' | string;
  writeOffState: 'NONE' | 'PART' | 'COMPLETE' | string;
  workTime: string;
  note?: string;
}

/** 创建采购预付款请求 */
export interface CreatePurchasePrepaymentRequest {
  /** 关联采购订单 bizId */
  relatedBizId: number;
  /** 关联采购订单号 */
  relatedBizStr: string;
  relatedBizTypeEnum: 'PURCHASE_ORDER';
  traderId: number;
  traderType: 'SUPPLIER';
  type: 'PRE_PAID';
  totalAmount: number;
  paymentDetails: Array<{
    paymentAmount: string;
    subjectId: number;
  }>;
  paymentDirection: 'OUT';
  salesmanId: string | number;
  source: 'CLOUD';
  workTime: string;
  prePaidAmount?: string;
  wipeOffAmount?: number;
  occupyBizOrderStr?: string;
  occupyPrePaymentRequestList?: unknown[];
  /** 备注（如 OA 审批编号） */
  note?: string;
}

// =====================================================
// 付款单（核销）相关
// =====================================================

/** 创建付款单请求 */
export interface CreatePaidBillRequest {
  traderId: string | number;
  salesmanId: number;
  deptId: number;
  operatorId?: string | number;
  workTime: string;
  arrivalTime?: string;
  note?: string;
  paymentDetails: Array<{
    paymentAmount: string;
    subjectId: number;
  }>;
  paymentDirection: 'OUT';
  traderType: 'SUPPLIER';
  type: 'PAID';
  wipeOffAmount?: string;
  totalAmount?: string;
  writeOffInfo: {
    invoiceList: PaidBillInvoiceItem[];
    prepayList: PaidBillPrepayItem[];
  };
  imgIds?: string[];
}

/** 付款单-应付单明细 */
export interface PaidBillInvoiceItem {
  bizId: number;
  bizType: string;
  paidAmount: string;
  discountAmount?: string;
  preAllocateAmount: string;
  leftAmount: string;
  note?: string;
  originNote?: string | null;
}

/** 付款单-预付/收入单明细 */
export interface PaidBillPrepayItem {
  paidBillId: number;
  writeOffAmount: string;
  paidBillStr: string;
  leftAmount: string;
  wipeOffAmount?: string;
}

/** 创建付款单响应 */
export interface CreatePaidBillResponse {
  id: number;
  paidBillStr: string;
  totalAmount: string;
  operateTime: string;
  workTime: string;
  state: string;
}

// =====================================================
// 供应商收入单
// =====================================================

/** 供应商收入单（income/new/list 响应） */
export interface SupplierIncomeRecord {
  id: number;
  billStr: string;
  traderId: number;
  traderName: string;
  totalAmount: string;
  taxAmount?: string;
  noTaxAmount?: string;
  leftAmount: string;
  writeOffAmount?: string | null;
  wipeOffAmount?: string | null;
  writeOffState: 'NONE' | 'PART' | 'COMPLETE' | string;
  state: 'NORMAL' | 'APPROVED' | string;
  workTime: string;
  note?: string;
  salesmanName?: string;
  deptName?: string;
}

// =====================================================
// 供应商
// =====================================================

/** 供应商搜索结果 */
export interface ErpSupplier {
  originId: number;
  name: string;
  shortName?: string;
  contactName?: string;
  contactTel?: string;
  state: number;
  supplierCategoryId?: number;
  supplierCategoryName?: string;
  receiptType?: string;
  autoWriteOff?: number;
}

// =====================================================
// 日均销售数据
// =====================================================

/** 日均销售报表响应（按商品） */
export interface DailySalesGoodsRecord {
  goodsId: number;
  dailySaleList: DailySalesPeriod[];
}

/** 日均销售-某周期数据 */
export interface DailySalesPeriod {
  saleDay: number;
  /** 日均销量（基本单位） */
  dailySaleQuantity: number;
  /** 日均销量（混合单位显示） */
  dailySaleQuantityMix?: string;
  /** 周期内总销量（基本单位） */
  sumSaleQuantity: number;
  /** 周期内总销量（混合单位显示） */
  saleQuantityMix?: string;
}

// =====================================================
// 供应商欠款/应付单
// =====================================================

/** 供应商应付单（list-debt-list 响应） */
export interface SupplierDebtRecord {
  id: number;
  bizId: number;
  bizStr: string;
  bizType: string;
  billTypeEnum: string;
  totalAmount: string;
  leftAmount: string;
  writeOffAmount?: string | null;
  traderId: number;
  traderName?: string;
  paymentDirection: string;
  workTime: string;
  billTypeName?: string;
  debtState?: string;
  note?: string;
}
