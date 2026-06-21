/**
 * ERP 采购相关服务
 * 封装采购订单、预付款、付款单、供应商收入单等 ERP API 调用
 * @module services/erp-client/erp-purchase.service
 */
import { createLogger } from '../../utils/logger';
const log = createLogger('ERP');

import { randomUUID } from 'crypto';
import { createHash } from 'crypto';
import { erpGet, erpPost } from './erp-client';
import { getErpDefaults } from './erp-config';
import { cache, CACHE_TTL } from '../../utils/cache';
import { CACHE_KEY } from '../../utils/cache-keys';
import type {
  PurchaseOrderListItem,
  PurchaseOrderDetailResponse,
  CreatePurchaseOrderRequest,
  AvailablePrepayment,
  CreatePurchasePrepaymentRequest,
  CreatePaidBillRequest,
  CreatePaidBillResponse,
  SupplierIncomeRecord,
  ErpSupplier,
  DailySalesGoodsRecord,
  SupplierDebtRecord,
} from './erp-purchase.types';

// =====================================================
// 幂等键生成
// =====================================================

/**
 * 生成 ERP 幂等键
 * 确定性：相同操作生成相同键，支持重试幂等
 */
export function buildProcurementIdemKey(
  type: 'PREPAY' | 'PAID',
  instanceId: number,
  nodeOrder: number
): string {
  return `PROC-${type}-${instanceId}-${nodeOrder}`;
}

// =====================================================
// 采购订单
// =====================================================

/**
 * 查询采购订单列表 (API#1)
 * POST /saas/pro/web/purchase-order-bill/bill-list
 */
export async function searchPurchaseOrders(params: {
  supplierIds?: number[];
  states?: string[];
  startDate?: string;
  endDate?: string;
  current?: number;
  size?: number;
  keyword?: string;
}): Promise<{ records: PurchaseOrderListItem[]; total: number }> {
  const { cid, uid } = getErpDefaults();

  const body: Record<string, unknown> = {
    billType: 'PURCHASE_ORDER',
    filterCancelBill: false,
    current: params.current || 1,
    size: params.size || 100,
    total: 0,
    consumerIds: [],
    supplierIds: params.supplierIds || [],
    operIds: [],
    warehouseIds: [],
    deptIds: [],
    categoryIds: [],
    areaIds: [],
    groupIds: [],
    workOperIds: [],
    signOperIds: [],
    approveOperIds: [],
    preDeliverIds: [],
    preTruckIds: [],
    routeIds: [],
    deliveryRouteIds: [],
    goodsIdList: [],
    loadingStrList: [],
    pickStrList: [],
    cwmSourceCidList: [],
    inDeptIdList: [],
    outDeptIdList: [],
    fundsSettleStates: [],
    states: params.states || [],
    createStartDate: params.startDate || '',
    createEndDate: params.endDate || '',
    customExtraFields: [],
    cid,
    uid,
  };
  // ERP 原生搜索：按单据号模糊匹配
  if (params.keyword) body.billStr = params.keyword;

  const result = (await erpPost(
    '/web/purchase-order-bill/bill-list',
    body,
    { pathPrefix: '/saas/pro/', businessType: 'purchase_order_search' }
  )) as any;

  return {
    records: result?.data?.records || [],
    total: result?.data?.total || 0,
  };
}

/**
 * 获取采购订单详情 (API#2)
 * GET /saas/pro/web/purchase-order-bill/detail
 * 返回完整行项含 goodsPriceInfo / stockInfo / goodsInfo
 */
export async function getPurchaseOrderDetail(
  billId: number
): Promise<PurchaseOrderDetailResponse> {
  const { cid, uid } = getErpDefaults();

  const result = (await erpGet(
    '/web/purchase-order-bill/detail',
    { billId, billType: 'PURCHASE_ORDER', cid, uid },
    { pathPrefix: '/saas/pro/', businessType: 'purchase_order_detail' }
  )) as any;

  if (!result?.data) {
    throw new Error(`采购订单详情查询失败: billId=${billId}`);
  }
  return result.data as PurchaseOrderDetailResponse;
}

/**
 * 创建/更新采购订单 (API#3)
 * POST /saas/pro/web/purchase-order-bill/add-or-update
 */
