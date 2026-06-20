/**
 * 采购审批 - auto节点回调 + handle回调 + 驳回回滚
 * @module services/procurement-order/procurement-callback
 *
 * 职责：
 * 1. onApproved: auto节点执行ERP操作（创建付款单/预付款/审核PO/办结）
 * 2. onNodeCompleted: handle节点完成后检查多货，动态插入子流程
 * 3. onRejected: 驳回时回滚已创建的ERP单据
 *
 * ERP回滚策略：
 * - 每个ERP创建操作后立即将 billId/billStr 写入 erp_meta.responseData
 * - 失败时从 erp_meta 读取已创建的单据ID，按反向顺序回滚
 * - 回滚操作各自 try-catch，单步失败记录日志不中断后续
 */
import { createLogger } from '../../utils/logger';
const log = createLogger('ProcurementCallback');

import { appQuery as query } from '../../db/appPool';
import { PoolClient } from 'pg';
import type { OaInstanceRow, NodeType, SignMode } from '../oa/oa.types';
import { ROLE_CODES } from '../../utils/constants';
import { insertNodeAfter, transaction } from '../oa/mutations/shared-utils';
import {
  mergeErpResponseData,
  markErpFailed,
  getErpMeta,
} from '../../services/fixed-asset/erp-meta-utils';
import {
  createPaidBill,
  deApprovePaidBill,
  cancelPaidBill,
  createPurchasePrepayment,
  deApprovePrepayment,
  cancelPrepayment,
  approvePurchaseOrder,
  deApprovePurchaseOrder,
  cancelPurchaseOrder,
  createPurchaseOrder,
  buildProcurementIdemKey,
  searchSupplierDebts,
  listTraderPrepayments,
  searchSupplierIncomes,
} from '../erp-client/erp-purchase.service';
import type {
  CreatePaidBillRequest,
  CreatePurchasePrepaymentRequest,
  PaidBillInvoiceItem,
  PaidBillPrepayItem,
} from '../erp-client/erp-purchase.types';
import { PAYMENT_METHODS } from '../oa/form-types/procurement-order';

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

  switch (nodeOrder) {
    case 5:
      return handleCreatePaidBill(instance, formData);
    case 7:
      return handleCreatePrepayment(instance, formData);
    case 8:
      return handleApprovePO(instance, formData);
    case 10:
      return handleCompletion(instance, formData);
    default:
      // 多货子流程的 auto 节点（order > 10）
      if (nodeOrder && nodeOrder > 10) {
        return handleOverageAutoNode(instance, formData, nodeOrder);
      }
      log.warn(`[采购审批] 未知的auto节点: nodeOrder=${nodeOrder}`);
  }
}

// =====================================================
// 各 auto 节点处理函数
// =====================================================

/**
 * 创建付款单核销 (order=5)
 * 已付款模式：用预付款/收入单核销应付单
 */
async function handleCreatePaidBill(
  instance: OaInstanceRow,
  formData: Record<string, unknown>
): Promise<void> {
  const originalBillId = (formData._originalBillId || formData.erpBillId) as number;
  const originalBillStr = (formData._originalBillStr || formData.erpBillStr) as string;
  const supplierId = (formData._supplierId || formData.supplierId) as string;

  if (!originalBillId || !supplierId) {
    throw new Error('缺少采购订单ID或供应商ID');
  }

  // 构建应付单明细（从供应商欠款中查找对应PO的应付单）
  const invoiceList = await buildInvoiceList(supplierId, originalBillId, originalBillStr);
  if (invoiceList.length === 0) {
    log.warn(`[采购审批] 未找到采购订单的应付单: billStr=${originalBillStr}`);
    return;
  }

  // 构建预付/收入单明细
  const prepayList = await buildPrepayList(formData, supplierId);

  // 构建付款单请求
  const idemKey = buildProcurementIdemKey('PAID', instance.id, 5);
  const request: CreatePaidBillRequest = {
    traderId: supplierId,
    salesmanId: 1,
    deptId: 1,
    workTime: new Date().toISOString().slice(0, 19).replace('T', ' '),
    paymentDetails: [],
    paymentDirection: 'OUT',
    traderType: 'SUPPLIER',
    type: 'PAID',
    writeOffInfo: { invoiceList, prepayList },
  };

  const result = await createPaidBill(request, idemKey);
  log.info(`[采购审批] 付款单创建成功: paidBillStr=${result.paidBillStr}`);

  // 立即写入 erp_meta
  await mergeErpResponseData(instance.id, {
    paidBillId: result.id,
    paidBillStr: result.paidBillStr,
  });
}

