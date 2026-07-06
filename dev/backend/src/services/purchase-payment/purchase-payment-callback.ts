/**
 * 采购付款申请单 — auto 节点回调
 * @module services/purchase-payment/purchase-payment-callback
 *
 * 职责：
 * 1. auto 节点（order=4）：根据付款类型创建 ERP 单据
 *    - 后付款：createPaidBill（核销选中的应付单据）
 *    - 预付款：createNormalPrepayment（普通预付款单）
 * 2. onRejected：驳回时回滚已创建的 ERP 单据
 */
import { createLogger } from '../../utils/logger';
const log = createLogger('PurchasePaymentCallback');

import { appQuery as query } from '../../db/appPool';
import { beijingDateTime } from '../../utils/beijingTime';
import type { OaInstanceRow, CallbackResult } from '../oa/oa.types';
import { getErpMeta } from '../fixed-asset/erp-meta-utils';
import {
  createPaidBill,
  deApprovePaidBill,
  cancelPaidBill,
} from '../erp-client/erp-paid-bill.service';
import {
  createNormalPrepayment,
  deApprovePrepayment,
  cancelPrepayment,
} from '../erp-client/erp-prepayment.service';
import {
  buildPurchasePaymentIdemKey,
} from '../erp-client/erp-purchase-order.service';
import { getErpDefaults } from '../erp-client/erp-config';
import type { CreatePaidBillInput, PaidBillInvoiceInput, PaidBillPrepayItem } from '../erp-client/erp-purchase.types';
import { PAYMENT_TYPE } from '../oa/form-types/purchase-payment';

// =====================================================
// onApproved: auto 节点回调入口
// =====================================================

/**
 * auto 节点回调入口
 * 查询当前 processing 的 auto 节点，按 paymentType 分发
 */
export async function handlePurchasePaymentAutoNode(
  instance: OaInstanceRow,
  formData: Record<string, unknown>
): Promise<CallbackResult | void> {
  const currentNodeResult = await query<{ node_order: number; node_name: string }>(
    `SELECT node_order, node_name FROM oa_approval_nodes
     WHERE instance_id = $1 AND node_type = 'auto' AND status = 'processing'
     ORDER BY node_order LIMIT 1`,
    [instance.id]
  );

  const nodeOrder = currentNodeResult.rows[0]?.node_order;
  log.info(`[采购付款] auto节点执行: instanceId=${instance.id}, nodeOrder=${nodeOrder}`);

  if (nodeOrder !== 4) {
    log.warn(`[采购付款] 未知的auto节点: nodeOrder=${nodeOrder}`);
    return;
  }

  const paymentType = formData.paymentType as string;

  if (paymentType === PAYMENT_TYPE.POSTPAY) {
    return handlePostpayPayment(instance, formData);
  }
  if (paymentType === PAYMENT_TYPE.PREPAY) {
    return handlePrepayPayment(instance, formData);
  }

  log.warn(`[采购付款] 未知的付款类型: ${paymentType}`);
}

// =====================================================
// 后付款：创建 ERP 付款单核销应付单据
// =====================================================

