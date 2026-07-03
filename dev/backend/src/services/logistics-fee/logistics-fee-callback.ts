/**
 * 物流装卸费用申请 — auto 节点回调
 * @module services/logistics-fee/logistics-fee-callback
 *
 * 职责：
 * 1. 节点3: 创建供应商费用单（save-approve-trade-expenditure）
 * 2. 节点4: 创建供应商付款单（paid/save-and-approve，核销费用单）
 * 3. 节点5: 创建费用分摊单（expenditure-allocation/save-approve）
 * 4. onRejected: 驳回时按反向顺序回滚已创建的 ERP 单据
 */
import { createLogger } from '../../utils/logger';
const log = createLogger('LogisticsFeeCallback');

import { appQuery as query } from '../../db/appPool';
import { beijingDateTime } from '../../utils/beijingTime';
import type { OaInstanceRow, CallbackResult } from '../oa/oa.types';
import {
  getErpMeta,
} from '../fixed-asset/erp-meta-utils';
import {
  createSupplierExpenseBill,
  createExpenseAllocation,
  cancelExpenseAllocation,
  buildLogisticsFeeIdemKey,
} from '../erp-client/erp-expense-allocation.service';
import {
  createPaidBill,
} from '../erp-client/erp-purchase.service';
import type { PaidBillInvoiceInput } from '../erp-client/erp-purchase.types';
import {
  getAllocatableExpenseDetails,
  getAllocatablePurchaseDetails,
} from '../erp-client/erp-purchase-settlement.service';
import { getErpDefaults, getErpConfig } from '../erp-client/erp-config';
import { FEE_SUBJECT_MAP } from '../oa/form-types/logistics-fee';

// =====================================================
// onApproved: auto 节点回调入口
// =====================================================

/**
 * auto 节点执行入口
 * 通过查询当前 processing 状态的 auto 节点 node_order 进行分发
 */
export async function handleLogisticsFeeAutoNode(
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
  log.info(`[物流费用] auto节点执行: instanceId=${instance.id}, node=${nodeOrder}(${nodeName})`);

  switch (nodeOrder) {
    case 3:
      return handleCreateExpenseBill(instance, formData);
    case 4:
      return handleCreatePaymentBill(instance, formData);
    case 5:
      return handleCreateExpenseAllocation(instance, formData);
    default:
      log.warn(`[物流费用] 未知的auto节点: nodeOrder=${nodeOrder}, nodeName=${nodeName}`);
  }
}

// =====================================================
// 节点3: 创建供应商费用单
// =====================================================

/**
 * 创建供应商费用单并审核
 * POST /saas/pro/expenditure-bill/save-approve-trade-expenditure
 *
 * 从 formData 提取费用供应商、费用类型、费用明细，
 * 创建一张关联供应商的费用单，审核通过后记录 billId/billStr。
 */
async function handleCreateExpenseBill(
  instance: OaInstanceRow,
  formData: Record<string, unknown>
): Promise<CallbackResult> {
  const { defaultSalesmanId, defaultDeptId } = getErpDefaults();

  const feeSupplierId = formData.feeSupplierId as string;
  const feeSupplierName = formData.feeSupplierName as string;
  const feeType = formData.feeType as string;
  const feeLines = (formData.feeLines as Array<Record<string, unknown>>) || [];

  if (!feeSupplierId || !feeType || feeLines.length === 0) {
    throw new Error('缺少费用供应商、费用类型或费用明细');
  }

  // 费用科目
  const subject = FEE_SUBJECT_MAP[feeType];
  if (!subject) {
    throw new Error(`未知的费用类型: ${feeType}`);
  }

  // 计算总金额
  const totalAmount = feeLines.reduce((sum, line) => {
    return sum + (parseFloat(String(line.feeAmount || 0)));
  }, 0);

  // 构造明细
  const details = feeLines.map((line, idx) => ({
    id: idx + 1,
    subjectId: subject.subjectId,
    subjectName: subject.subjectName,
    deptId: defaultDeptId,
    deptName: '',
    taxRadio: 0,
    taxAmount: '',
    noTaxAmount: String(line.feeAmount || '0'),
    paymentAmount: parseFloat(String(line.feeAmount || 0)),
  }));

  const idemKey = buildLogisticsFeeIdemKey('EXPENSE', instance.id, 3);
  const billResult = await createSupplierExpenseBill(
    {
      operatorId: '1',
      operateTime: beijingDateTime(),
      traderType: 'SUPPLIER',
      traderId: feeSupplierId,
      traderName: feeSupplierName,
      totalAmount,
      details,
      salesmanId: defaultSalesmanId,
      deptId: defaultDeptId,
      workTime: beijingDateTime(),
      note: `OA: ${instance.instance_no}`,
      brandId: '',
      imgIds: [],
    },
    idemKey,
    instance.id
  );

  log.info(`[物流费用] 供应商费用单创建成功: billStr=${billResult.billStr}`);

  return {
    erpMeta: {
      expenditureBillId: billResult.id,
      expenditureBillStr: billResult.billStr,
      expenditureTotalAmount: totalAmount,
    },
    formData: {
      _expenditureBillStr: billResult.billStr,
    },
  };
}

