/**
 * ERP 预付款服务
 * 封装采购预付款的创建、反审核、取消、查询等 ERP API 调用
 * @domain 采购 (Procurement)
 * @module services/erp-client/erp-prepayment.service
 */
import { erpGet, erpPost, extractErpData } from './erp-client';
import { getErpDefaults } from './erp-config';
import { fetchAllPagesSequential } from './erp-pagination';
import type {
  AvailablePrepayment,
  CreatePurchasePrepaymentRequest,
  CreateNormalPrepaymentRequest,
} from './erp-purchase.types';

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

  const result = await erpPost<unknown>(
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
  );

  const data = extractErpData<{ id: number; paidBillStr?: string; billStr?: string }>(result);

  const id = data?.id;
  const billStr = data?.paidBillStr || data?.billStr || '';
  if (!id) {
    throw new Error('创建采购预付款失败: 未返回 id');
  }
  return { id, billStr };
}

/**
 * 创建普通预付款（不关联采购订单）
 * POST /saas/pro/prepay/operate-pre-payment
 * prePayType='NORMAL'，不含 relatedBizId/relatedBizStr
 */
export async function createNormalPrepayment(
  payload: CreateNormalPrepaymentRequest,
  idemKey: string
): Promise<{ id: number; billStr: string }> {
  const { cid, uid } = getErpDefaults();

  const result = await erpPost<unknown>(
    '/prepay/operate-pre-payment',
    {
      ...payload,
      prePaidAmount: payload.prePaidAmount || '0.00',
      wipeOffAmount: payload.wipeOffAmount ?? 0,
      source: 'CLOUD',
      cid,
      uid,
    },
    {
      pathPrefix: '/saas/pro/',
      businessType: 'normal_prepayment_create',
      headers: { idemkey: idemKey },
    }
  );

  const data = extractErpData<{ id: number; paidBillStr?: string; billStr?: string }>(result);

  const id = data?.id;
  const billStr = data?.paidBillStr || data?.billStr || '';
  if (!id) {
    throw new Error('创建普通预付款失败: 未返回 id');
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
 * 全量拉取 + 可选关键词内存过滤
 */
export async function listTraderPrepayments(
  traderId: number, keyword?: string
): Promise<AvailablePrepayment[]> {
  const { cid, uid } = getErpDefaults();

  const fetchPage = async (current: number) => {
    const result = await erpGet<unknown>(
      '/prepay/list-trader-prepay',
      { current, size: 100, type: 'PRE_PAID', traderId, prePayType: 'NORMAL', cid, uid },
      { pathPrefix: '/saas/pro/', businessType: 'trader_prepayment_list' }
    );
    const data = extractErpData<{ records?: AvailablePrepayment[]; total?: number }>(result);
    return {
      records: data?.records ?? [],
      total: data?.total ?? 0,
    };
  };

  const allRecords = await fetchAllPagesSequential(fetchPage, 100);

  if (keyword) {
    const kw = keyword.toLowerCase();
    return allRecords.filter(r =>
      r.paidBillStr?.toLowerCase().includes(kw) ||
      String(r.id).includes(keyword)
    );
  }
  return allRecords;
}
