/**
 * ERP 客户对账单服务
 * 封装对账单创建、审核、应收单据查询、打印模板获取
 * @module services/erp-client/erp-reconciliation
 */

import { createLogger } from '../../utils/logger';
const log = createLogger('ERP-Reconciliation');

import { erpGet, erpPost, extractErpData } from './erp-client';
import { beijingDateTime } from '../../utils/beijingTime';
import { getErpDefaults } from './erp-config';
import { getErpAccessToken } from './erp-auth';
import { getTokenRecord } from '../token-manager/token-repository';
import axios from 'axios';

// =====================================================
// 类型定义
// =====================================================

/** 应收单据（扩展版，包含对账单 save 接口需要的 bizId 和 billTypeEnum） */
export interface ReceivableOrder {
  /** 欠款记录ID → save 接口的 billId */
  id: number;
  /** 业务ID → save 接口的 bizId */
  bizId: number;
  /** 业务类型（内部枚举：SALES/RETURNED），不用于 save 接口 */
  bizType: string;
  /** 单据类型枚举（FUNDS_SALES/FUNDS_SALES_BACK）→ save 接口的 bizType */
  billTypeEnum: string;
  bizStr?: string;
  bizOrderStr?: string;
  totalAmount: string;
  leftAmount: string;
  billTypeName: string;
  workTime: string;
  salesmanId?: number;
  note?: string;
}

/** 对账单明细项（save 接口的 detail 数组元素） */
export interface StatementDetailItem {
  billId: number;
  bizId: number;
  leftAmount: string;
  totalAmount: string;
  note: string | null;
  bizType: string;
  seq: number;
}

/** 对账单保存请求参数 */
interface SaveStatementParams {
  /** 编辑模式时传入对账单ID */
  id?: number;
  /** 客户ID（settlerId） */
  settlerId: number;
  /** 业务员ID */
  salesmanId: number;
  /** 明细项数组 */
  detail: StatementDetailItem[];
  /** 合计金额 */
  totalAmount: number;
  /** 备注 */
  note?: string;
}

/** 对账单保存响应 */
interface SaveStatementResponse {
  id: number;
  consumerCollectStr: string | null;
  operateTime: string;
  workTime: string;
  state: string;
}

/** 对账单审核响应 */
interface ApproveStatementResponse {
  id: number;
  consumerCollectStr: string | null;
  operateTime: string;
  workTime: string;
  state: string;
}

/** 对账单取消响应 */
interface CancelStatementResponse {
  id?: number;
}

// =====================================================
// 应收单据查询
// =====================================================

/**
 * 按客户ID和日期范围查询应收单据
 *
 * @param traderId - 客户ID
 * @param startDate - 开始日期（YYYY-MM-DD），可选
 * @param endDate - 结束日期（YYYY-MM-DD），可选
 * @returns 未纳入对账单的应收单据列表
 */
export async function fetchReceivableOrders(params: {
  traderId: number | string;
  startDate?: string;
  endDate?: string;
}): Promise<ReceivableOrder[]> {
  const { cid, uid } = getErpDefaults();

  const queryParams: Record<string, any> = {
    size: 100,
    total: 0,
    current: 1,
    traderId: params.traderId,
    traderType: 'STORE',
    writeOffQueryStates: 'INIT,PART',
    consumerCollectTypes: 'NORMAL',
    queryDebt: false,
    cid,
    uid,
  };

  if (params.startDate) queryParams.startDate = params.startDate;
  if (params.endDate) queryParams.endDate = params.endDate;

  // 分页拉取全部数据（安全上限 100 页 = 最多 10000 条）
  const MAX_PAGES = 100;
  const allRecords: ReceivableOrder[] = [];
  let current = 1;

  while (current <= MAX_PAGES) {
    queryParams.current = current;
    const response = await erpGet<unknown>(
      '/invoice/list-debt-list',
      queryParams,
      { pathPrefix: '/saas/pro/', businessType: 'receivable_orders' }
    );

    const data = extractErpData<{ records?: ReceivableOrder[]; total?: number }>(response);
    const records = data?.records ?? [];
    allRecords.push(...records);

    if (records.length < 100) break;
    current++;
  }

  return allRecords;
}

// =====================================================
// 对账单创建/编辑
// =====================================================

