/**
 * ERP 供应商收入单服务
 * 封装供应商收入单的查询、创建 ERP API 调用
 * @domain 采购 (Procurement)
 * @module services/erp-client/erp-supplier-income.service
 */
import { createLogger } from '../../utils/logger';
const log = createLogger('ERP-SupplierIncome');

import { erpPost, extractErpData } from './erp-client';
import { getErpConfig, getErpDefaults } from './erp-config';
import { fetchAllPagesSequential } from './erp-pagination';
import type { SupplierIncomeRecord } from './erp-purchase.types';

// =====================================================
// 类型定义
// =====================================================

/** 创建供应商收入单请求参数（save-approve-trade-income） */
export interface CreateSupplierIncomeBillParams {
  traderType: 'SUPPLIER';
  traderId: number | string;
  traderName: string;
  /** 收入总额（string 类型，服务层确保格式正确） */
  totalAmount: string;
  details: Array<{
    id: number;
    subjectId: number;
    subjectName: string;
    deptId: number;
    deptName: string;
    taxRadio: number;
    taxAmount: string;
    noTaxAmount: string;
    paymentAmount: number;
    note?: string;
  }>;
  salesmanId: number;
  deptId: number;
  workTime: string;
  note?: string;
  imgIds?: string[];
}

/** 供应商收入单创建响应 */
export interface SupplierIncomeBillResponse {
  id: number;
  billStr: string;
  state: string;
  [key: string]: unknown;
}

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

// =====================================================
// 供应商收入单创建
// =====================================================

/**
 * 创建供应商收入单并审核
 * POST /saas/pro/income/save-approve-trade-income
 *
 * 与现金收入单（save-approve-cash-income）的区别：
 * - 多了 traderType、traderId、traderName（关联供应商）
 * - 路径为 trade-income 而非 cash-income
 *
 * 注意：时间戳字段（workTime）必须动态生成，禁止硬编码
 */
export async function createSupplierIncomeBill(
  payload: CreateSupplierIncomeBillParams,
  idemKey: string,
  businessId?: number
): Promise<SupplierIncomeBillResponse> {
  const { cid, uid } = getErpDefaults();
  const config = getErpConfig();

  const requestBody = {
    operatorId: '1',
    ...payload,
    imgIds: payload.imgIds || [],
    cid,
    uid,
  };

  const result = await erpPost<{ data?: SupplierIncomeBillResponse }>(
    config.supplierIncomeBillPath || '/income/save-approve-trade-income',
    requestBody,
    {
      pathPrefix: '/saas/pro/',
      businessType: 'supplier_income_bill_create',
      businessId,
      headers: { idemkey: idemKey },
    }
  );

  const billData = result?.data;
  if (!billData?.id) {
    log.warn('供应商收入单创建响应缺少 id:', JSON.stringify(result).slice(0, 200));
    return { id: 0, billStr: '', state: '' };
  }

  log.info(`供应商收入单创建成功: billStr=${billData.billStr}, id=${billData.id}, state=${billData.state}`);
  return billData;
}
