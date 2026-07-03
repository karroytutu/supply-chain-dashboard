/**
 * ERP 客户收款单服务
 * 封装客户收款单创建（核销对冲）、反审核、取消的 ERP API 调用
 * @domain 结算 (Settlement)
 * @module services/erp-client/erp-customer-receipt.service
 */

import { erpPost } from './erp-client';
import { getErpDefaults } from './erp-config';
import { createLogger } from '../../utils/logger';
import { beijingDateTime } from '../../utils/beijingTime';
import { submitPaymentBill } from './erp-payment-bill.service';

const log = createLogger('CustomerReceipt');

// =====================================================
// 类型定义
// =====================================================

/** 收款单核销行项 */
export interface ReceiptInvoiceItem {
  /** 业务ID（应收单的 bizId 或费用单的 id） */
  bizId: number;
  /** 业务类型：FUNDS_SALES / FUNDS_SALES_BACK / CONSUMER_EXPENDITURE */
  bizType: string;
  /** 核销金额（应收单为正，费用单为负） */
  paidAmount: string;
  /** 剩余金额（与 paidAmount 同符号） */
  leftAmount: string;
  /** 折扣金额 */
  discountAmount?: string;
  /** 备注 */
  note?: string;
}

/** 创建客户收款单请求参数 */
export interface CreateCustomerReceiptParams {
  traderId: number;
  /** 核销行项：应收单（正金额）+ 费用单（负金额），金额必须精确对冲 */
  invoiceList: ReceiptInvoiceItem[];
  note?: string;
}

/** 创建客户收款单响应 */
export interface CreateCustomerReceiptResult {
  id: number;
  paidBillStr: string;
  state: string;
}

// =====================================================
// 创建收款单核销
// =====================================================

/**
 * 创建客户收款单并审核（费用单与应收单据对冲核销）
 * POST /saas/pro/paid/save-and-approve
 *
 * 与供应商付款单 createPaidBill 的差异：
 * - paymentDirection: 'IN'（收款）vs 'OUT'（付款）
 * - traderType: 'STORE'（客户）vs 'SUPPLIER'（供应商）
 * - type: 'RECEIVE' vs 'PAID'
 * - totalAmount 固定为 '0'（全额对冲）
 * - consumerId = traderId
 *
 * @invalidates ERP_DEBTS_ALL (customer debt cache)
 * @usedBy bad-debt-callback.ts
 */
export async function createCustomerReceipt(
  params: CreateCustomerReceiptParams,
  idemKey?: string
): Promise<CreateCustomerReceiptResult> {
  const { defaultSalesmanId, defaultDeptId } = getErpDefaults();
  const now = beijingDateTime();

  log.info(`创建收款单核销: traderId=${params.traderId}, invoiceList=${params.invoiceList.length}行`);

  const result = await submitPaymentBill(
    {
      paymentDirection: 'IN',
      traderType: 'STORE',
      type: 'RECEIVE',
      traderId: params.traderId,
      consumerId: params.traderId,
      salesmanId: defaultSalesmanId,
      deptId: defaultDeptId,
      operatorId: String(defaultSalesmanId),
      workTime: now,
      arrivalTime: now,
      note: params.note || '',
      totalAmount: '0',
      paymentDetails: [],
      invoiceList: params.invoiceList.map(item => ({
        bizId: item.bizId,
        bizType: item.bizType,
        paidAmount: item.paidAmount,
        leftAmount: item.leftAmount,
        discountAmount: item.discountAmount,
      })),
      ifAutoCollect: true,
      ifAutoCollectBill: true,
    },
    idemKey,
    'create_customer_receipt'
  );

  return {
    id: result.id,
    paidBillStr: result.paidBillStr,
    state: result.state,
  };
}

// =====================================================
// 反审核收款单
// =====================================================

/**
 * 反审核客户收款单
 * POST /saas/pro/paid/de-approve
 *
 * @usedBy bad-debt-callback.ts, erp-cleanup.ts
 */
export async function deApproveCustomerReceipt(billId: number): Promise<void> {
  const { cid, uid } = getErpDefaults();

  await erpPost(
    '/paid/de-approve',
    { id: billId, cid, uid, time: Date.now() },
    { pathPrefix: '/saas/pro/', businessType: 'customer_receipt_de_approve' }
  );
}

// =====================================================
// 取消收款单
// =====================================================

/**
 * 取消客户收款单
 * POST /saas/pro/paid/cancel
 *
 * @usedBy bad-debt-callback.ts, erp-cleanup.ts
 */
export async function cancelCustomerReceipt(billId: number): Promise<void> {
  const { cid, uid } = getErpDefaults();

  await erpPost(
    '/paid/cancel',
    { id: billId, cid, uid },
    { pathPrefix: '/saas/pro/', businessType: 'customer_receipt_cancel' }
  );
}