export async function createPurchaseOrder(
  payload: CreatePurchaseOrderRequest
): Promise<{ billId: number; billStr: string }> {
  const { cid, uid, defaultSalesmanId, defaultDeptId } = getErpDefaults();

  const result = (await erpPost(
    '/web/purchase-order-bill/add-or-update',
    {
      ...payload,
      salesmanId: payload.salesmanId || defaultSalesmanId,
      deptId: payload.deptId || defaultDeptId,
      billType: 'PURCHASE_ORDER',
      billFrom: payload.billFrom || 'Offline',
      qualityType: payload.qualityType || 'GOOD',
      uuid: payload.uuid || randomUUID(),
      cid,
      uid,
    },
    { pathPrefix: '/saas/pro/', businessType: 'purchase_order_create' }
  )) as any;

  const billId = result?.data?.id ?? result?.data?.billId;
  const billStr = result?.data?.billStr;
  if (!billId) {
    throw new Error('创建采购订单失败: 未返回 billId');
  }
  return { billId, billStr };
}

/**
 * 审核采购订单 (API#4)
 * POST /saas/pro/web/purchase-order-bill/approve
 */
export async function approvePurchaseOrder(billId: number): Promise<void> {
  const { cid, uid } = getErpDefaults();

  await erpPost(
    '/web/purchase-order-bill/approve',
    { billId, stockOutNotice: true, billType: 'PURCHASE_ORDER', workDate: '', cid, uid },
    { pathPrefix: '/saas/pro/', businessType: 'purchase_order_approve' }
  );
}

/**
 * 反审核采购订单 (API#5)
 * POST /saas/pro/web/purchase-order-bill/de-approve
 */
export async function deApprovePurchaseOrder(billId: number): Promise<void> {
  const { cid, uid } = getErpDefaults();

  await erpPost(
    '/web/purchase-order-bill/de-approve',
    { billId, cid, uid },
    { pathPrefix: '/saas/pro/', businessType: 'purchase_order_de_approve' }
  );
}

/**
 * 取消采购订单 (API#20)
 * POST /saas/pro/web/purchase-order-bill/cancel-v2
 * 支持草稿/已审核状态的PO取消，用于E2E测试清理和驳回回滚
 */
export async function cancelPurchaseOrder(billId: number): Promise<void> {
  const { cid, uid } = getErpDefaults();

  await erpPost(
    '/web/purchase-order-bill/cancel-v2',
    { billId, cid, uid },
    { pathPrefix: '/saas/pro/', businessType: 'purchase_order_cancel' }
  );
}

// =====================================================
// 预付款
// =====================================================

/**
 * 创建采购预付款 (API#6)
 * POST /saas/pro/prepay/operate-pre-payment
 * 需要幂等键 idemkey
 */
export async function createPurchasePrepayment(
  payload: CreatePurchasePrepaymentRequest,
  idemKey: string
): Promise<{ id: number; billStr: string }> {
  const { cid, uid } = getErpDefaults();

  const result = (await erpPost(
    '/prepay/operate-pre-payment',
    {
      ...payload,
      prePaidAmount: payload.prePaidAmount || '0.00',
      wipeOffAmount: payload.wipeOffAmount ?? 0,
      occupyPrePaymentRequestList: payload.occupyPrePaymentRequestList || [],
      source: 'CLOUD',
      cid,
      uid,
    },
    {
      pathPrefix: '/saas/pro/',
      businessType: 'purchase_prepayment_create',
      headers: { idemkey: idemKey },
    }
  )) as any;

  const id = result?.data?.id;
  const billStr = result?.data?.paidBillStr || result?.data?.billStr;
  if (!id) {
    throw new Error('创建采购预付款失败: 未返回 id');
  }
  return { id, billStr };
}

/**
 * 反审核预付款 (API#7)
 * POST /saas/pro/prepay/de-approve
 */
export async function deApprovePrepayment(id: number): Promise<void> {
  const { cid, uid } = getErpDefaults();

  await erpPost(
    '/prepay/de-approve',
    { id, cid, uid, time: Date.now() },
    { pathPrefix: '/saas/pro/', businessType: 'prepayment_de_approve' }
  );
}

/**
 * 取消预付款 (API#8)
 * POST /saas/pro/prepay/cancel
 */
export async function cancelPrepayment(id: number): Promise<void> {
  const { cid, uid } = getErpDefaults();

  await erpPost(
    '/prepay/cancel',
    { id, cid, uid },
    { pathPrefix: '/saas/pro/', businessType: 'prepayment_cancel' }
  );
}

