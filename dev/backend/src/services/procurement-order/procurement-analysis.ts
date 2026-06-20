/**
 * 采购审批分析服务
 * 从ERP拉取采购订单详情+日均销售，计算审批条件标记
 * @module services/procurement-order/procurement-analysis
 */
import { createLogger } from '../../utils/logger';
const log = createLogger('ProcurementAnalysis');

import {
  getPurchaseOrderDetail,
  getDailySalesData,
} from '../erp-client/erp-purchase.service';
import type {
  PurchaseOrderDetailResponse,
  PurchaseOrderLineItem,
  DailySalesGoodsRecord,
} from '../erp-client/erp-purchase.types';
import {
  PROCUREMENT_MARKETING_APPROVAL_DAYS,
  PROCUREMENT_MANAGER_APPROVAL_AMOUNT,
  PROCUREMENT_DAILY_SALES_PERIOD,
  PROCUREMENT_ANALYSIS_TIMEOUT_MS,
} from '../../utils/constants';
import { formatMixedUnit } from '../../utils/unitConverter';

// =====================================================
// 类型定义
// =====================================================

/** 单行商品分析结果 */
export interface LineItemAnalysis {
  goodsId: number;
  goodsName: string;
  specification?: string;
  /** 当前采购单位 */
  currUnitName: string;
  /** 采购数量 */
  quantity: number;
  /** 采购价 */
  realPrice: number;
  /** 上次采购价（同单位） */
  lastPurchasePrice: number;
  /** 价差（采购价 - 上次进价） */
  priceDifference: number;
  /** 是否首次采购 */
  isFirstPurchase: boolean;
  /** 当前库存（基本单位，用于可售天数计算） */
  stockQuantity: number;
  /** 当前库存混合单位显示（如 "80件32瓶"） */
  stockDisplay: string;
  /** 在途量（基本单位） */
  roadInQuantity: number;
  /** 在途量混合单位显示（如 "5件"） */
  roadInDisplay: string;
  /** 60天日均销量（基本单位） */
  dailySales60: number;
  /** 60天日均混合单位显示（如 "1件"） */
  dailySalesDisplay: string;
  /** 可售天数 */
  sellableDays: number;
  /** 行小计金额 */
  subAmount: number;
}

/** 订单级分析结果 */
export interface ProcurementAnalysisResult {
  /** ERP 采购订单 ID */
  billId: number;
  /** 采购单号 */
  billStr: string;
  /** 供应商ID */
  supplierId: number;
  /** 供应商名称 */
  supplierName: string;
  /** 仓库名称 */
  warehouseName: string;
  /** 订单总金额 */
  totalAmount: number;
  /** 行项分析结果 */
  lines: LineItemAnalysis[];
  /** 是否触发营销审批（任一商品可售天数 > 45） */
  needsMarketingApproval: boolean;
  /** 是否触发财务审批（任一商品有价差或首次采购） */
  needsFinanceApproval: boolean;
  /** 是否触发总经理审批（订单总金额 > 5000） */
  needsManagerApproval: boolean;
}

// =====================================================
// 核心分析函数
// =====================================================

/**
 * 分析采购订单，计算审批条件
 * 含 8s 总超时防护（beforeSubmit 用户等待场景）
 *
 * @param billId ERP 采购订单 ID
 * @returns 分析结果（含条件标记 + 行项详情）
 */
export async function analyzePurchaseOrder(
  billId: number
): Promise<ProcurementAnalysisResult> {
  const timeoutPromise = new Promise<never>((_, reject) =>
    setTimeout(
      () => reject(new Error('采购订单分析超时，ERP数据获取缓慢，请稍后重试')),
      PROCUREMENT_ANALYSIS_TIMEOUT_MS
    )
  );

  return Promise.race([doAnalysis(billId), timeoutPromise]);
}

/**
 * 实际分析逻辑（内部使用，被 Promise.race 包裹）
 */
async function doAnalysis(billId: number): Promise<ProcurementAnalysisResult> {
  // Step 1: 获取采购订单详情
  const detail = await getPurchaseOrderDetail(billId);
  log.info(`分析采购订单: billId=${billId}, billStr=${detail.billStr}, 行项数=${detail.details?.length || 0}`);

  // Step 2: 提取 goodsIds，获取日均销售
  const goodsIds = (detail.details || []).map(d => d.goodsId);
  const salesDataMap = await buildSalesMap(goodsIds);

  // Step 3: 逐行分析
  const lines = (detail.details || []).map(line => analyzeLineItem(line, salesDataMap));

  // Step 4: 汇总订单级判断
  const needsMarketingApproval = lines.some(l => l.sellableDays > PROCUREMENT_MARKETING_APPROVAL_DAYS);
  const needsFinanceApproval = lines.some(l => l.priceDifference !== 0 || l.isFirstPurchase);
  const totalAmount = parseFloat(detail.totalAmount) || 0;
  const needsManagerApproval = totalAmount > PROCUREMENT_MANAGER_APPROVAL_AMOUNT;

  return {
    billId: detail.id,
    billStr: detail.billStr,
    supplierId: detail.supplierId,
    supplierName: detail.supplierName,
    warehouseName: detail.warehouseName,
    totalAmount,
    lines,
    needsMarketingApproval,
    needsFinanceApproval,
    needsManagerApproval,
  };
}

// =====================================================
// 辅助函数
// =====================================================

/**
 * 构建 goodsId → 日均销量映射
 */