// =====================================================
// 节点4: 创建供应商付款单（核销费用单）
// =====================================================

/**
 * 创建供应商付款单并核销刚创建的费用单
 * POST /saas/pro/paid/save-and-approve
 *
 * writeOffInfo.invoiceList 引用费用单，bizType 为 "SUPPLIER_EXPENDITURE"。
 * 出纳填写的 paymentAmount 可能不等于费用合计（仅提示不阻断）。
 */
async function handleCreatePaymentBill(
  instance: OaInstanceRow,
  formData: Record<string, unknown>
): Promise<CallbackResult> {
  const { defaultSalesmanId, defaultDeptId } = getErpDefaults();

  const paymentAmount = formData.paymentAmount as string;
  const paymentSubjectId = formData.paymentSubjectId as number;
  const feeSupplierId = formData.feeSupplierId as string;

  if (!paymentAmount || !paymentSubjectId || !feeSupplierId) {
    throw new Error('缺少实付金额、付款账户或费用供应商');
  }

  // 从 erp_meta 获取刚创建的费用单信息
  const erpMeta = getErpMeta(instance);
  const expenditureBillId = erpMeta?.responseData?.expenditureBillId as number;
  const expenditureTotalAmount = erpMeta?.responseData?.expenditureTotalAmount as number;

  if (!expenditureBillId) {
    throw new Error('未找到已创建的供应商费用单，无法创建付款单');
  }

  // 构造核销信息：引用费用单，bizType = SUPPLIER_EXPENDITURE
  // 仅传业务数据，服务层自动处理 totalAmount/arrivalTime 等
  const invoiceList: PaidBillInvoiceInput[] = [{
    bizId: expenditureBillId,
    bizType: 'SUPPLIER_EXPENDITURE',
    leftAmount: String(expenditureTotalAmount || paymentAmount),
    originNote: `${instance.instance_no} ${formData.feeType === 'logistics_fee' ? '物流费用' : '装卸费用'}`,
  }];

  const idemKey = buildLogisticsFeeIdemKey('PAID', instance.id, 4);
  const paidResult = await createPaidBill(
    {
      traderId: feeSupplierId,
      salesmanId: defaultSalesmanId,
      deptId: defaultDeptId,
      workTime: beijingDateTime(),
      note: `OA: ${instance.instance_no}`,
      paymentDetails: [{ paymentAmount, subjectId: paymentSubjectId }],
      invoiceList,
    },
    idemKey
  );

  log.info(`[物流费用] 供应商付款单创建成功: paidBillStr=${paidResult.paidBillStr}`);

  return {
    erpMeta: {
      paidBillId: paidResult.id,
      paidBillStr: paidResult.paidBillStr,
    },
    formData: {
      _paidBillStr: paidResult.paidBillStr,
    },
  };
}

// =====================================================
// 节点5: 创建费用分摊单
// =====================================================