async function handlePostpayPayment(
  instance: OaInstanceRow,
  formData: Record<string, unknown>
): Promise<CallbackResult> {
  const { defaultSalesmanId, defaultDeptId } = getErpDefaults();

  const supplierId = formData.supplierId as string;
  const actualAmount = formData.actualAmount as string;
  const paymentSubjectId = formData.paymentSubjectId as number;
  const wipeOffAmount = formData.discountAmount as string || '0';

  if (!supplierId) {
    throw new Error('缺少供应商');
  }

  // 从 _details.debtIds 读取自动持久化的应付单据明细（含部分付款金额和抹零）
  const details = formData._details as Record<string, unknown> | undefined;
  const debtDetails = details?.debtIds as Array<{
    bizId: number;
    billTypeEnum: string;
    leftAmount: string;
    paymentAmount?: string;
    discountAmount?: string;
  }> | undefined;
  if (!debtDetails || debtDetails.length === 0) {
    throw new Error('缺少应付单据明细数据');
  }

  // 构造 invoiceList：纯预付款核销时用 leftAmount（全额结算），部分付款时用 paymentAmount
  const isPurePrepay = formData._isPurePrepayWriteOff === 1 || formData._isPurePrepayWriteOff === '1';
  const invoiceList: PaidBillInvoiceInput[] = debtDetails.map(debt => ({
    bizId: debt.bizId,
    bizType: debt.billTypeEnum,
    leftAmount: debt.leftAmount,
    paidAmount: isPurePrepay
      ? String(parseFloat(debt.leftAmount) || 0)   // 纯预付款：全额结算，保留原始精度
      : (debt.paymentAmount || debt.leftAmount),    // 部分付款：用用户填写的金额
    discountAmount: debt.discountAmount, // 本次抹零金额（用户手动填写）
  }));

  // 构造 prepayList：从 _details.prepaymentIds 读取预付款核销明细
  const prepayDetails = details?.prepaymentIds as Array<{
    id: number;
    paidBillStr: string;
    availableAmount: string;
    useAmount?: string;
  }> | undefined;
  const prepayList: PaidBillPrepayItem[] = (prepayDetails || [])
    .filter(p => parseFloat(String(p.useAmount || 0)) > 0)
    .map(p => ({
      paidBillId: p.id,
      paidBillStr: p.paidBillStr,
      writeOffAmount: String(p.useAmount || '0'),
      leftAmount: p.availableAmount,
      wipeOffAmount: '0',
    }));

  // paymentDetails 构建：纯预付款核销无需银行转账，优先使用 paymentLines，降级使用旧字段
  // 兼容两种格式：新格式用 id，旧格式用 paymentSubjectId
  const paymentLines = formData.paymentLines as Array<{
    id?: number;
    paymentSubjectId?: number;
    amount?: string;
  }> | undefined;
  let paymentDetails: Array<{ paymentAmount: string; subjectId: number }>;
  if (isPurePrepay) {
    // 纯预付款核销：出纳环节被条件跳过，无需银行转账，paymentDetails 留空
    paymentDetails = [];
  } else if (paymentLines && paymentLines.length > 0) {
    paymentDetails = paymentLines
      .filter(line => {
        const subjectId = line.paymentSubjectId || line.id;
        const amount = parseFloat(String(line.amount || 0));
        return subjectId && amount !== 0;
      })
      .map(line => ({
        paymentAmount: String(line.amount || '0'),
        subjectId: (line.paymentSubjectId || line.id)!,
      }));
    if (paymentDetails.length === 0) {
      throw new Error('银行转账明细中至少需要一条有效记录（金额 ≠ 0 且已选择付款科目）');
    }
  } else {
    // 降级：使用出纳环节的单一付款账户
    if (!actualAmount || !paymentSubjectId) {
      throw new Error('缺少实付金额或付款账户');
    }
    paymentDetails = [{ paymentAmount: actualAmount, subjectId: paymentSubjectId }];
  }

  const idemKey = buildPurchasePaymentIdemKey('PAID', instance.id, 4);
  const result = await createPaidBill(
    {
      traderId: supplierId,
      salesmanId: defaultSalesmanId,
      deptId: defaultDeptId,
      workTime: beijingDateTime(),
      note: `OA: ${instance.instance_no}`,
      paymentDetails,
      invoiceList,
      wipeOffAmount,
      prepayList,
    },
    idemKey
  );

  log.info(`[采购付款] 后付款单创建成功: paidBillStr=${result.paidBillStr}`);

  return {
    erpMeta: {
      erpBillId: result.id,
      erpBillStr: result.paidBillStr,
      erpOperationType: 'PAID',
    },
    formData: {
      erpBillStr: result.paidBillStr,
    },
  };
}

// =====================================================
// 预付款：创建普通预付款单
// =====================================================

