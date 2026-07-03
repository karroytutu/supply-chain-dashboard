/**
 * ERP 采购订单服务
 * 封装采购订单的查询、创建、审核、反审核、取消等 ERP API 调用
 * @domain 采购 (Procurement)
 * @module services/erp-client/erp-purchase-order.service
 */
import { randomUUID } from 'crypto';
import { erpGet, erpPost, extractErpData } from './erp-client';
import { getErpDefaults } from './erp-config';
import type {
  PurchaseOrderListItem,
  PurchaseOrderDetailResponse,
  CreatePurchaseOrderRequest,
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

/**
 * 采购付款申请 ERP 幂等键
 * 与 buildProcurementIdemKey 使用不同前缀避免冲突
 */
export function buildPurchasePaymentIdemKey(
  type: 'PREPAY' | 'PAID',
  instanceId: number,
  nodeOrder: number
): string {
  return `PUR-PAY-${type}-${instanceId}-${nodeOrder}`;
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

  const result = await erpPost<unknown>(
    '/web/purchase-order-bill/bill-list',
    body,
    { pathPrefix: '/saas/pro/', businessType: 'purchase_order_search' }
  );

  const data = extractErpData<{ records?: PurchaseOrderListItem[]; total?: number }>(result);
  return {
    records: data?.records ?? [],
    total: data?.total ?? 0,
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

  const result = await erpGet<unknown>(
    '/web/purchase-order-bill/detail',
    { billId, billType: 'PURCHASE_ORDER', cid, uid },
    { pathPrefix: '/saas/pro/', businessType: 'purchase_order_detail' }
  );

  const data = extractErpData<PurchaseOrderDetailResponse>(result);
  if (!data) {
    throw new Error(`采购订单详情查询失败: billId=${billId}`);
  }
  return data;
}

/**
 * 创建/更新采购订单 (API#3)
 * POST /saas/pro/web/purchase-order-bill/add-or-update
 *
 * @invalidates 无缓存（采购订单未缓存）
 */
export async function createPurchaseOrder(
  payload: CreatePurchaseOrderRequest
): Promise<{ billId: number; billStr: string }> {
  const { cid, uid, defaultSalesmanId, defaultDeptId } = getErpDefaults();

  const result = await erpPost<unknown>(
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
  );

  const data = extractErpData<{ id?: number; billId?: number; billStr?: string }>(result);
  const billId = data?.id ?? data?.billId;
  const billStr = data?.billStr || '';
  if (!billId) {
    throw new Error('创建采购订单失败: 未返回 billId');
  }
  return { billId, billStr };
}

/**
 * 审核采购订单 (API#4)
 * POST /saas/pro/web/purchase-order-bill/approve
 *
 * @invalidates 无缓存（采购订单未缓存）
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
 *
 * @invalidates 无缓存（采购订单未缓存）
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
