/**
 * 弹窗多选数据获取
 * @module components/Oa/hooks/useModalFetch
 *
 * 从 ERP 参考数据 API 获取弹窗多选的候选数据，
 * 支持分页、级联参数、筛选条件、purchase_settlements 特殊分支。
 */
import { getErpReference, getPurchaseSettlements } from '@/services/api/oa';
import { ERP_SEARCH_API_MAP } from '@/constants/oa-erp';

export interface FetchModalParams {
  searchApi: string;
  keyword: string;
  filterValues: Record<string, unknown>;
  cascadeParams?: Record<string, string>;
  formData?: Record<string, unknown>;
  signal: AbortSignal;
  page: number;
  paginated?: boolean;
  /** 表单类型定义中的默认查询参数，优先级最低，可被 cascadeParams 和 filterValues 覆盖 */
  defaultQueryParams?: Record<string, string | number | boolean>;
}

/**
 * 获取弹窗多选的候选数据
 * 参数优先级：defaultQueryParams（最低）→ cascadeParams → filterValues → keyword（最高）
 */
export async function fetchModalData(params: FetchModalParams): Promise<{ records: Record<string, unknown>[]; total: number }> {
  const { searchApi, keyword, filterValues, cascadeParams, formData, signal, page, paginated, defaultQueryParams } = params;

  // 构建通用参数：默认参数（最低优先级）→ 级联参数 → 筛选参数 → 关键词
  const extraParams: Record<string, string> = {};
  if (defaultQueryParams) {
    for (const [k, v] of Object.entries(defaultQueryParams)) {
      extraParams[k] = String(v);
    }
  }
  if (cascadeParams && formData) {
    for (const [apiParam, formField] of Object.entries(cascadeParams)) {
      const val = formData[formField];
      if (val != null && val !== '') extraParams[apiParam] = String(val);
    }
  }
  for (const [key, val] of Object.entries(filterValues)) {
    if (val != null && val !== '') extraParams[key] = String(val);
  }
  if (keyword) extraParams.keyword = keyword;

  // purchase_settlements 使用独立的分页 API
  if (searchApi === 'purchase_settlements') {
    const result = await getPurchaseSettlements(
      {
        keyword: keyword || undefined,
        startDate: filterValues.startDate as string | undefined,
        endDate: filterValues.endDate as string | undefined,
        supplierId: filterValues.supplierId as string | undefined,
        page,
        pageSize: 50,
      },
      signal,
    );
    return { records: (result.records || []) as Record<string, unknown>[], total: result.total || 0 };
  }

  // 通用 ERP 参考数据 API（paginated 时传递分页参数）
  const erpType = ERP_SEARCH_API_MAP[searchApi];
  if (!erpType) return { records: [], total: 0 };

  if (paginated) {
    extraParams.page = String(page);
    extraParams.pageSize = '50';
  }
  const result = await getErpReference(erpType, keyword || undefined, extraParams, signal);
  // 分页模式下后端返回 { records, total } 对象而非数组
  if (paginated && result && !Array.isArray(result) && 'records' in (result as object)) {
    const paged = result as { records: Record<string, unknown>[]; total: number };
    return { records: paged.records || [], total: paged.total || 0 };
  }
  const records = (result || []) as Record<string, unknown>[];
  return { records, total: records.length };
}
