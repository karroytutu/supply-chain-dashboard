/**
 * ERP 结算单查询服务
 * 代理舟谱欠款明细列表 API
 * @module services/erp-client/erp-settlement.service
 */

import { erpGet, erpPost } from './erp-client';
import { getErpDefaults } from './erp-config';

// =====================================================
// 类型定义
// =====================================================

/** ERP 结算单（欠款明细） */
export interface ErpSettlementOrder {
  id: number;
  bizStr: string;
  bizOrderStr: string;
  totalAmount: string;
  leftAmount: string;
  workTime: string;
  billTypeName: string;
  collectState: string;
  isHoard?: string;
  [key: string]: unknown;
}

// =====================================================
// 查询方法
// =====================================================

/**
 * 根据客户 ID 查询结算单列表
 * GET /saas/pro/invoice/list-debt-list?traderId=xxx&traderType=STORE
 */
export async function searchErpSettlementOrders(params: {
  traderId: number | string;
  keyword?: string;
}): Promise<ErpSettlementOrder[]> {
  const { cid, uid } = getErpDefaults();
  const result = await erpGet(
    '/invoice/list-debt-list',
    {
      size: 100, total: 0, current: 1,
      traderId: params.traderId,
      traderType: 'STORE',
      cid, uid,
    },
    { pathPrefix: '/saas/pro/', businessType: 'settlement_order_search' }
  ) as any;
  return result?.data?.records || result?.records || [];
}

/**
 * 标记压单结算单
 * POST /saas/pro/funds-sale/update-hoard
 */
export async function erpMarkHoldOrders(orderIds: number[]): Promise<void> {
  const { cid, uid } = getErpDefaults();
  await erpPost(
    '/funds-sale/update-hoard',
    { ids: orderIds, taggedHoard: true, cid, uid },
    { pathPrefix: '/saas/pro/', businessType: 'mark_hold_orders' }
  );
}
