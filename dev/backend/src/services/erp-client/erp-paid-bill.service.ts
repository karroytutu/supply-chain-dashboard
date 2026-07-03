/**
 * ERP 付款单服务（供应商侧）
 * 封装供应商付款单的创建、反审核、取消等 ERP API 调用
 * @domain 采购 (Procurement)
 * @module services/erp-client/erp-paid-bill.service
 */
import { erpPost } from './erp-client';
import { getErpDefaults } from './erp-config';
import { submitPaymentBill } from './erp-payment-bill.service';
import type { PaymentBillInvoiceItem, PaymentBillPrepayItem } from './erp-payment-bill.service';
import type {
  CreatePaidBillInput,
  CreatePaidBillResponse,
  PaidBillInvoiceInput,
} from './erp-purchase.types';

/**
 * 创建付款单核销 (API#11)
 * POST /saas/pro/paid/save-and-approve
 *
 * 接收业务输入（CreatePaidBillInput），自动处理 ERP 协议细节：
 * - totalAmount = sum(paymentDetails.amount) + wipeOffAmount
 *   反映本次实际非预付款支付总额（银行转账 + 抹零），预付款核销部分由 prepayList 单独体现
 * - 抹零按 leftAmount 占比分摊到各条 discountAmount（倒挤法保总和）
 * - arrivalTime = workTime
 * - prePaidAmount = "0"
 * - 金额统一 string 类型
 *
 * @invalidates ERP_DEBTS_ALL (supplier debt cache)
 */
export async function createPaidBill(
  input: CreatePaidBillInput,
  idemKey: string
): Promise<CreatePaidBillResponse> {
  const { cid, uid } = getErpDefaults();

  // 1. 计算 totalAmount = sum(paymentDetails.amount) + wipeOff
  //    totalAmount 反映非预付款支付总额（银行转账 + 抹零），预付款核销部分由 prepayList 单独体现
  const wipeOff = parseFloat(input.wipeOffAmount || '0') || 0;
  const bankTotal = input.paymentDetails.reduce(
    (sum, pd) => sum + (parseFloat(String(pd.paymentAmount || 0)) || 0), 0
  );
  const totalAmount = Math.round((bankTotal + wipeOff) * 100) / 100;

  // 2. 抹零分摊：优先使用每条 invoice 的 discountAmount（单据级手动抹零），
  //    未传时降级使用整单 wipeOffAmount 按比例分摊（兼容旧逻辑）
  const hasPerInvoiceDiscount = input.invoiceList.some(inv => inv.discountAmount != null);
  const discountAmounts = hasPerInvoiceDiscount
    ? input.invoiceList.map(inv => inv.discountAmount || '0')
    : distributeDiscount(input.invoiceList, wipeOff);

  // 3. 组装统一格式的 invoiceList
  //    paidAmount：优先使用 inv.paidAmount（部分付款），未传时降级使用 leftAmount（全额核销）
  //    preAllocateAmount：按顺序将预付核销总额分配到各条明细（每条分配 min(netAmount, 剩余预付额)）
  const prepayWriteOffTotal = (input.prepayList || []).reduce(
    (sum, p) => sum + (parseFloat(String(p.writeOffAmount || 0)) || 0), 0
  );
  let prepayRemaining = prepayWriteOffTotal;
  const invoiceList: PaymentBillInvoiceItem[] = input.invoiceList.map((inv, i) => {
    const paid = parseFloat(inv.paidAmount || String(inv.leftAmount)) || 0;
    const discount = parseFloat(discountAmounts[i]) || 0;
    const net = Math.round((paid - discount) * 100) / 100;
    const allocate = prepayRemaining > 0 ? Math.min(net, prepayRemaining) : 0;
    prepayRemaining = Math.round((prepayRemaining - allocate) * 100) / 100;
    return {
      bizId: inv.bizId,
      bizType: inv.bizType,
      paidAmount: inv.paidAmount || String(inv.leftAmount),
      discountAmount: discountAmounts[i],
      preAllocateAmount: String(Math.round(allocate * 100) / 100),
      leftAmount: String(inv.leftAmount),
      note: inv.note || '',
      originNote: inv.originNote || '',
    };
  });

  const prepayList: PaymentBillPrepayItem[] = (input.prepayList || []).map(p => ({
    paidBillId: p.paidBillId,
    paidBillStr: p.paidBillStr,
    writeOffAmount: String(p.writeOffAmount || '0'),
    leftAmount: String(p.leftAmount),
    wipeOffAmount: String(p.wipeOffAmount || '0'),
  }));

  // 4. 委托统一服务提交
  const result = await submitPaymentBill(
    {
      paymentDirection: 'OUT',
      traderType: 'SUPPLIER',
      type: 'PAID',
      traderId: input.traderId,
      salesmanId: input.salesmanId,
      deptId: input.deptId,
      workTime: input.workTime,
      note: input.note || '',
      totalAmount: String(totalAmount),
      wipeOffAmount: input.wipeOffAmount || '0',
      paymentDetails: input.paymentDetails,
      invoiceList,
      prepayList,
    },
    idemKey,
    'paid_bill_create'
  );

  return {
    id: result.id,
    paidBillStr: result.paidBillStr,
    state: result.state,
  } as CreatePaidBillResponse;
}

/**
 * 抹零金额按比例分摊到各条明细（倒挤法保总和）
 * 前 N-1 条：按比例四舍五入保留两位小数
 * 第 N 条：用总额减去前 N-1 条合计，确保分摊总和 = wipeOffAmount
 */
function distributeDiscount(
  invoiceList: PaidBillInvoiceInput[],
  wipeOffAmount: number
): string[] {
  if (wipeOffAmount <= 0 || invoiceList.length === 0) {
    return invoiceList.map(() => '0');
  }

  const totalLeft = invoiceList.reduce(
    (sum, inv) => sum + (parseFloat(inv.leftAmount) || 0), 0
  );
  if (totalLeft <= 0) {
    return invoiceList.map(() => '0');
  }

  const result: string[] = [];
  let distributed = 0;

  for (let i = 0; i < invoiceList.length; i++) {
    if (i < invoiceList.length - 1) {
      const proportion = (parseFloat(invoiceList[i].leftAmount) || 0) / totalLeft;
      const amount = Math.round(proportion * wipeOffAmount * 100) / 100;
      result.push(String(amount));
      distributed += amount;
    } else {
      // 最后一条用倒挤法
      const lastAmount = Math.round((wipeOffAmount - distributed) * 100) / 100;
      result.push(String(lastAmount));
    }
  }

  return result;
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
