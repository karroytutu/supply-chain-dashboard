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
  /** 已结金额（ERP 可能不返回，需兜底计算 totalAmount - leftAmount） */
  paidAmount?: string;
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
 *
 * 响应常用字段（ErpSettlementOrder）：
 *   id              - 结算单ID
 *   bizStr          - 结算单号（如 THJS241214000001）
 *   bizOrderStr     - 关联订单号（如 TD241213000045）
 *   bizId           - 结算单业务ID
 *   bizOrderId      - 关联订单业务ID
 *   totalAmount     - 总金额（字符串，含负数表示退款）
 *   leftAmount      - 剩余欠款金额
 *   workTime        - 业务时间
 *   billTypeName    - 单据类型名称（如 访销退单）
 *   billTypeEnum    - 单据类型枚举（如 FUNDS_SALES_BACK）
 *   billWorkTime    - 单据创建时间
 *   debtState       - 欠款状态（如 FINE）
 *   hoardTag        - 压单标记（NORMAL / HOARD）
 *   traderId        - 客户ID
 *   traderName      - 客户名称
 *   salesmanId      - 业务员ID
 *   salesmanName    - 业务员姓名
 *   paymentDirection - 收支方向（IN=收入 / OUT=支出）
 *   note            - 备注
 *   bizOrderNote    - 订单备注
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
