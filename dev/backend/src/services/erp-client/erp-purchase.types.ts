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

/** 创建采购预付款请求（业务输入接口）
 * ERP 协议细节（source、金额格式化）由服务层处理，调用方无需关心 */
export interface CreatePurchasePrepaymentRequest {
  /** 关联采购订单 bizId */
  relatedBizId: number;
  /** 关联采购订单号 */
  relatedBizStr: string;
  relatedBizTypeEnum: 'PURCHASE_ORDER';
  traderId: number;
  traderType: 'SUPPLIER';
  type: 'PRE_PAID';
  /** 付款总额（string 类型，服务层确保格式正确） */
  totalAmount: string;
  paymentDetails: Array<{
    paymentAmount: string;
    subjectId: number;
  }>;
  paymentDirection: 'OUT';
  salesmanId: string | number;
  workTime: string;
  prePaidAmount?: string;
  wipeOffAmount?: number;
  occupyBizOrderStr?: string;
  occupyPrePaymentRequestList?: unknown[];
  /** 备注（如 OA 审批编号） */
  note?: string;
}

/** 创建普通预付款请求（业务输入接口，不关联采购订单，prePayType='NORMAL'）
 * ERP 协议细节（source、金额格式化）由服务层处理，调用方无需关心 */
export interface CreateNormalPrepaymentRequest {
  traderId: number;
  traderType: 'SUPPLIER';
  type: 'PRE_PAID';
  prePayType: 'NORMAL';
  /** 付款总额（string 类型，服务层确保格式正确） */
  totalAmount: string;
  paymentDetails: Array<{
    paymentAmount: string;
    subjectId: number;
  }>;
  paymentDirection: 'OUT';
  salesmanId: string | number;
  workTime: string;
  prePaidAmount?: string;
  wipeOffAmount?: number;
  /** 备注（如 OA 审批编号） */
  note?: string;
}

// =====================================================
// 付款单（核销）相关
// =====================================================

/** 付款单-核销单据输入项（调用方使用）
 * 调用方只需提供业务数据，ERP 协议细节由 createPaidBill 服务层处理 */
export interface PaidBillInvoiceInput {
  bizId: number;
  /** ERP 核销接口的 bizType 枚举（如 FUNDS_PURCHASE、SUPPLIER_EXPENDITURE） */
  bizType: string;
  /** 单据剩余金额（string 类型） */
  leftAmount: string;
  /** 本次核销金额（部分付款时传入，未传时降级使用 leftAmount = 全额核销） */
  paidAmount?: string;
  /** 本次抹零金额（供应商同意少收的零头，手动填写） */
  discountAmount?: string;
  note?: string;
  originNote?: string;
}

/** 创建付款单请求（业务输入接口）
 * ERP 协议细节（totalAmount 计算、抹零分摊、arrivalTime、prePaidAmount、金额格式化）
 * 由 createPaidBill 服务层自动处理，调用方无需关心 */
export interface CreatePaidBillInput {
  traderId: string | number;
  salesmanId: number;
  deptId: number;
  operatorId?: string | number;
  workTime: string;
  note?: string;
  paymentDetails: Array<{
    paymentAmount: string;
    subjectId: number;
  }>;
  /** 核销单据列表，服务层自动计算 totalAmount、分摊 wipeOffAmount */
  invoiceList: PaidBillInvoiceInput[];
  /** 抹零总额，服务层按 leftAmount 占比分摊到各条 discountAmount（倒挤法） */
  wipeOffAmount?: string;
  /** 预付款核销列表（混合付款时传入，未传时默认为空数组） */
  prepayList?: PaidBillPrepayItem[];
}

/** 创建付款单请求（内部 ERP 格式，服务层使用） */
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
  imgIds?: never;
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
  /** 银行账户户名 */
  bankAccountName?: string;
  /** 开户银行 */
  openingBank?: string;
  /** 银行账号 */
  account?: string;
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

// =====================================================
// 采购结算单（funds-purchase）
// =====================================================

/** 采购结算单列表项（funds-purchase/list 响应） */
export interface PurchaseSettlementListItem {
  id: number;
  billStr: string;
  bizId: number;
  bizStr: string;
  supplierId: number;
  supplierName: string;
  salesmanName: string;
  workTime: string;
  warehouseName: string;
  deptName: string;
  settleAmount: string;
  stockEndAmount: string;
  costAmount: string;
  leftAmount: string;
  settleStateEnum: string;
  expenditureAmount: string;
  expenditureAmountSum: string;
  note?: string | null;
}

// =====================================================
// 费用分摊模块专用查询（toliman/expenditure-allocation）
// =====================================================

/** 可分摊采购结算单明细行（settle-allocatable-purchase-detail 响应） */
export interface AllocatablePurchaseDetail {
  /** 明细行ID，即费用分摊单所需的 bizDetailId */
  id: number;
  bizDetailId: number;
  /** 结算单主单 ID */
  mainId: number;
  /** 关联采购订单 ID */
  mainOrderId: number;
  /** 结算单号 */
  billStr: string;
  /** 关联采购订单号 */
  billOrderStr: string;
  billOrderType: string;
  billTypeName: string;
  traderName: string;
  settlerName: string;
  supplierName: string;
  goodsName: string;
  brandName: string;
  currUnitName: string;
  quantity: number;
  weight: number;
  /** 结算金额 */
  amount: string;
  workTime: string;
  salesmanName: string;
  deptName: string;
}

/** 可分摊费用明细行（expenditure-allocatable-detail 响应） */
export interface AllocatableExpenseDetail {
  /** 明细行ID，即费用分摊单所需的 bizDetailId */
  id: number;
  bizDetailId: number;
  /** 费用单主单 ID */
  mainId: number;
  /** 费用单号 */
  billStr: string;
  billTypeName: string;
  traderId: number;
  traderName: string;
  /** 费用类别名称（如"物流费用"、"卸货费"） */
  expenditureTypeName: string;
  /** 费用金额 */
  amount: string;
  workTime: string;
  salesmanName: string;
  deptName: string;
  note?: string | null;
}
