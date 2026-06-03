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
  /** 欠款明细记录ID（list-debt-list API 返回，不可用于 update-hoard） */
  id: number;
  /** 结算单业务ID（update-hoard API 使用此ID标记压单） */
  bizId: number;
  bizStr: string;
  bizOrderStr: string;
  totalAmount: string;
  /** 已结金额（ERP 可能不返回，需兜底计算 totalAmount - leftAmount） */
  paidAmount?: string;
  leftAmount: string;
  workTime: string;
  billTypeName: string;
  collectState: string;
  /** 压单标记（结算单 API 返回字段名为 hoardTag，值为 'NORMAL' / 'HOARD'） */
  hoardTag?: string;
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
 *   hoardTag        - 压单标记（NORMAL / HOARD，注意：欠款明细API同字段名为isHoard，值为中文'是'/'否'）
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
  /** 期望获取的最大记录数，默认 100。设置大于 100 时会自动分页 */
  maxRecords?: number;
}): Promise<ErpSettlementOrder[]> {
  const { cid, uid } = getErpDefaults();
  const maxRecords = params.maxRecords || 100;
  const allOrders: ErpSettlementOrder[] = [];
  let current = 1;
  const pageSize = 100;

  while (allOrders.length < maxRecords) {
    const result = await erpGet(
      '/invoice/list-debt-list',
      {
        size: pageSize, total: 0, current,
        traderId: params.traderId,
        traderType: 'STORE',
        cid, uid,
      },
      { pathPrefix: '/saas/pro/', businessType: 'settlement_order_search' }
    ) as any;
    const records: ErpSettlementOrder[] = result?.data?.records || result?.records || [];
    allOrders.push(...records);
    if (records.length < pageSize) break;
    current++;
  }

  return allOrders;
}

/** 分页查询结果 */
export interface ErpSettlementOrderPagedResult {
  records: ErpSettlementOrder[];
  total: number;
  page: number;
  pageSize: number;
}

/**
 * 根据客户 ID 分页查询结算单列表
 * 支持服务端分页，前端按需请求
 *
 * 搜索策略：
 * - 无关键词时：直接利用 ERP API 分页，性能最优
 * - 有关键词时：ERP API 不支持搜索，需全量拉取后内存过滤再手动分页
 */
export async function searchErpSettlementOrdersPaged(params: {
  traderId: number | string;
  keyword?: string;
  page?: number;
  pageSize?: number;
}): Promise<ErpSettlementOrderPagedResult> {
  const { cid, uid } = getErpDefaults();
  const page = params.page || 1;
  const pageSize = Math.min(params.pageSize || 20, 100);

  // 有关键词时：ERP API 不支持搜索，需全量拉取后内存过滤
  if (params.keyword?.trim()) {
    const allOrders = await searchErpSettlementOrders({ traderId: params.traderId });
    const kw = params.keyword.toLowerCase();
    const filtered = allOrders.filter(
      (r) => r.bizStr?.toLowerCase().includes(kw) || r.bizOrderStr?.toLowerCase().includes(kw)
    );
    const total = filtered.length;
    const start = (page - 1) * pageSize;
    const records = filtered.slice(start, start + pageSize);
    return { records, total, page, pageSize };
  }

  // 无关键词：直接利用 ERP API 分页
  const result = await erpGet(
    '/invoice/list-debt-list',
    {
      size: pageSize,
      total: 0,
      current: page,
      traderId: params.traderId,
      traderType: 'STORE',
      cid,
      uid,
    },
    { pathPrefix: '/saas/pro/', businessType: 'settlement_order_search' }
  ) as any;

  const records: ErpSettlementOrder[] = result?.data?.records || result?.records || [];
  const total: number = result?.data?.total || result?.total || 0;

  return { records, total, page, pageSize };
}

/**
 * 将结算单 ID 列表解析为 bizId 列表
 * 兼容旧数据（存储的是 id）和新数据（存储的是 bizId）：
 * - 若输入 ID 在所有结算单的 bizId 集合中，直接使用
 * - 若输入 ID 在 id→bizId 映射中，转换为 bizId
 * - 否则记录警告并跳过
 */
export async function resolveSettlementBizIds(
  traderId: number,
  orderIds: number[]
): Promise<number[]> {
  if (orderIds.length === 0) return [];

  // 拉取全量数据以确保 id→bizId 映射完整，避免因 maxRecords 截断导致旧 id 无法解析
  const allOrders = await searchErpSettlementOrders({
    traderId,
  });

  const idToBizId = new Map<number, number>();
  const validBizIds = new Set<number>();

  for (const order of allOrders) {
    if (order.bizId != null) {
      validBizIds.add(order.bizId);
      if (order.id != null) {
        idToBizId.set(order.id, order.bizId);
      }
    }
  }

  const resolved: number[] = [];
  for (const inputId of orderIds) {
    if (validBizIds.has(inputId)) {
      // 输入已经是 bizId（新数据路径）
      resolved.push(inputId);
    } else if (idToBizId.has(inputId)) {
      // 输入是旧 id，转换为 bizId
      const bizId = idToBizId.get(inputId)!;
      console.info(`[ERP] 结算单 id→bizId 转换: ${inputId} → ${bizId}`);
      resolved.push(bizId);
    } else {
      console.warn(`[ERP] 结算单 ID ${inputId} 未在客户 ${traderId} 的结算单列表中找到，跳过`);
    }
  }

  return resolved;
}

/**
 * 标记压单结算单
 * POST /saas/pro/funds-sale/update-hoard
 *
 * @param orderIds 结算单 bizId 列表（新数据直接传 bizId；旧数据可能传 id，需配合 traderId 解析）
 * @param traderId 可选客户ID，提供时自动将旧 id 转换为 bizId
 */
export async function erpMarkHoldOrders(orderIds: number[], traderId?: number): Promise<void> {
  const { cid, uid } = getErpDefaults();

  // 若提供了 traderId，先解析 id→bizId（兼容旧数据）
  let bizIds = orderIds;
  if (traderId) {
    bizIds = await resolveSettlementBizIds(traderId, orderIds);
  }

  if (bizIds.length === 0) {
    console.warn('[ERP] erpMarkHoldOrders: 无有效 bizId，跳过 update-hoard 调用');
    return;
  }

  await erpPost(
    '/funds-sale/update-hoard',
    { ids: bizIds, taggedHoard: true, cid, uid },
    { pathPrefix: '/saas/pro/', businessType: 'mark_hold_orders' }
  );
}
