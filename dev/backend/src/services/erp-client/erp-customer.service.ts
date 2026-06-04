/**
 * ERP 客户查询服务
 * 代理舟谱客户搜索 API
 * @module services/erp-client/erp-customer.service
 */

import { erpPost, erpGet } from './erp-client';
import { getErpDefaults } from './erp-config';
import { cache, CACHE_TTL } from '../../utils/cache';
import { CACHE_KEY } from '../../utils/cache-keys';
import type {} from './erp-client.types';

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
 *   state               - 状态（0=停用, 1=启用, 2=待确认）
 *   address             - 地址
 *   debtAmount          - 当前欠款金额
 *   picture             - 门头照片URL
 *   cooperationTypeName - 合作类型名称（如 流失客户）
 *   ext.attachedPicIds  - 营业执照图片ID数组
 */
export async function searchErpCustomers(
  keyword?: string,
  options?: { includeAllStates?: boolean }
): Promise<ErpCustomer[]> {
  const { cid, uid } = getErpDefaults();
  const allCustomers: ErpCustomer[] = [];
  let current = 1;
  const size = 200;

  while (true) {
    const body: Record<string, unknown> = {
      current,
      size,
      cid,
      uid,
    };
    // 默认仅查启用客户（docState=1），客户档案修改场景需传 includeAllStates=true
    if (!options?.includeAllStates) {
      body.docState = 1;
    }
    if (keyword) {
      body.queryText = keyword;
    }
    const result = (await erpPost('/store-query/search', body, {
      pathPrefix: '/redcoast/',
      businessType: 'customer_search',
    })) as any;
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
 * @param keyword 搜索关键词
 * @param options.includeAllStates 是否包含所有状态客户（默认仅启用）
 *   客户档案修改场景需传 true，其他场景保持默认
 */
export async function searchErpCustomersByKeyword(
  keyword: string,
  options?: { includeAllStates?: boolean }
): Promise<ErpCustomer[]> {
  // 缓存键需区分两种模式，避免同关键词返回错误模式的缓存结果
  const stateSuffix = options?.includeAllStates ? ':all' : '';
  const cacheKey = CACHE_KEY.ERP_CUSTOMER_SEARCH(`${keyword}${stateSuffix}`);

  const cached = cache.get<ErpCustomer[]>(cacheKey);
  if (cached) return cached;

  const { cid, uid } = getErpDefaults();
  const body: Record<string, unknown> = { current: 1, size: 50, cid, uid, queryText: keyword };
  // 默认仅查启用客户（docState=1），客户档案修改场景需传 includeAllStates=true
  if (!options?.includeAllStates) {
    body.docState = 1;
  }
  const result = (await erpPost('/store-query/search', body, {
    pathPrefix: '/redcoast/',
    businessType: 'customer_search',
  })) as any;
  const records: ErpCustomer[] = result?.data?.records || result?.records || [];
  cache.set(cacheKey, records, CACHE_TTL.LOW_FREQUENCY);
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
  const cacheKey = CACHE_KEY.ERP_CUSTOMER_PROFILE(customerId);
  const cached = cache.get<ErpCustomerProfile>(cacheKey);
  if (cached) return cached;

  const { cid, uid } = getErpDefaults();
  const result = (await erpGet(
    '/store-query/query-store-web',
    { id: customerId, cid, uid },
    { pathPrefix: '/redcoast/', businessType: 'customer_profile' }
  )) as any;
  const profile = (result?.data ?? result) as ErpCustomerProfile;
  cache.set(cacheKey, profile, CACHE_TTL.LOW_FREQUENCY);
  return profile;
}

/**
 * 获取客户营业执照信息
 * 从 ERP 客户档案 ext.attachedPicIds / attachedPicUrls 提取
 * 供 beforeSubmit 安全校验及前端展示使用
 *
 * 注意：profile API 不返回 attachedPicUrls，需从搜索 API 补充
 */
export async function getCustomerLicenseInfo(customerId: number): Promise<CustomerLicenseInfo> {
  const profile = await getErpCustomerProfile(customerId);
  const picIds = profile?.ext?.attachedPicIds || [];
  let picUrls = profile?.attachedPicUrls || [];

  // profile API 不返回 attachedPicUrls，从搜索 API 补充
  if (picIds.length > 0 && picUrls.length === 0) {
    try {
      const customers = await searchErpCustomersByKeyword(String(profile?.name || ''));
      const matched = customers.find(c => c.id === customerId);
      if (matched) {
        picUrls = ((matched as Record<string, unknown>).attachedPicUrls as string[]) || [];
      }
    } catch {
      // 搜索 API 失败不影响 hasLicense 判断
    }
  }

  return {
    hasLicense: picIds.length > 0,
    imageCount: picIds.length,
    attachedPicUrls: picUrls,
  };
}

// =====================================================
// 欠款查询
// =====================================================

/**
 * 查询单个客户的欠款总额
 * 通过 settlement API 的 list-debt-list 求和 leftAmount 获取
 *
 * 注意：ERP 搜索/Profile API 的 debtAmount 字段不可靠（已验证返回 0 即使有欠款），
 * 必须通过此函数获取真实欠款金额
 *
 * @usedBy customer-modify-callback.ts (停用校验 - onApproved)
 * @usedBy erp-reference.controller.ts (前端展示)
 */
export async function getCustomerDebtTotal(customerId: number): Promise<number> {
  const cacheKey = `erp:customer:debt-total:${customerId}`;
  const cached = cache.get<number>(cacheKey);
  if (cached !== null) return cached;

  // 动态导入避免循环依赖
  const { searchErpSettlementOrders } = await import('./erp-settlement.service');
  const orders = await searchErpSettlementOrders({ traderId: customerId, maxRecords: 1000 });
  const rawTotal = orders.reduce((sum, o) => sum + (parseFloat(o.leftAmount) || 0), 0);
  // 修正浮点精度：如 107898.05000000003 → 107898.05
  const total = Math.round(rawTotal * 100) / 100;

  cache.set(cacheKey, total, CACHE_TTL.HIGH_FREQUENCY);
  return total;
}