/**
 * 创建费用分摊单
 * POST /saas/pro/expenditure-allocation/save-approve
 *
 * 步骤：
 * 1. 查询 expenditure-allocatable-detail 获取费用单的 bizDetailId
 * 2. 从 formData._settlementLineItems 获取结算单行项的 bizDetailId
 * 3. 按商品金额比例计算 allocationAmount
 * 4. 构造精简请求体（每条 3 字段）提交
 */
async function handleCreateExpenseAllocation(
  instance: OaInstanceRow,
  formData: Record<string, unknown>
): Promise<CallbackResult> {
  const erpMeta = getErpMeta(instance);
  const expenditureBillStr = erpMeta?.responseData?.expenditureBillStr as string;
  const expenditureTotalAmount = erpMeta?.responseData?.expenditureTotalAmount as number;

  if (!expenditureBillStr || expenditureTotalAmount == null || expenditureTotalAmount <= 0) {
    throw new Error('缺少费用单号或费用总额');
  }

  // 1. 查询费用单的 bizDetailId
  const expenseDetails = await getAllocatableExpenseDetails({
    billStr: expenditureBillStr,
    traderTypes: ['SUPPLIER'],
  });

  if (expenseDetails.records.length === 0) {
    throw new Error(`未找到费用单 ${expenditureBillStr} 的可分摊明细（可能已被分摊）`);
  }

  const expenditureDetail = expenseDetails.records.map(d => ({
    allocationAmount: d.amount,
    bizDetailId: d.id,
    bizType: 'EXPENDITURE' as const,
  }));

  // 2. 从 formData 获取结算单行项的 bizDetailId + amount
  let settlementLineItems: Array<{ bizDetailId: number; amount: string }> = [];
  try {
    const rawItems = formData._settlementLineItems as string;
    if (rawItems) {
      settlementLineItems = JSON.parse(rawItems);
    }
  } catch {
    log.warn('[物流费用] 预存的结算单行项数据解析失败，将重新查询 ERP');
  }

  // 兜底：如果预存数据为空，按结算单号重新查询 ERP
  // （已失败的申请因 beforeSubmit 的 supplierIdList bug 导致预存为空）
  if (settlementLineItems.length === 0) {
    log.info('[物流费用] 预存的结算单行项为空，重新查询可分摊明细');
    try {
      const feeLines = (formData.feeLines as Array<Record<string, unknown>>) || [];
      const billStrSet = new Set<string>();
      for (const line of feeLines) {
        if (line.settlementBillStr) billStrSet.add(line.settlementBillStr as string);
      }
      for (const billStr of billStrSet) {
        const details = await getAllocatablePurchaseDetails({ billStr });
        for (const d of details.records) {
          settlementLineItems.push({ bizDetailId: d.id, amount: d.amount });
        }
      }
    } catch (err) {
      log.warn('[物流费用] 兜底重查 ERP 失败:', err instanceof Error ? err.message : err);
      // 不 throw，让下面的空检查统一处理
    }
  }

  if (settlementLineItems.length === 0) {
    throw new Error('结算单行项数据为空，无法创建费用分摊单（含兜底重查）');
  }

  // 3. 按商品金额比例计算 allocationAmount（最后一行用倒挤法保证总和精确）
  const totalSettleAmount = settlementLineItems.reduce(
    (sum, item) => sum + parseFloat(item.amount || '0'), 0
  );

  const totalAmount = expenditureTotalAmount;
  let allocatedSum = 0;
  const settleDetail = settlementLineItems.map((item, idx) => {
    const itemAmount = parseFloat(item.amount || '0');
    const ratio = totalSettleAmount > 0 ? itemAmount / totalSettleAmount : 0;

    // 最后一行用差额补齐，保证 sum(allocationAmount) === totalAmount
    if (idx === settlementLineItems.length - 1) {
      const lastAmount = (totalAmount - allocatedSum).toFixed(2);
      return { allocationAmount: lastAmount, bizDetailId: item.bizDetailId, bizType: 'PURCHASE' as const };
    }

    const allocAmount = +(totalAmount * ratio).toFixed(2);
    allocatedSum += allocAmount;
    return {
      allocationAmount: allocAmount.toFixed(2),
      bizDetailId: item.bizDetailId,
      bizType: 'PURCHASE' as const,
    };
  });

  // 4. 创建费用分摊单
  const idemKey = buildLogisticsFeeIdemKey('ALLOCATION', instance.id, 5);
  const allocResult = await createExpenseAllocation(
    {
      allocationType: 'PURCHASE',
      allocationWay: 'ALL',
      workTime: beijingDateTime(),
      note: `OA: ${instance.instance_no}`,
      totalAmount,
      expenditureDetail,
      settleDetail,
    },
    idemKey,
    instance.id
  );

  log.info(`[物流费用] 费用分摊单创建成功: id=${allocResult?.id}, billStr=${allocResult?.billStr}`);

  return {
    erpMeta: {
      allocationBillId: allocResult?.id,
      allocationBillStr: allocResult?.billStr,
    },
    formData: {
      _allocationBillStr: allocResult?.billStr,
    },
  };
}