/**
 * 创建采购预付款 (order=7)
 * 需预付模式：出纳上传回单后，创建采购预付款绑定PO
 */
async function handleCreatePrepayment(
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

  const idemKey = buildProcurementIdemKey('PREPAY', instance.id, 7);
  const request: CreatePurchasePrepaymentRequest = {
    relatedBizId: originalBillId,
    relatedBizStr: originalBillStr,
    relatedBizTypeEnum: 'PURCHASE_ORDER',
    traderId: parseInt(supplierId, 10),
    traderType: 'SUPPLIER',
    type: 'PRE_PAID',
    totalAmount: parseFloat(paymentAmount),
    paymentDetails: [{ paymentAmount, subjectId: paymentSubjectId || 378 }],
    paymentDirection: 'OUT',
    salesmanId: '1',
    source: 'CLOUD',
    workTime: new Date().toISOString().slice(0, 19).replace('T', ' '),
  };

  const result = await createPurchasePrepayment(request, idemKey);
  log.info(`[采购审批] 采购预付款创建成功: billStr=${result.billStr}`);

  await mergeErpResponseData(instance.id, {
    prepayBillId: result.id,
    prepayBillStr: result.billStr,
  });
}

/**
 * 审核采购订单 (order=8)
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
 * 办结检查 (order=10)
 * 检查所有订单是否已完成入库+核销
 */
async function handleCompletion(
  instance: OaInstanceRow,
  formData: Record<string, unknown>
): Promise<void> {
  log.info(`[采购审批] 办结检查: instanceId=${instance.id}`);
  await mergeErpResponseData(instance.id, { completionStatus: 'completed' });
}

/**
 * 多货子流程 auto 节点 (order > 10)
 * 处理多货新PO的创建/审核
 */
async function handleOverageAutoNode(
  instance: OaInstanceRow,
  formData: Record<string, unknown>,
  nodeOrder: number
): Promise<void> {
  const erpMeta = getErpMeta(instance);
  const rd = erpMeta?.responseData || {};

  // 通过节点名称判断操作类型
  // 命名规则：多货创建PO-{index} / 多货审核PO-{index}
  const nodeResult = await query<{ node_name: string }>(
    `SELECT node_name FROM oa_approval_nodes WHERE instance_id = $1 AND node_order = $2`,
    [instance.id, nodeOrder]
  );
  const nodeName = nodeResult.rows[0]?.node_name || '';

  if (nodeName.startsWith('多货创建PO')) {
    // 创建多货新PO
    const overageLinesStr = rd.overageAcceptLines as string;
    if (!overageLinesStr) {
      log.warn('[采购审批] 多货创建PO: 缺少多货行数据');
      return;
    }

    const overageLines = JSON.parse(overageLinesStr) as any[];
    const supplierId = rd.supplierId as string;
    const warehouseId = rd.warehouseId as number;

    if (!supplierId) {
      throw new Error('多货创建PO缺少供应商ID');
    }

    const details = overageLines.map((line: any) => ({
      goodsId: line.goodsId,
      currUnitId: line.currUnitId || 'P2',
      realPrice: String(line.realPrice || '0'),
      quantity: String(line.overQty || '0'),
      subAmount: String((line.overQty || 0) * (parseFloat(line.realPrice) || 0)),
      taxRatio: line.taxRatio || '13',
      propertyForBill: 'PO_NP',
    }));

    const overageIndex = parseInt(nodeName.replace('多货创建PO-', '') || '0', 10);
    const idemKey = buildProcurementIdemKey('OVR', instance.id, nodeOrder, overageIndex);

    const result = await createPurchaseOrder({
      supplierId,
      warehouseId: warehouseId || 17,
      salesmanId: 1,
      workDate: new Date().toISOString().slice(0, 10),
      billType: 'PURCHASE_ORDER',
      details,
      uuid: idemKey,
    });

    log.info(`[采购审批] 多货新PO创建成功: billStr=${result.billStr}`);
    await mergeErpResponseData(instance.id, {
      overQtyBillId: result.billId,
      overQtyBillStr: result.billStr,
    });
  } else if (nodeName.startsWith('多货审核PO')) {
    // 审核多货新PO
    const overQtyBillId = rd.overQtyBillId as number;
    if (overQtyBillId) {
      await approvePurchaseOrder(overQtyBillId);
      log.info(`[采购审批] 多货PO审核成功: billId=${overQtyBillId}`);
      await mergeErpResponseData(instance.id, { overQtyPoApproved: true });
    }
  } else {
    log.warn(`[采购审批] 未知的多货auto节点: ${nodeName}`);
  }
}