/**
 * 查询可用普通预付款 (API#10)
 * GET /saas/pro/prepay/list-trader-prepay
 * 循环分页拉取全量 + 可选关键词内存过滤（根治截断+搜索）
 */
export async function listTraderPrepayments(
  traderId: number, keyword?: string
): Promise<AvailablePrepayment[]> {
  const { cid, uid } = getErpDefaults();
  const allRecords: AvailablePrepayment[] = [];
  let current = 1;
  const pageSize = 100;

  while (true) {
    const result = (await erpGet(
      '/prepay/list-trader-prepay',
      { current, size: pageSize, type: 'PRE_PAID', traderId, prePayType: 'NORMAL', cid, uid },
      { pathPrefix: '/saas/pro/', businessType: 'trader_prepayment_list' }
    )) as any;
    const records = (result?.data?.records || []) as AvailablePrepayment[];
    allRecords.push(...records);
    if (records.length < pageSize) break;
    current++;
  }

  if (keyword) {
    const kw = keyword.toLowerCase();
    return allRecords.filter(r =>
      r.paidBillStr?.toLowerCase().includes(kw) ||
      String(r.id).includes(keyword)
    );
  }
  return allRecords;
}

// =====================================================
// 付款单（核销）
// =====================================================

/**
 * 创建付款单核销 (API#11)
 * POST /saas/pro/paid/save-and-approve
 * 需要幂等键 idemkey，自动审核通过
 */
export async function createPaidBill(
  payload: CreatePaidBillRequest,
  idemKey: string
): Promise<CreatePaidBillResponse> {
  const { cid, uid } = getErpDefaults();

  const result = (await erpPost(
    '/paid/save-and-approve',
    {
      ...payload,
      paymentDirection: 'OUT',
      traderType: 'SUPPLIER',
      type: 'PAID',
      imgIds: payload.imgIds || [],
      cid,
      uid,
      time: Date.now(),
    },
    {
      pathPrefix: '/saas/pro/',
      businessType: 'paid_bill_create',
      headers: { idemkey: idemKey },
    }
  )) as any;

  if (!result?.data?.id) {
    throw new Error('创建付款单失败: 未返回 id');
  }
  return result.data as CreatePaidBillResponse;
}

/**
 * 付款单反审核 (API#11a)
 * POST /saas/pro/approval-process/approval-permission
 */
export async function deApprovePaidBill(bizId: number): Promise<void> {
  const { cid, uid } = getErpDefaults();

  await erpPost(
    '/approval-process/approval-permission',
    { bizId, bizType: 'SUPPLIER_PAID', cid, uid },
    { pathPrefix: '/saas/pro/', businessType: 'paid_bill_de_approve' }
  );
}

/**
 * 付款单取消 (API#11b)
 * POST /saas/pro/paid/cancel
 */
export async function cancelPaidBill(id: number): Promise<void> {
  const { cid, uid } = getErpDefaults();

  await erpPost(
    '/paid/cancel',
    { id, cid, uid },
    { pathPrefix: '/saas/pro/', businessType: 'paid_bill_cancel' }
  );
}

// =====================================================
// 供应商收入单
// =====================================================

/**
 * 查询供应商收入单列表 (API#12)
 * POST /saas/pro/income/new/list
 * 循环分页拉取全量 + 可选关键词内存过滤（根治截断+搜索）
 */
export async function searchSupplierIncomes(
  traderId: number,
  startDate?: string,
  endDate?: string,
  keyword?: string
): Promise<SupplierIncomeRecord[]> {
  const { cid, uid } = getErpDefaults();
  const allRecords: SupplierIncomeRecord[] = [];
  let current = 1;
  const pageSize = 100;

  while (true) {
    const result = (await erpPost(
      '/income/new/list',
      {
        timeType: 'WORK',
        current,
        size: pageSize,
        total: 0,
        startDate: startDate || '',
        endDate: endDate || '',
        states: ['NORMAL', 'APPROVED'],
        traderType: 'SUPPLIER',
        traderId,
        cid,
        uid,
      },
      { pathPrefix: '/saas/pro/', businessType: 'supplier_income_list' }
    )) as any;
    const records = (result?.data?.records || []) as SupplierIncomeRecord[];
    allRecords.push(...records);
    if (records.length < pageSize) break;
    current++;
  }

  if (keyword) {
    const kw = keyword.toLowerCase();
    return allRecords.filter(r =>
      r.billStr?.toLowerCase().includes(kw) ||
      String(r.id).includes(keyword)
    );
  }
  return allRecords;
}

