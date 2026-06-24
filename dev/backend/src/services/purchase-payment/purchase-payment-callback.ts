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
  createNormalPrepayment,
  deApprovePaidBill,
  cancelPaidBill,
  deApprovePrepayment,
  cancelPrepayment,
  buildPurchasePaymentIdemKey,
} from '../erp-client/erp-purchase.service';
import { getErpDefaults } from '../erp-client/erp-config';
import type { CreatePaidBillInput, PaidBillInvoiceInput } from '../erp-client/erp-purchase.types';
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

  if (!actualAmount || !paymentSubjectId || !supplierId) {
    throw new Error('缺少实付金额、付款账户或供应商');
  }

  // 从 _details.debtIds 读取自动持久化的应付单据明细
  const details = formData._details as Record<string, unknown> | undefined;
  const debtDetails = details?.debtIds as Array<{
    bizId: number;
    billTypeEnum: string;
    leftAmount: string;
  }> | undefined;
  if (!debtDetails || debtDetails.length === 0) {
    throw new Error('缺少应付单据明细数据');
  }

  // 构造 invoiceList（仅传业务数据，服务层自动处理 totalAmount/抹零分摊/arrivalTime 等）
  const invoiceList: PaidBillInvoiceInput[] = debtDetails.map(debt => ({
    bizId: debt.bizId,
    bizType: debt.billTypeEnum,
    leftAmount: debt.leftAmount,
  }));

  const idemKey = buildPurchasePaymentIdemKey('PAID', instance.id, 4);
  const result = await createPaidBill(
    {
      traderId: supplierId,
      salesmanId: defaultSalesmanId,
      deptId: defaultDeptId,
      workTime: beijingDateTime(),
      note: `OA: ${instance.instance_no}`,
      paymentDetails: [{ paymentAmount: actualAmount, subjectId: paymentSubjectId }],
      invoiceList,
      wipeOffAmount,
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

  // 出纳实付金额优先，兜底使用申请人填写的预付金额
  const paymentAmount = actualAmount || prepayAmount;
  if (!paymentAmount || !paymentSubjectId || !supplierId) {
    throw new Error('缺少实付金额、付款账户或供应商');
  }

  const idemKey = buildPurchasePaymentIdemKey('PREPAY', instance.id, 4);
  const result = await createNormalPrepayment(
    {
      traderId: parseInt(supplierId, 10),
      traderType: 'SUPPLIER',
      type: 'PRE_PAID',
      prePayType: 'NORMAL',
      totalAmount: paymentAmount,
      paymentDetails: [{ paymentAmount, subjectId: paymentSubjectId }],
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