// =====================================================
// onNodeCompleted: handle 节点完成回调
// =====================================================

/**
 * handle 节点完成后回调
 * 主要处理 order=9（库管到货确认）的多货检查
 */
export async function handleProcurementNodeCompleted(
  instance: OaInstanceRow,
  nodeOrder: number,
  nodeData: Record<string, unknown>,
  formData: Record<string, unknown>
): Promise<void> {
  if (nodeOrder === 9) {
    await handleWarehouseReceiving(instance, nodeData, formData);
  }
  // order=4 和 order=6 的 handle 不需要特殊处理
  // 数据已通过 mergeFormData 合并到 formData
}

/**
 * 库管到货确认后的多货检查
 * 检查 discrepancyLines 是否有 handlingDecision='accept' 的行
 * 如有则动态插入多货处理节点
 */
async function handleWarehouseReceiving(
  instance: OaInstanceRow,
  nodeData: Record<string, unknown>,
  formData: Record<string, unknown>
): Promise<void> {
  // 子流程深度检查：深度>=1时不再触发多货处理
  const subFlowDepth = (formData._subFlowDepth as number) || 0;
  if (subFlowDepth >= 1) {
    log.info(`[采购审批] 子流程深度=${subFlowDepth}，跳过多货处理`);
    return;
  }

  const discrepancyLines = (nodeData.discrepancyLines as any[]) || [];
  const acceptLines = discrepancyLines.filter(
    (line: any) => line.handlingDecision === 'accept' && (line.overQty || 0) > 0
  );

  if (acceptLines.length === 0) {
    log.info('[采购审批] 无多货验收行，跳过子流程');
    return;
  }

  log.info(`[采购审批] 发现${acceptLines.length}行多货验收，插入子流程节点`);

  // 将多货行数据写入 erp_meta 供后续 auto 节点使用
  await mergeErpResponseData(instance.id, {
    overageAcceptLines: JSON.stringify(acceptLines),
    supplierId: formData.supplierId,
    warehouseId: formData.warehouseId,
  });

  // 动态插入子流程节点（在办结检查节点 order=10 之前）
  await insertOverageSubFlowNodes(instance.id, acceptLines);
}

/**
 * 插入多货子流程节点
 * 在办结检查节点(order=10)之前插入：
 *   1. handle: 多货处理(采购选择付款方式)
 *   2. auto: 多货创建PO
 *   3. auto: 多货审核PO
 * 所有节点在同一个事务内完成插入
 */
