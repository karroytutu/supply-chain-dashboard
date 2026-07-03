/**
 * ERP 供应商欠款/应付单服务
 * 封装供应商欠款列表查询（全量 + 分页）的 ERP API 调用
 * @domain 采购 (Procurement)
 * @module services/erp-client/erp-supplier-debt.service
 */
import { fetchDebtList, fetchDebtListPaged } from './erp-debt-list-query.service';
import type { SupplierDebtRecord, SupplierDebtPagedResult } from './erp-purchase.types';

export type { SupplierDebtPagedResult };

/**
 * 查询供应商欠款列表 (API#14)
 * GET /saas/pro/invoice/list-debt-list?traderType=SUPPLIER
 * 全量拉取，不缓存，实时应付
 */
export async function searchSupplierDebts(
  traderId: number
): Promise<SupplierDebtRecord[]> {
  return fetchDebtList<SupplierDebtRecord>(
    { traderId, traderType: 'SUPPLIER' },
    { businessType: 'supplier_debt_list' }
  );
}

/**
 * 供应商欠款分页查询
 * 支持服务端分页，前端按需请求
 *
 * 搜索策略：
 * - 无关键词时：直接利用 ERP API 分页，性能最优
 * - 有关键词时：ERP API 不支持搜索，需全量拉取后内存过滤再手动分页
 */
export async function searchSupplierDebtsPaged(params: {
  traderId: number;
  keyword?: string;
  page?: number;
  pageSize?: number;
}): Promise<SupplierDebtPagedResult> {
  const page = params.page || 1;
  const pageSize = Math.min(params.pageSize || 20, 100);

  // 有关键词时：ERP API 不支持搜索，需全量拉取后内存过滤
  if (params.keyword?.trim()) {
    const allRecords = await searchSupplierDebts(params.traderId);
    const kw = params.keyword.toLowerCase();
    const filtered = allRecords.filter(
      r => r.bizStr?.toLowerCase().includes(kw) || String(r.bizId).includes(params.keyword!)
    );
    const total = filtered.length;
    const start = (page - 1) * pageSize;
    const records = filtered.slice(start, start + pageSize);
    return { records, total, page, pageSize };
  }

  // 无关键词：直接利用 ERP API 分页
  const result = await fetchDebtListPaged<SupplierDebtRecord>(
    { traderId: params.traderId, traderType: 'SUPPLIER' },
    page,
    pageSize,
    'supplier_debt_list'
  );

  return { records: result.records, total: result.total, page, pageSize };
}
