/**
 * 目标管理 API 服务
 *
 * 本文件定义 API 响应类型（DTO）和 HTTP 请求封装。
 * UI 层模型定义在 types/target-management.d.ts 中，
 * 两者通过 hooks 层进行映射转换（如 mapInitDataToCustomers）。
 */
import request from './request';
import type { TargetStatus } from '@/types/target-management';

/** 目标列表项 */
export interface TargetListItem {
  id: number;
  marketerId: number;
  marketerName: string;
  year: number;
  month: number;
  status: TargetStatus;
  createdAt: string;
  updatedAt: string;
}

/** 目标详情 */
export interface TargetDetail {
  id: number;
  marketerId: number;
  marketerName: string;
  year: number;
  month: number;
  status: TargetStatus;
  oaInstanceId: number | null;
  createdAt: string;
  updatedAt: string;
  customers: TargetCustomer[];
}

export interface TargetCustomer {
  erpConsumerId: number | null;
  consumerName: string;
  isPlannedNew: boolean;
  categories: TargetCategory[];
}

export interface TargetCategory {
  categoryName: string;
  targetAmount: number;
  actualAmountLastMonth: number;
  actualAmountPrevMonth: number;
  products: TargetProduct[];
}

export interface TargetProduct {
  erpGoodsId: number | null;
  goodsName: string;
  unit: string | null;
  unitPrice: number | null;
  targetAmount: number;
  remark: string;
  actualAmountLastMonth: number;
  actualAmountPrevMonth: number;
  grossMarginRate: number;
}

/** 保存目标的明细行参数 */
export interface SaveTargetItemParam {
  erpConsumerId: number | null;
  consumerName: string;
  isPlannedNew: boolean;
  erpGoodsId: number | null;
  goodsName: string;
  categoryName: string | null;
  unit: string | null;
  unitPrice: number | null;
  targetAmount: number;
  remark: string;
}

/** 客户列表项（含公海标记 + 归属标记） */
export interface CustomerListItem {
  erpConsumerId: number;
  consumerName: string;
  consumerManagerName: string | null;
  channelName: string | null;
  areaName: string | null;
  cooperationTypeName: string | null;
  isPublicSea: boolean;
  isMine: boolean;
}

/** 商品目录（按品类分组） */
export interface ProductCatalogItem {
  categoryName: string;
  products: ProductItem[];
}

export interface ProductItem {
  erpGoodsId: number;
  goodsName: string;
  unit: string;
  unitPrice: number | null;
  brandName: string | null;
  hasStock: boolean;
}

/** 历史销售数据 */
export interface HistoricalSalesItem {
  erpConsumerId: number;
  consumerName: string;
  erpGoodsId: number;
  goodsName: string;
  actualAmountLastMonth: number;
  actualAmountPrevMonth: number;
}

/** 初始化数据响应 */
export interface InitDataResponse {
  isSaved: boolean;
  targetId: number | null;
  status: TargetStatus;
  oaInstanceId: number | null;
  marketerId: number;
  marketerName: string;
  year: number;
  month: number;
  customers: TargetCustomer[];
}

/** 概览汇总响应 */
export interface OverviewResponse {
  summary: {
    totalTarget: number;
    totalLastMonthActual: number;
    growthRate: number | null;
    marketerCount: number;
    marketersWithTarget: number;
    targetCustomerCount: number;
    lastMonthCustomerCount: number;
    targetSkuCount: number;
    lastMonthSkuCount: number;
    targetCategoryCount: number;
    lastMonthCategoryCount: number;
    avgCustomerValue: number;
    lastMonthAvgCustomerValue: number;
    totalEstimatedGrossProfit: number;
    totalBaseCommission: number;
    totalIncrementCommission: number;
  };
  marketers: MarketerOverview[];
}

/** 单个营销师概览 */
export interface MarketerOverview {
  id: number;
  name: string;
  targetAmount: number;
  lastMonthActual: number;
  growthRate: number | null;
  hasSaved: boolean;
  targetStatus: TargetStatus | null;
  customerCount: number;
  lastMonthCustomerCount: number;
  skuCount: number;
  lastMonthSkuCount: number;
  categoryCount: number;
  lastMonthCategoryCount: number;
  avgCustomerValue: number;
  lastMonthAvgCustomerValue: number;
  estimatedGrossProfit: number;
  lastMonthGrossProfit: number;
  baseCommission: number;
  incrementCommission: number;
}

/**
 * 获取概览汇总数据（全部营销师的目标概览）
 */
export function fetchOverview(year: number, month: number): Promise<OverviewResponse> {
  return request.get('/sales/targets/overview', { params: { year, month } });
}

/**
 * 获取初始化数据（已有目标 或 从 ERP 上月销售构建）
 */
export function fetchInitData(params: {
  marketerId: number;
  year: number;
  month: number;
}): Promise<InitDataResponse> {
  return request.get('/sales/targets/init-data', { params });
}

/** 营销师列表项 */
export interface MarketerItem {
  id: number;
  name: string;
}

/**
 * 获取系统内营销师列表
 */
export function fetchMarketers(): Promise<MarketerItem[]> {
  return request.get('/sales/targets/marketers');
}

/**
 * 查询目标列表
 */
export function fetchTargetList(params?: {
  marketerId?: number;
  year?: number;
  month?: number;
}): Promise<TargetListItem[]> {
  return request.get('/sales/targets', { params });
}

/**
 * 查询目标详情
 */
export function fetchTargetDetail(id: number): Promise<TargetDetail> {
  return request.get(`/sales/targets/${id}`);
}

/**
 * 创建目标
 */
export function createTarget(data: {
  marketerId: number;
  year: number;
  month: number;
  items: SaveTargetItemParam[];
}): Promise<TargetListItem> {
  return request.post('/sales/targets', data);
}

/**
 * 更新目标明细
 */
export function updateTarget(id: number, items: SaveTargetItemParam[]): Promise<void> {
  return request.put(`/sales/targets/${id}`, { items });
}

/**
 * 删除目标
 */
export function deleteTarget(id: number): Promise<void> {
  return request.delete(`/sales/targets/${id}`);
}

/**
 * 获取客户列表（含公海标记 + 归属标记）
 * @param marketerId 当前查看的营销师 ID，用于标记"归属我的"
 */
export function fetchCustomers(marketerId?: number): Promise<CustomerListItem[]> {
  return request.get('/sales/targets/customers', { params: marketerId ? { marketer_id: marketerId } : {} });
}

/**
 * 获取 ERP 商品目录（按品类分组）
 */
export function fetchProductCatalog(): Promise<ProductCatalogItem[]> {
  return request.get('/sales/targets/products');
}

/**
 * 获取历史销售数据（上月 + 上上月）
 */
export function fetchHistoricalSales(year: number, month: number): Promise<HistoricalSalesItem[]> {
  return request.get('/sales/targets/historical-sales', { params: { year, month } });
}

/**
 * 提交目标审批
 * @param targetId 目标ID
 * @param submitterSignature 提交人电子签名（base64 data URL）
 */
export function submitTargetForApproval(
  targetId: number,
  submitterSignature: string,
): Promise<{ oaInstanceId: number; instanceNo: string }> {
  return request.post(`/sales/targets/${targetId}/submit-approval`, { submitterSignature });
}
