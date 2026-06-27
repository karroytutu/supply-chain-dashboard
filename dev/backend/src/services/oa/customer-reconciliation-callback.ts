/**
 * 应收对账 — auto 节点回调
 * @module services/oa/customer-reconciliation-callback
 *
 * 职责：
 * 1. 节点2: 创建客户对账单（ERP consumer-collect/save）
 * 2. 节点3: 上传对账单 PDF（获取打印模板 → 渲染 PDF → 上传文件存储）
 * 3. 节点8: 审核客户对账单（有差异时先编辑追加，再审核）
 */

import { createLogger } from '../../utils/logger';
import { config } from '../../config';
const log = createLogger('CustomerReconciliationCallback');

import { appQuery as query } from '../../db/appPool';
import type { OaInstanceRow, CallbackResult } from './oa.types';
import {
  fetchReceivableOrders,
  createReconciliationDraft,
  approveReconciliation,
  cancelReconciliation,
  fetchPrintTemplate,
  type StatementDetailItem,
} from '../erp-client/erp-reconciliation.service';
import { renderStatementPdf } from '../print-renderer';
import { RECONCILIATION_BILL_TYPE, RECONCILIATION_SALESMAN_ID } from './form-types/customer-reconciliation';
import { getErpMeta } from '../fixed-asset/erp-meta-utils';
import fs, { promises as fsp } from 'fs';
import path from 'path';

// =====================================================
// onApproved: auto 节点回调入口
// =====================================================

/**
 * auto 节点执行入口
 * 通过查询当前 processing 状态的 auto 节点 node_order 进行分发
 */
export async function handleCustomerReconciliationAutoNode(
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
  log.info(`[应收对账] auto节点执行: instanceId=${instance.id}, node=${nodeOrder}(${nodeName})`);

  switch (nodeOrder) {
    case 2:
      return handleCreateStatement(instance, formData);
    case 3:
      return handleUploadStatementPdf(instance, formData);
    case 8:
      return handleApproveStatement(instance, formData);
    default:
      log.warn(`[应收对账] 未知的auto节点: nodeOrder=${nodeOrder}, nodeName=${nodeName}`);
  }
}

// =====================================================
// 节点2: 创建客户对账单
// =====================================================

async function handleCreateStatement(
  instance: OaInstanceRow,
  formData: Record<string, unknown>
): Promise<CallbackResult> {
  const customerId = formData.customerId as string;
  const orderIds = formData.receivableOrderIds as string[];

  if (!customerId || !orderIds?.length) {
    throw new Error('创建对账单失败：缺少客户ID或应收单据');
  }

  // 获取应收单据完整数据（含 bizId、bizType）
  log.info(`[应收对账] 查询应收单据: customerId=${customerId}, orderIds=${orderIds.length}条`);
  const allOrders = await fetchReceivableOrders({ traderId: customerId });

  // 按 id 筛选用户选中的单据
  const selectedIds = new Set(orderIds.map(String));
  const selectedOrders = allOrders.filter(o => selectedIds.has(String(o.id)));

  if (selectedOrders.length === 0) {
    throw new Error('创建对账单失败：未找到匹配的应收单据');
  }

  // 构建 detail 数组（注意：save 接口的 bizType 需要 billTypeEnum，不是 bizType）
  const detail: StatementDetailItem[] = selectedOrders.map((order, idx) => ({
    billId: order.id,
    bizId: order.bizId,
    leftAmount: order.leftAmount,
    totalAmount: order.totalAmount,
    note: order.note || null,
    bizType: order.billTypeEnum,
    seq: idx + 1,
  }));

  // 计算合计金额
  const totalAmount = detail.reduce((sum, d) => sum + (parseFloat(d.leftAmount) || 0), 0);

  // 获取 salesmanId（固定值 97）
  const salesmanId = RECONCILIATION_SALESMAN_ID;

  // 校验 customerId 有效性
  const parsedSettlerId = parseInt(customerId, 10);
  if (isNaN(parsedSettlerId)) {
    throw new Error(`无效的 customerId: ${customerId}，无法创建对账单`);
  }

  // 调用 ERP 创建对账单
  const result = await createReconciliationDraft({
    settlerId: parsedSettlerId,
    salesmanId,
    detail,
    totalAmount: Math.round(totalAmount * 100) / 100,
    note: `OA对账 ${instance.instance_no}`,
  });

  log.info(`[应收对账] 对账单创建成功: id=${result.id}, no=${result.consumerCollectStr}, state=${result.state}`);

  return {
    erpMeta: {
      erpStatementId: result.id,
      erpStatementState: result.state,
      consumerCollectStr: result.consumerCollectStr,
    },
    formData: {
      _erpStatementId: String(result.id),
      _erpStatementDetail: JSON.stringify(detail),
      _erpStatementNo: result.consumerCollectStr || '',
      erpStatementNo: result.consumerCollectStr || '',
    },
  };
}