// =====================================================
// 日均销售报表
// =====================================================

/** in-flight 去重 Map：key 为 goodsIds 排序后的哈希 */
const _dailySalesInFlight = new Map<string, Promise<DailySalesGoodsRecord[]>>();

/**
 * 获取日均销售数据 (API#13)
 * POST /toliman/goods/report/daily-sale
 * 支持 in-flight 去重 + 60s 缓存
 */
export async function getDailySalesData(
  goodsIds: number[]
): Promise<DailySalesGoodsRecord[]> {
  if (goodsIds.length === 0) return [];

  const sorted = [...goodsIds].sort((a, b) => a - b);
  const hash = createHash('md5').update(sorted.join(',')).digest('hex').slice(0, 12);
  const cacheKey = CACHE_KEY.ERP_PURCHASE_DAILY_SALE(hash);

  // 缓存检查
  const cached = cache.get<DailySalesGoodsRecord[]>(cacheKey);
  if (cached) return cached;

  // in-flight 去重
  if (_dailySalesInFlight.has(hash)) {
    return _dailySalesInFlight.get(hash)!;
  }

  const doFetch = async (): Promise<DailySalesGoodsRecord[]> => {
    const { cid, uid } = getErpDefaults();

    const result = (await erpPost(
      '/goods/report/daily-sale',
      { goodsIds: sorted, cid, uid },
      { pathPrefix: '/toliman/', businessType: 'daily_sales_report' }
    )) as any;

    return (result?.data || []) as DailySalesGoodsRecord[];
  };

  const promise = doFetch();
  _dailySalesInFlight.set(hash, promise);

  try {
    const data = await promise;
    cache.set(cacheKey, data, CACHE_TTL.DASHBOARD);
    return data;
  } finally {
    _dailySalesInFlight.delete(hash);
  }
}

// =====================================================
// 供应商欠款/应付单
// =====================================================

/**
 * 查询供应商欠款列表 (API#14)
 * GET /saas/pro/invoice/list-debt-list?traderType=SUPPLIER
 * 循环分页拉取全量 + 不缓存，实时应付
 */
export async function searchSupplierDebts(
  traderId: number
): Promise<SupplierDebtRecord[]> {
  const { cid, uid } = getErpDefaults();
  const allRecords: SupplierDebtRecord[] = [];
  let current = 1;
  const pageSize = 100;

  while (true) {
    const result = (await erpGet(
      '/invoice/list-debt-list',
      {
        size: pageSize,
        total: 0,
        current,
        traderId,
        traderType: 'SUPPLIER',
        cid,
        uid,
      },
      { pathPrefix: '/saas/pro/', businessType: 'supplier_debt_list' }
    )) as any;
    const records = (result?.data?.records || []) as SupplierDebtRecord[];
    allRecords.push(...records);
    if (records.length < pageSize) break;
    current++;
  }

  return allRecords;
}

// =====================================================
// 供应商列表
// =====================================================

/**
 * 查询供应商列表 (API#15)
 * POST /redcoast/supplier/search
 * 支持关键词搜索（queryText），缓存 5 分钟（LOW_FREQUENCY）
 */
export async function searchSuppliers(keyword?: string, page: number = 1, size: number = 50): Promise<ErpSupplier[]> {
  const cacheKey = CACHE_KEY.ERP_PURCHASE_SUPPLIERS(`${keyword || ''}:${page}:${size}`);
  const cached = cache.get<ErpSupplier[]>(cacheKey);
  if (cached) return cached;

  const { cid, uid } = getErpDefaults();
  const body: Record<string, unknown> = { current: page, size, state: 0, cid, uid };
  if (keyword) body.queryText = keyword;

  const result = (await erpPost(
    '/supplier/search',
    body,
    { pathPrefix: '/redcoast/', businessType: 'supplier_search' }
  )) as any;

  const suppliers = (result?.data?.records || []) as ErpSupplier[];
  cache.set(cacheKey, suppliers, CACHE_TTL.LOW_FREQUENCY);
  return suppliers;
}
