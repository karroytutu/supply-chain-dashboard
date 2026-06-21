/**
 * 采购审批 - auto节点回调
 * @module services/procurement-order/procurement-callback
 *
 * 职责：
 * 1. onApproved: auto节点执行ERP操作（创建预付款/审核PO）
 *
 * 新版流程（v5）审批链在auto节点之前，拒绝时无ERP单据需回滚。
 * 旧版在途实例（v4）的回调函数保留供兼容。
 */
import { createLogger } from '../../utils/logger';
const log = createLogger('ProcurementCallback');

import { appQuery as query } from '../../db/appPool';
import type { OaInstanceRow } from '../oa/oa.types';
import {
  mergeErpResponseData,
  mergeFormData,
  getErpMeta,
} from '../../services/fixed-asset/erp-meta-utils';
import {
  createPurchasePrepayment,
  approvePurchaseOrder,
  buildProcurementIdemKey,
} from '../erp-client/erp-purchase.service';
import type {
  CreatePurchasePrepaymentRequest,
} from '../erp-client/erp-purchase.types';

// =====================================================
// onApproved: auto 节点回调
// =====================================================

/**
 * auto节点执行入口
 * 通过查询当前 processing 状态的 auto 节点 node_order 进行分发
 */
export async function handleProcurementAutoNode(
  instance: OaInstanceRow,
  formData: Record<string, unknown>
): Promise<void> {
  // 查询当前正在执行的 auto 节点
  const currentNodeResult = await query<{ node_order: number; node_name: string }>(
    `SELECT node_order, node_name FROM oa_approval_nodes
     WHERE instance_id = $1 AND node_type = 'auto' AND status = 'processing'
     ORDER BY node_order LIMIT 1`,
    [instance.id]
  );

  const nodeOrder = currentNodeResult.rows[0]?.node_order;
  const nodeName = currentNodeResult.rows[0]?.node_name;
  log.info(`[采购审批] auto节点执行: instanceId=${instance.id}, node=${nodeOrder}(${nodeName})`);

  // v5 新版流程：order 5=创建预付款, 6=审核PO（无 order 7）
  // v4 旧版兼容：order 5=创建付款单核销, 7=创建预付款, 8=审核PO, 10=办结
  switch (nodeOrder) {
    case 5:
      // v5: 创建采购预付款 / v4旧版: 创建付款单核销（通过nodeName区分）
      if (nodeName === '创建采购预付款') {
        return handleCreatePrepayment(instance, formData);
      }
      // 旧版v4的"创建付款单核销"——保留兼容，记录日志跳过
      log.warn(`[采购审批] 旧版v4节点(order=5, name=${nodeName})，跳过`);
      return;
    case 6:
      return handleApprovePO(instance, formData);
    case 7:
      // v4旧版: 创建采购预付款（v5 的“办结检查”已移除）
      if (nodeName === '创建采购预付款') {
        return handleCreatePrepaymentV4(instance, formData);
      }
      log.warn(`[采购审批] 未知的auto节点: nodeOrder=7, nodeName=${nodeName}`);
      return;
    case 8:
      // v4旧版: 审核采购订单
      return handleApprovePO(instance, formData);
    case 10:
      // v4旧版: 办结检查
      return handleCompletion(instance, formData);
    default:
      // v4旧版多货子流程 (order > 10)——保留兼容，记录日志
      if (nodeOrder && nodeOrder > 10) {
        log.warn(`[采购审批] 旧版v4多货节点(order=${nodeOrder}, name=${nodeName})，跳过`);
        return;
      }
      log.warn(`[采购审批] 未知的auto节点: nodeOrder=${nodeOrder}`);
  }
}

// =====================================================
// 各 auto 节点处理函数
// =====================================================

/**
 * 创建采购预付款 (v5: order=5)
 * 出纳上传回单后，创建采购预付款绑定PO
 */