// =====================================================
// 节点3: 上传对账单 PDF
// =====================================================

async function handleUploadStatementPdf(
  instance: OaInstanceRow,
  formData: Record<string, unknown>
): Promise<CallbackResult> {
  const erpMeta = getErpMeta(instance);
  const erpStatementId = erpMeta?.responseData?.erpStatementId as number;

  if (!erpStatementId) {
    throw new Error('上传PDF失败：未找到对账单ID（节点2可能未成功执行）');
  }

  // 获取打印 HTML 模板
  log.info(`[应收对账] 获取打印模板: statementId=${erpStatementId}`);
  const htmlContent = await fetchPrintTemplate(erpStatementId, RECONCILIATION_BILL_TYPE);

  // 提取 body 内容
  const bodyMatch = htmlContent.match(/<body>([\s\S]*)<\/body>/i);
  const bodyContent = bodyMatch ? bodyMatch[1] : htmlContent;

  // 调用 PDF 渲染服务
  log.info(`[应收对账] 开始渲染PDF: HTML长度=${bodyContent.length}`);
  const pdfBuffer = await renderStatementPdf({ bodyContent });

  // 保存 PDF 到本地 uploads 目录（__dirname = src/services/oa，需回退 3 层到 backend 根目录）
  const uploadsDir = path.join(__dirname, '..', '..', '..', 'uploads', 'oa-statement');
  if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });
  const fileName = `statement_${instance.instance_no}_${Date.now()}.pdf`;
  const filePath = path.join(uploadsDir, fileName);
  await fsp.writeFile(filePath, pdfBuffer);

  // 生成可访问的 URL（通过静态文件服务）
  const baseUrl = config.app.baseUrl;
  const pdfUrl = `${baseUrl}/uploads/oa-statement/${fileName}`;

  log.info(`[应收对账] PDF保存成功: path=${filePath}, url=${pdfUrl}, size=${pdfBuffer.length}`);

  // 从 erpMeta 取对账单号用于文件名（节点2已回填）
  const statementNo = (erpMeta?.responseData?.consumerCollectStr as string) || instance.instance_no;

  return {
    erpMeta: { pdfUrl },
    formData: {
      _statementPdfUrl: pdfUrl,
      erpStatementPdf: [{ name: `对账单_${statementNo}.pdf`, url: pdfUrl }],
    },
  };
}

// =====================================================
// 节点8: 审核客户对账单
// =====================================================

