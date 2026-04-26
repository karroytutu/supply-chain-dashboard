/**
 * ERP 客户查询服务
 * 代理舟谱客户搜索 API
 * @module services/erp-client/erp-customer.service
 */

import { erpPost, erpGet } from './erp-client';
import { getErpDefaults } from './erp-config';
import { cache, CACHE_TTL } from '../../utils/cache';
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
  /** 营业执照原图 URL 数组（CDN 直链） */
  attachedPicUrls?: string[];
  /** 营业执照缩略图 URL（CDN 直链，带 OSS 缩放） */
  attachedPicUrl?: string;
  [key: string]: unknown;
}

/** 客户执照信息 */
export interface CustomerLicenseInfo {
  hasLicense: boolean;
  imageCount: number;
  attachedPicUrls: string[];
}

// =====================================================
// 查询方法
// =====================================================

/**
 * 搜索 ERP 客户列表（分页拉取全部）
 * POST /redcoast/store-query/search
 *
 * 响应常用字段（ErpCustomer）：
 *   id                  - 客户ID（表单存储值、ERP API 参数）
 *   name                - 客户名称（下拉框显示标签）
 *   shortName           - 客户简称
 *   consumerCode        - 客户编码（如 KH01579）
 *   contactName         - 联系人
 *   contactTel          - 联系电话
 *   consumerManagerId   - 客户经理ID
 *   consumerManagerName - 客户经理姓名
 *   settleMethod        - 结算方式（1=账期等）
 *   settleConsumerId    - 结算客户ID
 *   settleConsumerName  - 结算客户名称
 *   maxDebtDays         - 最大欠款天数
 *   maxDebtOrderNum     - 最大欠款单数
 *   maxDebtAmount       - 最大欠款金额
 *   gradeId / gradeName - 客户等级（如 D）
 *   groupId / groupName - 客户分组（如 餐饮）
 *   areaId / areaName   - 区域（如 独山城区东部）
 *   state               - 状态（1=启用）
 *   address             - 地址
 *   debtAmount          - 当前欠款金额
 *   picture             - 门头照片URL
 *   cooperationTypeName - 合作类型名称（如 流失客户）
 *   ext.attachedPicIds  - 营业执照图片ID数组
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
 *
 * 响应字段同 searchErpCustomers
 */
export async function searchErpCustomersByKeyword(keyword: string): Promise<ErpCustomer[]> {
  /** 缓存键前缀，便于通过 cache.invalidate('erp_customer_search') 批量清除 */
  const cacheKey = `erp_customer_search:${keyword}`;

  const cached = cache.get<ErpCustomer[]>(cacheKey);
  if (cached) return cached;

  const { cid, uid } = getErpDefaults();
  const body = { current: 1, size: 50, docState: 1, cid, uid, queryText: keyword };
  const result = await erpPost(
    '/store-query/search', body,
    { pathPrefix: '/redcoast/', businessType: 'customer_search' }
  ) as any;
  const records: ErpCustomer[] = result?.data?.records || result?.records || [];
  cache.set(cacheKey, records, CACHE_TTL.ERP_CUSTOMER_SEARCH);
  return records;
}

/**
 * 获取客户完整资料
 * GET /redcoast/store-query/query-store-web?id=xxx
 *
 * 响应常用字段（ErpCustomerProfile）：
 *   id                  - 客户ID
 *   name                - 客户名称
 *   shortName           - 客户简称
 *   consumerCode        - 客户编码
 *   contactName         - 联系人
 *   contactTel          - 联系电话
 *   state               - 状态
 *   areaId / groupId    - 区域ID / 分组ID
 *   consumerManagerId   - 客户经理ID
 *   settleConsumerId    - 结算客户ID
 *   maxDebtDays         - 最大欠款天数
 *   maxDebtOrderNum     - 最大欠款单数
 *   maxDebtAmount       - 最大欠款金额
 *   settleMethod        - 结算方式
 *   scanFullPay         - 扫码全额付款
 *   autoWriteOff        - 自动核销
 *   ext.attachedPicIds  - 营业执照图片ID数组
 */
export async function getErpCustomerProfile(customerId: number): Promise<ErpCustomerProfile> {
  const cacheKey = `erp_customer_profile:${customerId}`;
  const cached = cache.get<ErpCustomerProfile>(cacheKey);
  if (cached) return cached;

  const { cid, uid } = getErpDefaults();
  const result = await erpGet(
    '/store-query/query-store-web',
    { id: customerId, cid, uid },
    { pathPrefix: '/redcoast/', businessType: 'customer_profile' }
  ) as any;
  const profile = (result?.data ?? result) as ErpCustomerProfile;
  cache.set(cacheKey, profile, CACHE_TTL.ERP_CUSTOMER_PROFILE);
  return profile;
}

/**
 * 获取客户营业执照信息
 * 从 ERP 客户档案 ext.attachedPicIds / attachedPicUrls 提取
 * 供 beforeSubmit 安全校验使用
 */
export async function getCustomerLicenseInfo(customerId: number): Promise<CustomerLicenseInfo> {
  const profile = await getErpCustomerProfile(customerId);
  const picIds = profile?.ext?.attachedPicIds || [];
  const picUrls = profile?.attachedPicUrls || [];
  return {
    hasLicense: picIds.length > 0,
    imageCount: picIds.length,
    attachedPicUrls: picUrls,
  };
}