async function handleCreatePrepayment(
  instance: OaInstanceRow,
  formData: Record<string, unknown>
): Promise<void> {
  const originalBillId = (formData._originalBillId || formData.erpBillId) as number;
  const originalBillStr = (formData._originalBillStr || formData.erpBillStr) as string;
  const supplierId = (formData._supplierId || formData.supplierId) as string;
  const prepaymentAmount = formData.prepaymentAmount as string;
  const paymentAmount = formData.paymentAmount as string;
  const paymentSubjectId = formData.paymentSubjectId as number;

  // 优先使用出纳填写的付款金额，其次使用表单预付金额
  const amount = paymentAmount || prepaymentAmount;

  if (!originalBillId || !supplierId || !amount) {
    throw new Error('缺少采购订单ID、供应商ID或付款金额');
  }
  if (!paymentSubjectId) {
    throw new Error('缺少付款账户，出纳需在审批时选择付款账户');
  }

  const idemKey = buildProcurementIdemKey('PREPAY', instance.id, 5);
  const request: CreatePurchasePrepaymentRequest = {
    relatedBizId: originalBillId,
    relatedBizStr: originalBillStr,
    relatedBizTypeEnum: 'PURCHASE_ORDER',
    traderId: parseInt(supplierId, 10),
    traderType: 'SUPPLIER',
    type: 'PRE_PAID',
    totalAmount: parseFloat(amount),
    paymentDetails: [{ paymentAmount: amount, subjectId: paymentSubjectId }],
    paymentDirection: 'OUT',
    salesmanId: '97',
    source: 'CLOUD',
    workTime: new Date().toISOString().slice(0, 19).replace('T', ' '),
    note: `OA: ${instance.instance_no}`,
  };

  const result = await createPurchasePrepayment(request, idemKey);
  log.info(`[采购审批] 采购预付款创建成功: billStr=${result.billStr}`);

  await mergeErpResponseData(instance.id, {
    prepayBillId: result.id,
    prepayBillStr: result.billStr,
  });

  // 回填预付款单号到 form_data，前端表单可直接展示
  await mergeFormData(instance.id, {
    prepayBillStr: result.billStr,
  });
}

/**
 * 创建采购预付款 (v4旧版兼容: order=7)
 * 保留供在途旧实例使用
 */
async function handleCreatePrepaymentV4(
  instance: OaInstanceRow,
  formData: Record<string, unknown>
): Promise<void> {
  const originalBillId = (formData._originalBillId || formData.erpBillId) as number;
  const originalBillStr = (formData._originalBillStr || formData.erpBillStr) as string;
  const supplierId = (formData._supplierId || formData.supplierId) as string;
  const paymentAmount = formData.paymentAmount as string;
  const paymentSubjectId = formData.paymentSubjectId as number;

  if (!originalBillId || !supplierId || !paymentAmount) {
    throw new Error('缺少采购订单ID、供应商ID或付款金额');
  }
  if (!paymentSubjectId) {
    throw new Error('缺少付款账户，出纳需在审批时选择付款账户');
  }

  const idemKey = buildProcurementIdemKey('PREPAY', instance.id, 7);
  const request: CreatePurchasePrepaymentRequest = {
    relatedBizId: originalBillId,
    relatedBizStr: originalBillStr,
    relatedBizTypeEnum: 'PURCHASE_ORDER',
    traderId: parseInt(supplierId, 10),
    traderType: 'SUPPLIER',
    type: 'PRE_PAID',
    totalAmount: parseFloat(paymentAmount),
    paymentDetails: [{ paymentAmount, subjectId: paymentSubjectId }],
    paymentDirection: 'OUT',
    salesmanId: '97',
    source: 'CLOUD',
    workTime: new Date().toISOString().slice(0, 19).replace('T', ' '),
    note: `OA: ${instance.instance_no}`,
  };

  const result = await createPurchasePrepayment(request, idemKey);
  log.info(`[采购审批] v4旧版-采购预付款创建成功: billStr=${result.billStr}`);

  await mergeErpResponseData(instance.id, {
    prepayBillId: result.id,
    prepayBillStr: result.billStr,
  });

  // 回填预付款单号到 form_data，前端表单可直接展示
  await mergeFormData(instance.id, {
    prepayBillStr: result.billStr,
  });
}

/**
 * 审核采购订单 (v5: order=6, v4: order=8)
 * 调用ERP approve API，PO状态变为SIGN，库管可在ERP操作入库
 */
async function handleApprovePO(
  instance: OaInstanceRow,
  formData: Record<string, unknown>
): Promise<void> {
  const originalBillId = (formData._originalBillId || formData.erpBillId) as number;

  if (!originalBillId) {
    throw new Error('缺少采购订单ID');
  }

  try {
    await approvePurchaseOrder(originalBillId);
    log.info(`[采购审批] 采购订单审核成功: billId=${originalBillId}`);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    // PO已被取消（可能是测试清理或人工操作），不再抛出异常导致auto节点failed
    // 而是记录警告并跳过，让流程继续
    if (msg.includes('已取消') || msg.includes('CANCEL')) {
      log.warn(`[采购审批] 采购订单已取消，跳过审核: billId=${originalBillId}`);
      return;
    }
    throw err; // 其他错误仍然抛出
  }

  await mergeErpResponseData(instance.id, { poApproved: true, originalBillId });
}

/**
 * 办结检查 (v4旧版: order=10)
 * 保留供在途旧实例使用
 */
async function handleCompletion(
  instance: OaInstanceRow,
  formData: Record<string, unknown>
): Promise<void> {
  log.info(`[采购审批] 办结检查: instanceId=${instance.id}`);
  await mergeErpResponseData(instance.id, { completionStatus: 'completed' });
}
