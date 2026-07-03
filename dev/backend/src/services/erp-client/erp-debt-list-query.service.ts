/**
 * ERP 欠款列表统一查询服务
 * 封装 /invoice/list-debt-list 接口的通用查询逻辑，
 * 供客户结算单、供应商欠款、对账单应收查询三个消费方共用
 * @domain 结算 (Settlement)
 * @module services/erp-client/erp-debt-list-query.service
 */
import { erpGet, extractErpData } from './erp-client';
import { getErpDefaults } from './erp-config';

/** list-debt-list API 的通用查询参数 */
export interface DebtListQueryParams {
  traderId: number | string;
  traderType: 'STORE' | 'SUPPLIER';
  /** 核销状态过滤（如 'INIT,PART'），默认不传=全量 */
  writeOffQueryStates?: string;
  /** 领出类型过滤（如 'NORMAL'），默认不传=全量 */
  consumerCollectTypes?: string;
  /** 是否查询债务明细，默认不传 */
  queryDebt?: boolean;
  /** 开始日期（YYYY-MM-DD），可选 */
  startDate?: string;
  /** 结束日期（YYYY-MM-DD），可选 */
  endDate?: string;
}

/** list-debt-list API 的单页响应结构 */
interface DebtListPageResponse<T> {
  records: T[];
  total: number;
}

/**
 * 构建 list-debt-list API 的请求参数（内部共用）
 */
function buildApiParams(
  params: DebtListQueryParams,
  current: number,
  size: number
): Record<string, unknown> {
  const { cid, uid } = getErpDefaults();
  const apiParams: Record<string, unknown> = {
    size,
    total: 0,
    current,
    traderId: params.traderId,
    traderType: params.traderType,
    cid,
    uid,
  };
  // 仅在调用方显式传入时才添加过滤参数，避免影响需要全量数据的场景
  if (params.writeOffQueryStates !== undefined) apiParams.writeOffQueryStates = params.writeOffQueryStates;
  if (params.consumerCollectTypes !== undefined) apiParams.consumerCollectTypes = params.consumerCollectTypes;
  if (params.queryDebt !== undefined) apiParams.queryDebt = params.queryDebt;
  if (params.startDate) apiParams.startDate = params.startDate;
  if (params.endDate) apiParams.endDate = params.endDate;
  return apiParams;
}

/**
 * 请求 list-debt-list 的单页数据（内部共用）
 */
async function fetchDebtListPage<T>(
  params: DebtListQueryParams,
  current: number,
  size: number,
  businessType: string
): Promise<DebtListPageResponse<T>> {
  const apiParams = buildApiParams(params, current, size);
  const response = await erpGet<unknown>(
    '/invoice/list-debt-list',
    apiParams,
    { pathPrefix: '/saas/pro/', businessType }
  );
  const data = extractErpData<{ records?: T[]; total?: number }>(response);
  return {
    records: data?.records ?? [],
    total: data?.total ?? 0,
  };
}

/**
 * 全量拉取欠款列表（循环分页直到拉完）
 *
 * @param params - 查询参数
 * @param options.maxRecords - 最大拉取记录数，默认不限制
 * @param options.pageSize - 每页条数，默认 100
 * @param options.businessType - 日志业务类型标识
 */
export async function fetchDebtList<T>(
  params: DebtListQueryParams,
  options?: {
    maxRecords?: number;
    pageSize?: number;
    businessType?: string;
  }
): Promise<T[]> {
  const pageSize = options?.pageSize ?? 100;
  const maxRecords = options?.maxRecords ?? Infinity;
  const businessType = options?.businessType ?? 'debt_list_query';
  const allRecords: T[] = [];
  let current = 1;

  while (allRecords.length < maxRecords) {
    const page = await fetchDebtListPage<T>(params, current, pageSize, businessType);
    allRecords.push(...page.records);
    if (page.records.length < pageSize) break;
    current++;
  }

  return allRecords;
}

/**
 * 分页查询欠款列表（服务端分页）
 *
 * @param params - 查询参数
 * @param page - 页码（1-based）
 * @param pageSize - 每页条数
 * @param businessType - 日志业务类型标识
 */
export async function fetchDebtListPaged<T>(
  params: DebtListQueryParams,
  page: number,
  pageSize: number,
  businessType?: string
): Promise<DebtListPageResponse<T>> {
  return fetchDebtListPage<T>(params, page, pageSize, businessType ?? 'debt_list_paged');
}
