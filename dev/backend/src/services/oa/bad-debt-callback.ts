/**
 * 坏账处理 — auto 节点回调 + 驳回回滚
 * @module services/oa/bad-debt-callback
 *
 * 职责：
 * 1. 节点 2: 创建坏账费用单（ERP expenditure-bill/save-approve-trade-expenditure）
 * 2. 节点 3: 创建收款单核销（ERP paid/save-and-approve，费用单与应收单据对冲）
 * 3. 驳回回滚: 反向清理已创建的收款单和费用单
 */

import { createLogger } from '../../utils/logger';
import { appQuery as query } from '../../db/appPool';
import type { OaInstanceRow, CallbackResult } from './oa.types';
import {
  createBadDebtExpenditure,
  createCustomerReceipt,
  cleanupBadDebtBills,
} from '../erp-client';
import type { ReceiptInvoiceItem } from '../erp-client';

const log = createLogger('BadDebtCallback');

// =====================================================
// 工具函数：从 formData 解析表格明细记录
// =====================================================

/**
 * 从 formData 解析表格字段的完整记录
 * 前端表格字段存储结构：
 * - formData.billDetails = ID 数组（如 [114415, 99200]）
 * - formData._details.billDetails = 完整记录数组（含 leftAmount, bizId 等）
 */
function resolveBillDetails(formData: Record<string, unknown>): Array<Record<string, unknown>> | undefined {
  const details = formData._details as Record<string, unknown> | undefined;
  const records = details?.billDetails as Array<Record<string, unknown>> | undefined;
  if (records && records.length > 0) return records;
  return undefined;
}

// =====================================================
// onApproved: auto 节点回调入口
// =====================================================

/**
 * auto 节点执行入口
 * 通过查询当前 processing 状态的 auto 节点 node_order 进行分发
 */
export async function handleBadDebtAutoNode(
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
  const nodeName = currentNodeResult.rows[0]?.node_name;
  log.info(`[坏账处理] auto节点执行: instanceId=${instance.id}, node=${nodeOrder}(${nodeName})`);

  switch (nodeOrder) {
    case 2:
      return handleCreateExpenditure(instance, formData);
    case 3:
      return handleCreateReceipt(instance, formData);
    default:
      log.warn(`[坏账处理] 未知的auto节点: nodeOrder=${nodeOrder}, nodeName=${nodeName}`);
  }
}

// =====================================================
// 节点 2: 创建坏账费用单
// =====================================================

async function handleCreateExpenditure(
  instance: OaInstanceRow,
  formData: Record<string, unknown>
): Promise<CallbackResult> {
  // 幂等前置检查：如果 formData 已有费用单 ID，说明是重试，跳过创建
  const existingId = formData._expenditureBillId as number | undefined;
  if (existingId) {
    log.info(`[坏账处理] 节点2 幂等跳过: 已有费用单ID=${existingId}`);
    return {
      erpMeta: {
        expenditureBillId: existingId,
        expenditureBillStr: formData._expenditureBillStr as string,
      },
    };
  }

  const customerId = Number(formData.customerId);
  const customerName = (formData._customerName as string) || '';
  const billDetails = resolveBillDetails(formData);

  if (!customerId || !billDetails?.length) {
    throw new Error('创建坏账费用单失败：缺少客户ID或应收单据');
  }

  // 计算坏账总金额（从 billDetails 的 leftAmount 汇总）
  const totalAmount = billDetails.reduce((sum, d) => {
    return sum + (parseFloat(d.leftAmount as string) || 0);
  }, 0);

  const reason = (formData.badDebtReason as string) || '';
  const note = [instance.instance_no, reason].filter(Boolean).join('+');
  const idemKey = `BADDEBT-EXPENSE-${instance.id}-2`;

  log.info(`[坏账处理] 创建费用单: customer=${customerName}, amount=${totalAmount}, idemKey=${idemKey}`);

  const result = await createBadDebtExpenditure(
    {
      traderId: customerId,
      traderName: customerName,
      totalAmount,
      note,
    },
    idemKey
  );

  log.info(`[坏账处理] 费用单创建成功: id=${result.id}, billStr=${result.billStr}`);

  return {
    erpMeta: {
      expenditureBillId: result.id,
      expenditureBillStr: result.billStr,
    },
    formData: {
      _expenditureBillId: result.id,
      _expenditureBillStr: result.billStr,
      expenditureBillNo: result.billStr,
    },
  };
}