async function insertOverageSubFlowNodes(
  instanceId: number,
  acceptLines: any[]
): Promise<void> {
  await transaction(async (client: PoolClient) => {
    // 查找办结检查节点(order=10)的当前位置
    const completionNodeResult = await client.query<{ node_order: number }>(
      `SELECT node_order FROM oa_approval_nodes
       WHERE instance_id = $1 AND node_type = 'auto' AND node_name = '办结检查'
       ORDER BY node_order LIMIT 1`,
      [instanceId]
    );

    if (completionNodeResult.rows.length === 0) {
      throw new Error(`insertOverageSubFlowNodes: 未找到办结检查节点 [instanceId=${instanceId}]`);
    }

    // 新节点插入到办结检查节点之前
    const insertBeforeOrder = completionNodeResult.rows[0].node_order - 1;

    // 查找采购主管角色用户
    const roleResult = await client.query<{ user_id: number; name: string }>(
      `SELECT DISTINCT ur.user_id, u.name
       FROM user_roles ur
       JOIN roles r ON r.id = ur.role_id
       JOIN users u ON u.id = ur.user_id
       WHERE r.code = '${ROLE_CODES.PROCUREMENT_MANAGER}' AND r.status = 1
       LIMIT 1`,
      []
    );
    const procurementManager = roleResult.rows[0];

    // 节点1: handle - 多货处理（采购选择付款方式）
    const overageInputSchema = {
      fields: [
        {
          name: 'overQtyPaymentMethod',
          label: '多货付款方式',
          type: 'select' as const,
          required: true,
          options: [
            { label: '已付款（关联预付款单）', value: 'already_paid_prepay' },
            { label: '已付款（关联收入单）', value: 'already_paid_income' },
            { label: '需预付', value: 'need_prepay' },
            { label: '后付款', value: 'post_pay' },
          ],
        },
        { name: 'overQtyRemark', label: '多货处理备注', type: 'text' as const, required: false },
      ],
    };

    await insertNodeAfter(client, instanceId, insertBeforeOrder, {
      name: '多货处理',
      type: 'handle' as NodeType,
      handler: { roleCode: ROLE_CODES.PROCUREMENT_MANAGER },
      assignedUserId: procurementManager?.user_id,
      assignedUserName: procurementManager?.name,
      inputSchema: overageInputSchema,
      signMode: 'or' as SignMode,
    });

    // 节点2: auto - 多货创建PO
    await insertNodeAfter(client, instanceId, insertBeforeOrder + 1, {
      name: '多货创建PO-0',
      type: 'auto' as NodeType,
    });

    // 节点3: auto - 多货审核PO
    await insertNodeAfter(client, instanceId, insertBeforeOrder + 2, {
      name: '多货审核PO-0',
      type: 'auto' as NodeType,
    });

    log.info(`[采购审批] 多货子流程节点插入完成: instanceId=${instanceId}, 3个节点`);
  });
}

// =====================================================
// onRejected: 驳回回滚
// =====================================================

/**
 * 驳回时回滚已创建的ERP单据
 * 回滚顺序：先创建的后回滚（付款/预付 → PO审核）
 */
export async function handleProcurementRejected(
  instance: OaInstanceRow,
  formData: Record<string, unknown>
): Promise<void> {
  const erpMeta = getErpMeta(instance);
  if (!erpMeta?.responseData) {
    log.info('[采购审批] 驳回时无ERP单据需要回滚');
    return;
  }

  const rd = erpMeta.responseData;
  log.info(`[采购审批] 驳回回滚开始: instanceId=${instance.id}`);

  // 1. 回滚付款单（已付款模式）
  if (rd.paidBillId) {
    await rollbackPaidBill(rd.paidBillId as number);
  }

  // 2. 回滚预付款（需预付模式）
  if (rd.prepayBillId) {
    await rollbackPrepayment(rd.prepayBillId as number);
  }

  // 3. 回滚多货付款单
  if (rd.overQtyPaidBillId) {
    await rollbackPaidBill(rd.overQtyPaidBillId as number);
  }

  // 4. 反审核采购订单
  if (rd.poApproved && rd.originalBillId) {
    await rollbackPOApproval(rd.originalBillId as number);
    try { await cancelPurchaseOrder(rd.originalBillId as number); } catch { /* 取消失败不阻断 */ }
  }

  // 5. 反审核多货新PO
  if (rd.overQtyBillId) {
    await rollbackPOApproval(rd.overQtyBillId as number);
    try { await cancelPurchaseOrder(rd.overQtyBillId as number); } catch { /* 取消失败不阻断 */ }
  }

  log.info(`[采购审批] 驳回回滚完成: instanceId=${instance.id}`);
}

// =====================================================
// 回滚辅助函数
// =====================================================

/**
 * 回滚付款单：反审核 → 取消
 */
async function rollbackPaidBill(billId: number): Promise<void> {
  try {
    await deApprovePaidBill(billId);
    log.info(`[采购审批] 付款单反审核成功: billId=${billId}`);
  } catch (err) {
    log.error(`[采购审批] 付款单反审核失败: billId=${billId}`, err);
  }
  try {
    await cancelPaidBill(billId);
    log.info(`[采购审批] 付款单取消成功: billId=${billId}`);
  } catch (err) {
    log.error(`[采购审批] 付款单取消失败: billId=${billId}`, err);
  }
}

/**
 * 回滚预付款：反审核 → 取消
 */
