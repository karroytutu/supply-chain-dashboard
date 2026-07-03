/**
 * ERP 供应商收入单服务
 * 封装供应商收入单的查询 ERP API 调用
 * @domain 采购 (Procurement)
 * @module services/erp-client/erp-supplier-income.service
 */
import { erpPost, extractErpData } from './erp-client';
import { getErpDefaults } from './erp-config';
import { fetchAllPagesSequential } from './erp-pagination';
import type { SupplierIncomeRecord } from './erp-purchase.types';

/**
 * 查询供应商收入单列表 (API#12)
 * POST /saas/pro/income/new/list
 * 全量拉取 + 可选关键词内存过滤
 */
export async function searchSupplierIncomes(
  traderId: number,
  startDate?: string,
  endDate?: string,
  keyword?: string
): Promise<SupplierIncomeRecord[]> {
  const { cid, uid } = getErpDefaults();

  const fetchPage = async (current: number) => {
    const result = await erpPost<unknown>(
      '/income/new/list',
      {
        timeType: 'WORK',
        current,
        size: 100,
        total: 0,
        startDate: startDate || '',
        endDate: endDate || '',
        states: ['NORMAL', 'APPROVED'],
        traderType: 'SUPPLIER',
        traderId,
        cid,
        uid,
      },
      { pathPrefix: '/saas/pro/', businessType: 'supplier_income_list' }
    );
    const data = extractErpData<{ records?: SupplierIncomeRecord[]; total?: number }>(result);
    return {
      records: data?.records ?? [],
      total: data?.total ?? 0,
    };
  };

  const allRecords = await fetchAllPagesSequential(fetchPage, 100);

  if (keyword) {
    const kw = keyword.toLowerCase();
    return allRecords.filter(r =>
      r.billStr?.toLowerCase().includes(kw) ||
      String(r.id).includes(keyword)
    );
  }
  return allRecords;
}