// =====================================================
// 节点 3: 创建收款单核销
// =====================================================

async function handleCreateReceipt(
  instance: OaInstanceRow,
  formData: Record<string, unknown>
): Promise<CallbackResult> {
  // 幂等前置检查
  const existingReceiptId = formData._receiptBillId as number | undefined;
  if (existingReceiptId) {
    log.info(`[坏账处理] 节点3 幂等跳过: 已有收款单ID=${existingReceiptId}`);
    return {
      erpMeta: {
        receiptBillId: existingReceiptId,
        receiptBillStr: formData._receiptBillStr as string,
      },
    };
  }

  // 从 formData 读取费用单信息（通过 nodeBackfills 写入，不受 retry 清空影响）
  const expenditureBillId = formData._expenditureBillId as number;
  const expenditureBillStr = formData._expenditureBillStr as string;
  const customerId = Number(formData.customerId);
  const billDetails = resolveBillDetails(formData);

  if (!expenditureBillId || !billDetails?.length) {
    throw new Error('创建收款单失败：缺少费用单信息或应收单据');
  }

  // 构造 invoiceList：应收单（正金额）+ 费用单（负金额）
  const invoiceList: ReceiptInvoiceItem[] = [];

  // 应收单据行（正金额）
  for (const detail of billDetails) {
    const leftAmount = String(detail.leftAmount || '0');
    invoiceList.push({
      bizId: Number(detail.bizId),
      bizType: (detail.billTypeEnum as string) || 'FUNDS_SALES',
      paidAmount: leftAmount,
      leftAmount,
      discountAmount: '0',
    });
  }

  // 费用单核销行金额 = 应收单 leftAmount 合计取负
  // 注意：totalLeftAmount 通过 parseFloat 算术求和，对于典型货币金额（2位小数）精度可接受
  // 若后续发现精度问题，可改为字符串整数分计算
  const totalLeftAmount = billDetails.reduce((sum, d) => {
    return sum + (parseFloat(d.leftAmount as string) || 0);
  }, 0);
  const negativeAmount = `-${totalLeftAmount}`;

  invoiceList.push({
    bizId: expenditureBillId,
    bizType: 'CONSUMER_EXPENDITURE',
    paidAmount: negativeAmount,
    leftAmount: negativeAmount,
    discountAmount: '0',
    note: expenditureBillStr,
  });

  const idemKey = `BADDEBT-RECEIVE-${instance.id}-3`;

  log.info(`[坏账处理] 创建收款单: customer=${customerId}, invoiceList=${invoiceList.length}行, idemKey=${idemKey}`);

  const result = await createCustomerReceipt(
    {
      traderId: customerId,
      invoiceList,
      note: `${instance.instance_no}+坏账核销`,
    },
    idemKey
  );

  log.info(`[坏账处理] 收款单创建成功: id=${result.id}, paidBillStr=${result.paidBillStr}`);

  return {
    erpMeta: {
      receiptBillId: result.id,
      receiptBillStr: result.paidBillStr,
    },
    formData: {
      _receiptBillId: result.id,
      _receiptBillStr: result.paidBillStr,
      receiptBillNo: result.paidBillStr,
    },
  };
}

// =====================================================
// onRejected: 驳回回滚入口
// =====================================================

/**
 * 审批驳回回调：清理已创建的 ERP 单据
 * 回滚顺序：收款单（revoke + deApprove + cancel）-> 费用单（revoke + cleanup）
 */
export async function handleBadDebtRejected(
  _instance: OaInstanceRow,
  formData: Record<string, unknown>
): Promise<void> {
  const expenditureBillId = formData._expenditureBillId as number | undefined;
  const receiptBillId = formData._receiptBillId as number | undefined;

  if (!expenditureBillId) {
    log.info('[坏账处理] 驳回回滚: 无已创建的ERP单据，跳过');
    return;
  }

  log.info(`[坏账处理] 驳回回滚: expenditureBillId=${expenditureBillId}, receiptBillId=${receiptBillId || 'none'}`);

  await cleanupBadDebtBills(expenditureBillId, receiptBillId);
}