async function handlePrepayPayment(
  instance: OaInstanceRow,
  formData: Record<string, unknown>
): Promise<CallbackResult> {
  const { defaultSalesmanId } = getErpDefaults();

  const supplierId = formData.supplierId as string;
  const actualAmount = formData.actualAmount as string;
  const prepayAmount = formData.prepayAmount as string;
  const paymentSubjectId = formData.paymentSubjectId as number;

  if (!supplierId) {
    throw new Error('缺少供应商');
  }

  // paymentDetails：优先使用多银行账户明细（paymentLines），降级使用出纳单一付款账户
  const paymentLines = formData.paymentLines as Array<{
    id?: number;
    paymentSubjectId?: number;
    amount?: string;
  }> | undefined;
  let paymentDetails: Array<{ paymentAmount: string; subjectId: number }>;
  let totalPaymentAmount: string;

  if (paymentLines && paymentLines.length > 0) {
    paymentDetails = paymentLines
      .filter(line => {
        const subjectId = line.paymentSubjectId || line.id;
        const amount = parseFloat(String(line.amount || 0));
        return subjectId && amount !== 0;
      })
      .map(line => ({
        paymentAmount: String(line.amount || '0'),
        subjectId: (line.paymentSubjectId || line.id)!,
      }));
    if (paymentDetails.length === 0) {
      throw new Error('银行转账明细中至少需要一条有效记录（金额 ≠ 0 且已选择付款科目）');
    }
    totalPaymentAmount = String(
      Math.round(paymentDetails.reduce((sum, d) => sum + parseFloat(d.paymentAmount), 0) * 100) / 100
    );
  } else {
    // 降级：使用旧字段
    const amount = actualAmount || prepayAmount;
    if (!amount || !paymentSubjectId) {
      throw new Error('缺少实付金额或付款账户');
    }
    paymentDetails = [{ paymentAmount: amount, subjectId: paymentSubjectId }];
    totalPaymentAmount = amount;
  }

  const idemKey = buildPurchasePaymentIdemKey('PREPAY', instance.id, 4);
  const result = await createNormalPrepayment(
    {
      traderId: parseInt(supplierId, 10),
      traderType: 'SUPPLIER',
      type: 'PRE_PAID',
      prePayType: 'NORMAL',
      totalAmount: totalPaymentAmount,
      paymentDetails,
      paymentDirection: 'OUT',
      salesmanId: defaultSalesmanId,
      workTime: beijingDateTime(),
      note: `OA: ${instance.instance_no}`,
    },
    idemKey
  );

  log.info(`[采购付款] 普通预付款单创建成功: billStr=${result.billStr}`);

  return {
    erpMeta: {
      erpBillId: result.id,
      erpBillStr: result.billStr,
      erpOperationType: 'PREPAY',
    },
    formData: {
      erpBillStr: result.billStr,
    },
  };
}

// =====================================================
// onRejected: 驳回回滚
// =====================================================

/**
 * 审批驳回时回滚已创建的 ERP 单据
 * 检查 erp_meta 中是否有已创建的单据，按类型反向回滚
 */
export async function handlePurchasePaymentRejected(
  instance: OaInstanceRow,
  _formData: Record<string, unknown>
): Promise<void> {
  const erpMeta = getErpMeta(instance);
  if (!erpMeta?.responseData) {
    log.info(`[采购付款] 驳回时未发现已创建的ERP单据，跳过回滚`);
    return;
  }

  const responseData = erpMeta.responseData;
  const operationType = responseData.erpOperationType as string;
  const erpBillId = responseData.erpBillId as number;

  if (!erpBillId) {
    log.info(`[采购付款] 驳回时无 erpBillId，跳过回滚`);
    return;
  }

  try {
    if (operationType === 'PAID') {
      log.info(`[采购付款] 驳回回滚: 反审核+取消付款单 id=${erpBillId}`);
      await deApprovePaidBill(erpBillId);
      await cancelPaidBill(erpBillId);
    } else if (operationType === 'PREPAY') {
      log.info(`[采购付款] 驳回回滚: 反审核+取消预付款单 id=${erpBillId}`);
      await deApprovePrepayment(erpBillId);
      await cancelPrepayment(erpBillId);
    } else {
      log.warn(`[采购付款] 驳回回滚: 未知操作类型 ${operationType}`);
    }
  } catch (error) {
    log.error(`[采购付款] 驳回回滚失败: erpBillId=${erpBillId}, error=${error instanceof Error ? error.message : error}`);
    throw error;
  }
}