async function handleApproveStatement(
  instance: OaInstanceRow,
  formData: Record<string, unknown>
): Promise<CallbackResult> {
  const erpMeta = getErpMeta(instance);
  const erpStatementId = erpMeta?.responseData?.erpStatementId as number;

  if (!erpStatementId) {
    throw new Error('审核对账单失败：未找到对账单ID');
  }

  const differenceStatus = formData.differenceStatus as string;
  const reconciliationResult = formData.reconciliationResult as string;
  const unreconciledIds = formData.unreconciledOrderIds as string[];
  const hasUnreconciled = Array.isArray(unreconciledIds) && unreconciledIds.length > 0;
  const hasDifference = differenceStatus === 'has_difference';

  // 未对账：取消对账单
  if (reconciliationResult === 'not_reconciled') {
    log.info(`[应收对账] 未对账，取消对账单: statementId=${erpStatementId}`);
    await cancelReconciliation(erpStatementId);
    return {
      erpMeta: {
        statementApproved: false,
        cancelledAt: new Date().toISOString(),
        consumerCollectStr: (erpMeta?.responseData?.consumerCollectStr as string) || null,
      },
    };
  }

  // 如果没有需要编辑的操作，直接审核
  if (!hasUnreconciled && !hasDifference) {
    log.info(`[应收对账] 无差异且全额对账，直接审核: statementId=${erpStatementId}`);
    const result = await approveReconciliation(erpStatementId);
    log.info(`[应收对账] 对账单审核成功: id=${result.id}, 编号=${result.consumerCollectStr}`);
    return {
      erpMeta: {
        statementApproved: true,
        approvedAt: new Date().toISOString(),
        consumerCollectStr: result.consumerCollectStr,
      },
    };
  }

  // 解析原始明细
  const originalDetailJson = formData._erpStatementDetail as string;
  let currentDetail: StatementDetailItem[] = [];
  if (originalDetailJson) {
    try {
      currentDetail = JSON.parse(originalDetailJson);
    } catch {
      log.warn('[应收对账] 解析原始明细JSON失败');
    }
  }

  // 步骤1：剔除未对账单据（部分对账场景）
  if (hasUnreconciled) {
    const unreconciledSet = new Set(unreconciledIds.map(String));
    const beforeCount = currentDetail.length;
    currentDetail = currentDetail.filter(d => !unreconciledSet.has(String(d.billId)));
    log.info(`[应收对账] 剔除未对账单据: ${beforeCount - currentDetail.length}条 (statementId=${erpStatementId})`);
  }

  // 步骤2：追加差异处理单据（有差异场景）
  if (hasDifference) {
    const customerId = formData.customerId as string;
    const differenceOrderIds = formData.differenceOrderIds as string[];

    if (!differenceOrderIds?.length) {
      throw new Error('审核失败：存在差异但未选择差异处理单据');
    }

    const allOrders = await fetchReceivableOrders({ traderId: customerId });
    const diffIds = new Set(differenceOrderIds.map(String));
    const diffOrders = allOrders.filter(o => diffIds.has(String(o.id)));

    const baseSeq = currentDetail.length;
    currentDetail = [
      ...currentDetail,
      ...diffOrders.map((order, idx) => ({
        billId: order.id,
        bizId: order.bizId,
        leftAmount: order.leftAmount,
        totalAmount: order.totalAmount,
        note: order.note || null,
        bizType: order.billTypeEnum,
        seq: baseSeq + idx + 1,
      })),
    ];
    log.info(`[应收对账] 追加差异处理单据: ${diffOrders.length}条`);
  }

  // 步骤3：编辑对账单
  if (currentDetail.length === 0) {
    throw new Error('审核失败：对账单明细为空（所有单据均被剔除）');
  }

  const totalAmount = currentDetail.reduce(
    (sum, d) => sum + (parseFloat(d.leftAmount) || 0), 0
  );
  const customerId = formData.customerId as string;

  const parsedApproveSettlerId = parseInt(customerId, 10);
  if (isNaN(parsedApproveSettlerId)) {
    throw new Error(`无效的 customerId: ${customerId}，无法审核对账单`);
  }

  await createReconciliationDraft({
    id: erpStatementId,
    settlerId: parsedApproveSettlerId,
    salesmanId: RECONCILIATION_SALESMAN_ID,
    detail: currentDetail,
    totalAmount: Math.round(totalAmount * 100) / 100,
    note: `OA对账 ${instance.instance_no}${hasDifference ? '（含差异处理）' : ''}`,
  });
  log.info(`[应收对账] 对账单编辑完成，当前${currentDetail.length}条明细`);

  // 步骤4：审核对账单
  const result = await approveReconciliation(erpStatementId);
  log.info(`[应收对账] 对账单审核成功: id=${result.id}, 编号=${result.consumerCollectStr}`);

  return {
    erpMeta: {
      statementApproved: true,
      approvedAt: new Date().toISOString(),
      consumerCollectStr: result.consumerCollectStr,
    },
  };
}