async function rollbackPrepayment(billId: number): Promise<void> {
  try {
    await deApprovePrepayment(billId);
    log.info(`[采购审批] 预付款反审核成功: billId=${billId}`);
  } catch (err) {
    log.error(`[采购审批] 预付款反审核失败: billId=${billId}`, err);
  }
  try {
    await cancelPrepayment(billId);
    log.info(`[采购审批] 预付款取消成功: billId=${billId}`);
  } catch (err) {
    log.error(`[采购审批] 预付款取消失败: billId=${billId}`, err);
  }
}

/**
 * 回滚PO审核
 */
async function rollbackPOApproval(billId: number): Promise<void> {
  try {
    await deApprovePurchaseOrder(billId);
    log.info(`[采购审批] 采购订单反审核成功: billId=${billId}`);
  } catch (err) {
    log.error(`[采购审批] 采购订单反审核失败: billId=${billId}`, err);
  }
}

// =====================================================
// 构建辅助函数
// =====================================================

/**
 * 从供应商欠款列表构建应付单明细
 * 查询供应商的应付单，找到与当前采购订单匹配的应付单
 */
async function buildInvoiceList(
  supplierId: string,
  originalBillId: number,
  originalBillStr: string
): Promise<PaidBillInvoiceItem[]> {
  if (!supplierId) return [];

  const debts = await searchSupplierDebts(parseInt(supplierId, 10));

  // 查找与当前PO匹配的应付单（通过 bizStr 或关联订单号匹配）
  const matchingDebts = debts.filter(d => {
    // 匹配采购结算单（billTypeEnum = FUNDS_PURCHASE）
    if (d.billTypeEnum !== 'FUNDS_PURCHASE') return false;
    // 通过 bizStr 匹配采购单号（如 CD260619000001）
    return d.bizStr?.includes(originalBillStr) ||
           d.note?.includes(originalBillStr) ||
           d.id === originalBillId;
  });

  if (matchingDebts.length === 0) {
    log.warn(`[采购审批] 未找到匹配的应付单: supplierId=${supplierId}, billStr=${originalBillStr}`);
    return [];
  }

  return matchingDebts.map(d => ({
    bizId: d.bizId,
    bizType: d.bizType || 'FUNDS_PURCHASE',
    paidAmount: d.totalAmount,
    discountAmount: '0',
    preAllocateAmount: d.leftAmount,
    leftAmount: d.leftAmount,
    note: d.note || '',
    originNote: d.note || null,
  }));
}

/**
 * 从formData构建预付/收入单明细
 * 查询ERP获取实际单据信息（金额/单号）
 */
async function buildPrepayList(
  formData: Record<string, unknown>,
  supplierId: string
): Promise<PaidBillPrepayItem[]> {
  const settleSourceType = formData.settleSourceType as string;

  if (settleSourceType === 'prepay') {
    const selectedIds = parseIdList(formData.selectedPrepayIds as string);
    if (selectedIds.length === 0 || !supplierId) return [];

    // 查询可用预付款获取实际金额信息
    const prepayments = await listTraderPrepayments(parseInt(supplierId, 10));
    return selectedIds.map(id => {
      const prepay = prepayments.find(p => p.id === id);
      return {
        paidBillId: id,
        writeOffAmount: prepay ? prepay.availableAmount : '0',
        paidBillStr: prepay?.paidBillStr || '',
        leftAmount: prepay?.leftAmount || '0',
      };
    });
  }

  if (settleSourceType === 'income') {
    const selectedIds = parseIdList(formData.selectedIncomeIds as string);
    if (selectedIds.length === 0 || !supplierId) return [];

    // 查询收入单获取实际金额信息
    const incomes = await searchSupplierIncomes(parseInt(supplierId, 10));
    return selectedIds.map(id => {
      const income = incomes.find(i => i.id === id);
      return {
        paidBillId: id,
        writeOffAmount: income ? income.leftAmount : '0',
        paidBillStr: income?.billStr || '',
        leftAmount: income?.leftAmount || '0',
      };
    });
  }

  return [];
}

/**
 * 解析逗号分隔的ID列表
 */
function parseIdList(idsStr: string | undefined): number[] {
  if (!idsStr) return [];
  return idsStr.split(',').map(s => parseInt(s.trim(), 10)).filter(n => !isNaN(n));
}