async function buildSalesMap(
  goodsIds: number[]
): Promise<Map<number, number>> {
  if (goodsIds.length === 0) return new Map();

  const salesRecords = await getDailySalesData(goodsIds);
  const map = new Map<number, number>();

  for (const record of salesRecords) {
    const period60 = record.dailySaleList?.find(
      p => p.saleDay === PROCUREMENT_DAILY_SALES_PERIOD
    );
    map.set(record.goodsId, period60?.dailySaleQuantity || 0);
  }

  return map;
}

/**
 * 分析单行商品
 */
function analyzeLineItem(
  line: PurchaseOrderLineItem,
  salesMap: Map<number, number>
): LineItemAnalysis {
  const goodsInfo = line.goodsInfo || ({} as any);
  const priceInfo = line.goodsPriceInfo || ({} as any);
  const stockInfo = line.stockInfo || ({} as any);

  const realPrice = parseFloat(line.realPrice) || 0;
  const quantity = line.quantity || 0;

  // 确定上次进价（根据 currUnitId 选择对应单位的价格）
  const pkgUnitId = goodsInfo.pkgUnitId;
  const isPkgUnit = line.currUnitId === pkgUnitId;
  const lastPriceStr = isPkgUnit
    ? (priceInfo.pkgLastPurchasePrice || '0')
    : (priceInfo.baseLastPurchasePrice || '0');
  const lastPurchasePrice = parseFloat(lastPriceStr) || 0;

  // 价差
  const priceDifference = roundTo(realPrice - lastPurchasePrice, 2);

  // 首次采购判断
  const isFirstPurchase = lastPurchasePrice === 0;

  // 库存和在途（基本单位）
  const stockQuantity = parseFloat(String(stockInfo.physicalQuantity)) || 0;
  const roadInQuantity = parseFloat(String(stockInfo.roadInQuantity)) || 0;

  // 日均销量（基本单位，60天周期）
  const dailySales60 = salesMap.get(line.goodsId) || 0;

  // ERP 单位信息（支持三级：大/中/小）
  const baseUnitName = goodsInfo.baseUnitName || '';
  const pkgUnitName = goodsInfo.pkgUnitName || '';
  const pkgUnitFactor = goodsInfo.pkgUnitFactor || 1;
  const midUnitName = goodsInfo.midUnitName || null;
  const midUnitFactor = goodsInfo.midUnitFactor || null;

  // 混合单位显示（库存/在途/日均）
  const unitOptions = { pkgUnitName, baseUnitName, pkgUnitFactor, midUnitName, midUnitFactor };
  const stockDisplay = formatMixedUnit({ ...unitOptions, baseQuantity: stockQuantity });
  const roadInDisplay = formatMixedUnit({ ...unitOptions, baseQuantity: roadInQuantity });
  const dailySalesDisplay = formatMixedUnit({ ...unitOptions, baseQuantity: Math.round(dailySales60) });

  // 订单量转基本单位
  const pkgFactor = goodsInfo.pkgUnitFactor || 1;
  const orderQtyBase = isPkgUnit ? quantity * pkgFactor : quantity;

  // 可售天数
  const totalStockBase = stockQuantity + roadInQuantity + orderQtyBase;
  const sellableDays = dailySales60 > 0.000001
    ? Math.round(totalStockBase / dailySales60)
    : 9999;

  // 当前采购单位名称
  const currUnitName = isPkgUnit
    ? (goodsInfo.pkgUnitName || '')
    : (goodsInfo.baseUnitName || '');

  return {
    goodsId: line.goodsId,
    goodsName: goodsInfo.goodsName || '',
    specification: goodsInfo.specifications || undefined,
    currUnitName,
    quantity,
    realPrice,
    lastPurchasePrice,
    priceDifference,
    isFirstPurchase,
    stockQuantity,
    stockDisplay,
    roadInQuantity,
    roadInDisplay,
    dailySales60,
    dailySalesDisplay,
    sellableDays,
    subAmount: parseFloat(line.subAmount) || 0,
  };
}

/**
 * 四舍五入到指定小数位
 */
function roundTo(value: number, decimals: number): number {
  const factor = Math.pow(10, decimals);
  return Math.round(value * factor) / factor;
}

// =====================================================
// 明细表展示格式构建
// =====================================================

/** 采购明细行展示格式（供前端表格渲染） */
export interface PurchaseLineDisplay {
  goodsName: string;
  specification: string;
  quantity: number;
  unit: string;
  realPrice: number;
  lastPurchasePrice: number;
  priceDifference: number;
  isFirstPurchase: string;
  /** 当前库存（混合单位显示，如 "80件32瓶"） */
  stockDisplay: string;
  /** 在途量（混合单位显示，如 "5件"） */
  roadInDisplay: string;
  /** 60天日均（混合单位显示，如 "1件"） */
  dailySalesDisplay: string;
  sellableDays: number;
  subAmount: number;
}

/**
 * 将分析结果行项转换为前端明细表展示格式
 * 供 beforeSubmit 和采购订单分析接口复用
 */
export function buildPurchaseLines(lines: LineItemAnalysis[]): PurchaseLineDisplay[] {
  return lines.map(l => ({
    goodsName: l.goodsName,
    specification: l.specification || '',
    quantity: l.quantity,
    unit: l.currUnitName,
    realPrice: l.realPrice,
    lastPurchasePrice: l.lastPurchasePrice,
    priceDifference: l.priceDifference,
    isFirstPurchase: l.isFirstPurchase ? '是' : '否',
    stockDisplay: l.stockDisplay,
    roadInDisplay: l.roadInDisplay,
    dailySalesDisplay: l.dailySalesDisplay,
    sellableDays: l.sellableDays,
    subAmount: l.subAmount,
  }));
}
