/**
 * ERP 客户查询服务
 * 代理舟谱客户搜索 API
 * @module services/erp-client/erp-customer.service
 */

import { erpPost } from './erp-client';
import { getErpDefaults } from './erp-config';
import type { ErpPageResponse } from './erp-client.types';

// =====================================================
// 类型定义
// =====================================================

/** ERP 客户对象 */
export interface ErpCustomer {
  id: number;
  name: string;
  code: string;
  shortName?: string;
  consumerCode?: string;
  docState?: number;
  contactName?: string;
  contactTel?: string;
  [key: string]: unknown;
}

/** ERP 客户详情（含完整字段） */
export interface ErpCustomerProfile {
  id: number;
  name: string;
  shortName?: string;
  consumerCode?: string;
  contactName?: string;
  contactTel?: string;
  state?: number;
  areaId?: number;
  groupId?: number;
  ext?: {
    attachedPicIds?: string[];
    [key: string]: unknown;
  };
  consumerManagerId?: number;
  settleConsumerId?: number;
  maxDebtAmount?: string;
  maxDebtDays?: string;
  maxDebtOrderNum?: string;
  settleMethod?: number;
  scanFullPay?: boolean;
  autoWriteOff?: boolean;
  cid?: string;
  uid?: string;
  [key: string]: unknown;
}

// =====================================================
// 查询方法
// =====================================================

/**
 * 搜索 ERP 客户列表（分页拉取全部）
 * POST /redcoast/store-query/search
 */
export async function searchErpCustomers(keyword?: string): Promise<ErpCustomer[]> {
  const { cid, uid } = getErpDefaults();
  const allCustomers: ErpCustomer[] = [];
  let current = 1;
  const size = 200;

  while (true) {
    const body: Record<string, unknown> = {
      current, size, docState: 1, cid, uid,
    };
    if (keyword) {
      body.queryText = keyword;
    }
    const result = await erpPost(
      '/store-query/search', body,
      { pathPrefix: '/redcoast/', businessType: 'customer_search' }
    ) as any;
    const records: ErpCustomer[] = result?.data?.records || result?.records || [];
    allCustomers.push(...records);
    if (records.length < size) break;
    current++;
  }
  return allCustomers;
}

/**
 * 按关键字搜索 ERP 客户（仅查第一页，用于下拉搜索）
 * POST /redcoast/store-query/search
 */
export async function searchErpCustomersByKeyword(keyword: string): Promise<ErpCustomer[]> {
  const { cid, uid } = getErpDefaults();
  const body = { current: 1, size: 50, docState: 1, cid, uid, queryText: keyword };
  const result = await erpPost(
    '/store-query/search', body,
    { pathPrefix: '/redcoast/', businessType: 'customer_search' }
  ) as any;
  return result?.data?.records || result?.records || [];
}

/**
 * 获取客户完整资料
 * GET /redcoast/store-query/query-store-web?id=xxx
 */
export async function getErpCustomerProfile(customerId: number): Promise<ErpCustomerProfile> {
  const { cid, uid } = getErpDefaults();
  const result = await erpPost(
    '/store-query/query-store-web',
    { id: customerId, cid, uid },
    { pathPrefix: '/redcoast/', businessType: 'customer_profile' }
  ) as any;
  return (result?.data ?? result) as ErpCustomerProfile;
}
