/**
 * ERP 采购结算单 + 费用分摊查询服务
 * 封装采购结算单列表查询和费用分摊模块专用的可分摊明细查询 API
 * @module services/erp-client/erp-purchase-settlement.service
 */
import { createLogger } from '../../utils/logger';
const log = createLogger('ERP');

import { erpGet, erpPost, extractErpData } from './erp-client';
import { getErpDefaults } from './erp-config';
import type {
  PurchaseSettlementListItem,
  AllocatablePurchaseDetail,
  AllocatableExpenseDetail,
} from './erp-purchase.types';

// =====================================================
// 采购结算单列表（funds-purchase/list）
// =====================================================

/** 采购结算单列表分页响应 */
export interface PurchaseSettlementListResult {
  records: PurchaseSettlementListItem[];
  total: number;
  current: number;
  size: number;
}

/**
 * 查询采购结算单列表
 * GET /saas/pro/funds-purchase/list
 *
 * 用于 OA 表单中浏览和选择采购结算单
 */
export async function searchPurchaseSettlements(params: {
  startDate?: string;
  endDate?: string;
  current?: number;
  size?: number;
  billState?: string;
  keyword?: string;
  supplierId?: string;
}): Promise<PurchaseSettlementListResult> {
  const { cid, uid } = getErpDefaults();
  const current = params.current || 1;
  const size = Math.min(params.size || 20, 100);

  const queryParams: Record<string, unknown> = {
    startDate: params.startDate || '',
    endDate: params.endDate || '',
    current,
    size,
    total: 0,
    billState: params.billState || 'NORMAL',
    cid,
    uid,
  };

  // 关键词搜索通过 billStr 参数
  if (params.keyword?.trim()) {
    queryParams.billStr = params.keyword.trim();
  }

  // 供应商筛选
  if (params.supplierId?.trim()) {
    queryParams.supplierId = params.supplierId.trim();
  }

  const response = await erpGet<unknown>(
    '/funds-purchase/list',
    queryParams,
    { pathPrefix: '/saas/pro/', businessType: 'purchase_settlement_list' }
  );

  const data = extractErpData<{ records?: PurchaseSettlementListItem[]; total?: number }>(response);
  const records = data?.records ?? [];
  const total = data?.total ?? 0;

  return { records, total, current, size };
}

// =====================================================
// 可分摊采购结算单明细（toliman 路径）
// =====================================================

/** 可分摊采购明细查询参数 */
export interface AllocatablePurchaseDetailParams {
  /** 日期范围起始 */
  startDate?: string;
  /** 日期范围结束 */
  endDate?: string;
  /** 按结算单号筛选 */
  billStr?: string;
  /** 按供应商 ID 列表筛选 */
  supplierIdList?: (string | number)[];
  /** 是否显示已分摊的记录，默认 0（不显示） */
  showAllocated?: number;
  current?: number;
  size?: number;
}

/** 可分摊采购明细分页响应 */
export interface AllocatablePurchaseDetailResult {
  records: AllocatablePurchaseDetail[];
  total: number;
  current: number;
  size: number;
}

/**
 * 查询可分摊的采购结算单明细行
 * POST /toliman/expenditure-allocation/settle-allocatable-purchase-detail
 *
 * 返回的每条记录的 `id` 即为费用分摊单所需的 `bizDetailId`。
 * 支持按 billStr、supplierIdList、日期范围等维度筛选。
 *
 * 用途：
 * 1. 前端展示：OA 表单选中结算单后，展示商品行项明细供用户填写费用单价
 * 2. auto 节点：获取 bizDetailId 用于构造费用分摊单请求
 */
export async function getAllocatablePurchaseDetails(
  params: AllocatablePurchaseDetailParams
): Promise<AllocatablePurchaseDetailResult> {
  const { cid, uid } = getErpDefaults();
  const current = params.current || 1;
  const size = Math.min(params.size || 100, 500);

  const startDate = params.startDate || '';
  const endDate = params.endDate || '';

  const body = {
    current,
    size,
    timeType: 'WORK',
    selectDate: startDate && endDate ? [startDate, endDate] : [],
    startDate,
    endDate,
    billStr: params.billStr || undefined,
    supplierIdList: (params.supplierIdList || []).map(String),
    goodsIds: [],
    categoryIdList: [],
    brandIds: [],
    salesmanIds: [],
    deptIds: [],
    warehouseIds: [],
    settlerIds: [],
    consumerIds: [],
    showAllocated: params.showAllocated ?? 0,
    isSearchCount: true,
    cid,
    uid,
  };

  const response = await erpPost<unknown>(
    '/expenditure-allocation/settle-allocatable-purchase-detail',
    body,
    { pathPrefix: '/toliman/', businessType: 'allocatable_purchase_detail' }
  );

  const data = extractErpData<{ records?: AllocatablePurchaseDetail[]; total?: number }>(response);
  const records = data?.records ?? [];
  const total = data?.total ?? 0;

  return { records, total, current, size };
}

// =====================================================
// 可分摊费用明细（toliman 路径）
// =====================================================

/** 可分摊费用明细查询参数 */
export interface AllocatableExpenseDetailParams {
  /** 日期范围起始 */
  startDate?: string;
  /** 日期范围结束 */
  endDate?: string;
  /** 按费用单号筛选 */
  billStr?: string;
  /** 按交易对象类型筛选，如 ['SUPPLIER'] */
  traderTypes?: string[];
  current?: number;
  size?: number;
}

/** 可分摊费用明细分页响应 */
export interface AllocatableExpenseDetailResult {
  records: AllocatableExpenseDetail[];
  total: number;
  current: number;
  size: number;
}

/**
 * 查询可分摊的费用明细行
 * POST /toliman/expenditure-allocation/expenditure-allocatable-detail
 *
 * 返回的每条记录的 `id` 即为费用分摊单所需的 `bizDetailId`。
 * 用于 auto 节点5：创建费用分摊单时，获取刚创建的供应商费用单的明细行 ID。
 */
export async function getAllocatableExpenseDetails(
  params: AllocatableExpenseDetailParams
): Promise<AllocatableExpenseDetailResult> {
  const { cid, uid } = getErpDefaults();
  const current = params.current || 1;
  const size = Math.min(params.size || 100, 500);

  const startDate = params.startDate || '';
  const endDate = params.endDate || '';

  const body = {
    current,
    size,
    timeType: 'WORK',
    selectDate: startDate && endDate ? [startDate, endDate] : [],
    startDate,
    endDate,
    billStr: params.billStr || undefined,
    traderTypes: params.traderTypes || [],
    categoryIdList: [],
    brandIds: [],
    settlerIds: [],
    consumerIds: [],
    areaIds: [],
    groupIds: [],
    salesmanIds: [],
    deptIds: [],
    isSearchCount: true,
    cid,
    uid,
  };

  const response = await erpPost<unknown>(
    '/expenditure-allocation/expenditure-allocatable-detail',
    body,
    { pathPrefix: '/toliman/', businessType: 'allocatable_expense_detail' }
  );

  const data = extractErpData<{ records?: AllocatableExpenseDetail[]; total?: number }>(response);
  const records = data?.records ?? [];
  const total = data?.total ?? 0;

  return { records, total, current, size };
}