/**
 * 创建或编辑客户对账单草稿
 *
 * 创建时不传 id，编辑时传入已有对账单的 id。
 * 编辑模式下 detail 应包含原有明细 + 追加的差异处理单据。
 *
 * @returns 对账单ID和状态
 */
export async function createReconciliationDraft(
  params: SaveStatementParams
): Promise<SaveStatementResponse> {
  const { cid, uid } = getErpDefaults();

  const body: Record<string, any> = {
    traderType: 'STORE',
    salesmanId: params.salesmanId,
    settlerId: params.settlerId,
    workTime: beijingDateTime(),
    note: params.note || '',
    detail: params.detail,
    totalAmount: params.totalAmount,
    imgIds: [],
    cid,
    uid,
  };

  if (params.id) {
    body.id = params.id;
  }

  const response = await erpPost<unknown>(
    '/consumer-collect/save',
    body,
    { pathPrefix: '/saas/pro/', businessType: 'reconciliation_save' }
  );

  const data = extractErpData<SaveStatementResponse>(response);
  if (!data?.id) {
    throw new Error('创建对账单失败：未返回对账单ID');
  }

  log.info(`对账单${params.id ? '编辑' : '创建'}成功: id=${data.id}, state=${data.state}`);
  return data;
}

// =====================================================
// 对账单审核
// =====================================================

/**
 * 审核客户对账单
 *
 * @param statementId - 对账单ID
 */
export async function approveReconciliation(
  statementId: number
): Promise<ApproveStatementResponse> {
  const { cid, uid } = getErpDefaults();

  const response = await erpPost<unknown>(
    '/consumer-collect/direct-approve',
    { id: statementId, cid, uid },
    { pathPrefix: '/saas/pro/', businessType: 'reconciliation_approve' }
  );

  const data = extractErpData<ApproveStatementResponse>(response);
  if (!data?.id) {
    throw new Error(`审核对账单失败: statementId=${statementId}`);
  }

  log.info(`对账单审核成功: id=${data.id}, state=${data.state}, 编号=${data.consumerCollectStr}`);
  return data;
}

// =====================================================
// 对账单取消
// =====================================================

/**
 * 取消客户对账单
 *
 * 用于对账结果为"未对账"时，取消已在 ERP 创建的对账单草稿。
 *
 * @param statementId - 对账单ID
 */
export async function cancelReconciliation(
  statementId: number
): Promise<CancelStatementResponse> {
  const { cid, uid } = getErpDefaults();

  const response = await erpPost<unknown>(
    '/consumer-collect/cancel',
    { id: statementId, cid, uid },
    { pathPrefix: '/saas/pro/', businessType: 'reconciliation_cancel' }
  );

  const data = extractErpData<CancelStatementResponse>(response);
  log.info(`对账单取消成功: statementId=${statementId}`);
  return data || {};
}

// =====================================================
// 打印模板获取（Cookie 认证）
// =====================================================

/**
 * 获取对账单的打印 HTML 模板
 *
 * 此接口使用 Cookie 认证（authorization + SESSION），
 * 而非其他接口使用的 Bearer Token。
 *
 * @param billId - 对账单ID
 * @param billType - 单据类型（客户对账单固定为 53）
 * @returns HTML 模板字符串
 */
export async function fetchPrintTemplate(
  billId: number,
  billType: number = 53
): Promise<string> {
  const token = await getErpAccessToken();
  const record = await getTokenRecord('erp');
  const sessionId = record?.token_secondary;

  if (!sessionId) {
    throw new Error('ERP SESSION 不可用，请通过管理后台重新执行 ERP 登录');
  }

  const url = 'https://portal.zhoupudata.com/saas/erp/other/printtemplate/print';
  const params = new URLSearchParams({
    billId: String(billId),
    billType: String(billType),
  });

  const response = await axios.post(url, params.toString(), {
    headers: {
      Cookie: `authorization=${token}; SESSION=${sessionId}`,
      'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
    },
    timeout: 20000,
  });

  const html = response.data?.map?.msg;
  if (!html || typeof html !== 'string') {
    throw new Error(`获取打印模板失败: billId=${billId}, 响应中无 HTML 内容`);
  }

  log.info(`打印模板获取成功: billId=${billId}, HTML长度=${html.length}`);
  return html;
}