// =====================================================
// 驳回回滚 (onRejected)
// =====================================================

/**
 * 审批驳回时回滚已创建的 ERP 单据
 * 反向顺序：取消费用分摊单 → 反审核+取消付款单 → 反审核+取消费用单
 *
 * 注意：仅当 auto 节点已执行后才需要回滚。
 * 如果在往来会计或出纳环节被驳回，此时尚未创建任何 ERP 单据，无需操作。
 */
export async function handleLogisticsFeeRejected(
  instance: OaInstanceRow,
  formData: Record<string, unknown>
): Promise<void> {
  const erpMeta = getErpMeta(instance);
  const responseData = erpMeta?.responseData;

  if (!responseData) {
    log.info(`[物流费用] 驳回时无 ERP 单据需回滚: instanceId=${instance.id}`);
    return;
  }

  const failures: string[] = [];

  // 1. 取消费用分摊单（如果已创建）
  const allocationBillId = responseData.allocationBillId as number;
  if (allocationBillId) {
    try {
      await cancelExpenseAllocation(allocationBillId);
      log.info(`[物流费用] 费用分摊单取消成功: billId=${allocationBillId}`);
    } catch (err) {
      const msg = `费用分摊单(${allocationBillId})取消失败: ${err instanceof Error ? err.message : err}`;
      log.warn(`[物流费用] ${msg}`);
      failures.push(msg);
    }
  }

  // 2. 反审核+取消付款单（复用已有的 erp-cleanup 模式）
  const paidBillId = responseData.paidBillId as number;
  if (paidBillId) {
    try {
      const { deApprovePaidBill, cancelPaidBill } = await import('../erp-client/erp-purchase.service');
      await deApprovePaidBill(paidBillId);
      await cancelPaidBill(paidBillId);
      log.info(`[物流费用] 付款单回滚成功: billId=${paidBillId}`);
    } catch (err) {
      const msg = `付款单(${paidBillId})回滚失败: ${err instanceof Error ? err.message : err}`;
      log.warn(`[物流费用] ${msg}`);
      failures.push(msg);
    }
  }

  // 3. 反审核+取消费用单
  const expenditureBillId = responseData.expenditureBillId as number;
  if (expenditureBillId) {
    try {
      const { cleanupExpenditureBill } = await import('../erp-client/erp-cleanup');
      await cleanupExpenditureBill(expenditureBillId);
      log.info(`[物流费用] 费用单回滚成功: billId=${expenditureBillId}`);
    } catch (err) {
      const msg = `费用单(${expenditureBillId})回滚失败: ${err instanceof Error ? err.message : err}`;
      log.warn(`[物流费用] ${msg}`);
      failures.push(msg);
    }
  }

  // 回滚部分失败时抛出异常，让上层重试机制介入
  if (failures.length > 0) {
    throw new Error(`物流费用驳回回滚部分失败: ${failures.join('；')}`);
  }
}
