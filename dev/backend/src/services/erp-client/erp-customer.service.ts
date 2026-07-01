/**
 * ERP 客户查询服务
 * 代理舟谱客户搜索 API
 * @module services/erp-client/erp-customer.service
 */

import { erpPost, erpGet, extractErpData } from './erp-client';
import { getErpDefaults } from './erp-config';
import { cache, CACHE_TTL } from '../../utils/cache';
import { CACHE_KEY } from '../../utils/cache-keys';
import { createLogger } from '../../utils/logger';
import { appQuery } from '../../db/appPool';

const log = createLogger('ErpCustomer');
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
  const size = 200;

  const fetchPage = async (current: number) => {
    const body: Record<string, unknown> = { current, size, cid, uid };
    // 默认仅查启用客户（docState=1），客户档案修改场景需传 includeAllStates=true
    if (!options?.includeAllStates) {
      body.docState = 1;
    }
    if (keyword) {
      body.queryText = keyword;
    }
    const response = await erpPost<unknown>('/store-query/search', body, {
      pathPrefix: '/redcoast/',
      businessType: 'customer_search',
    });
    const data = extractErpData<{ records?: ErpCustomer[]; total?: number }>(response);
    const records: ErpCustomer[] = data?.records ?? [];
    const total: number = data?.total ?? 0;
    return { records, total };
  };

  // 先拉第一页，检查 ERP 是否返回 total
  const first = await fetchPage(1);

  // 有 total 且有多页 → 并行拉取剩余页（allSettled 容错，单页失败不丢全量）
  if (first.total > 0 && first.records.length < first.total) {
    const totalPages = Math.ceil(first.total / size);
    const restNums = Array.from({ length: totalPages - 1 }, (_, i) => i + 2);
    const settled = await Promise.allSettled(restNums.map(p => fetchPage(p)));
    const restRecords: ErpCustomer[] = [];
    for (const result of settled) {
      if (result.status === 'fulfilled') {
        restRecords.push(...result.value.records);
      } else {
        log.warn('客户搜索并行分页某页失败，已跳过:', result.reason);
      }
    }
    return [...first.records, ...restRecords];
  }

  // 无 total 或只有一页 → 串行兜底（保守策略，确保数据完整性）
  if (first.records.length < size) return first.records;
  const allCustomers = [...first.records];
  let current = 2;
  while (true) {
    const page = await fetchPage(current);
    allCustomers.push(...page.records);
    if (page.records.length < size) break;
    current++;
  }
  return allCustomers;
}

/**
 * 按关键字搜索 ERP 客户（优先查本地表，fallback 到 ERP API）
 *
 * @param keyword 搜索关键词
 * @param options.includeAllStates 是否包含所有状态客户（默认仅启用）
 */
export async function searchErpCustomersByKeyword(
  keyword: string,
  options?: { includeAllStates?: boolean }
): Promise<ErpCustomer[]> {
  // 缓存键需区分两种模式
  const stateSuffix = options?.includeAllStates ? ':all' : '';
  const cacheKey = CACHE_KEY.ERP_CUSTOMER_SEARCH(`${keyword}${stateSuffix}`);

  const cached = cache.get<ErpCustomer[]>(cacheKey);
  if (cached) return cached;

  // 优先从本地表查询
  try {
    let sql = `SELECT id, name, short_name, consumer_code, contact_name, contact_tel,
                      doc_state, state
               FROM erp_customers`;
    const params: unknown[] = [];
    const conditions: string[] = [];

    if (keyword) {
      params.push(`%${keyword}%`);
      conditions.push(`name ILIKE $${params.length}`);
    }
    if (!options?.includeAllStates) {
      params.push(1);
      conditions.push(`doc_state = $${params.length}`);
    }
    if (conditions.length > 0) {
      sql += ' WHERE ' + conditions.join(' AND ');
    }
    sql += ' LIMIT 50';

    const result = await appQuery<Record<string, unknown>>(sql, params);
    if (result.rows.length > 0) {
      const records: ErpCustomer[] = result.rows.map(row => ({
        id: row.id as number,
        name: row.name as string,
        code: (row.consumer_code as string) || '',
        shortName: row.short_name as string | undefined,
        consumerCode: row.consumer_code as string | undefined,
        docState: row.doc_state as number | undefined,
        contactName: row.contact_name as string | undefined,
        contactTel: row.contact_tel as string | undefined,
      }));
      cache.set(cacheKey, records, CACHE_TTL.LOW_FREQUENCY);
      return records;
    }
  } catch (err) {
    log.warn('本地表查询失败，fallback 到 ERP API:', err instanceof Error ? err.message : String(err));
  }

  // fallback: ERP API
  const { cid, uid } = getErpDefaults();
  const body: Record<string, unknown> = { current: 1, size: 50, cid, uid, queryText: keyword };
  if (!options?.includeAllStates) {
    body.docState = 1;
  }
  const response = await erpPost<unknown>('/store-query/search', body, {
    pathPrefix: '/redcoast/',
    businessType: 'customer_search',
  });
  const data = extractErpData<{ records?: ErpCustomer[] }>(response);
  const records: ErpCustomer[] = data?.records ?? [];
  cache.set(cacheKey, records, CACHE_TTL.LOW_FREQUENCY);
  return records;
}

/**
 * 获取客户完整资料
 * 优先从本地 erp_customers 表查询，fallback 到 ERP Profile API
 *
 * 注意：本地表存储搜索 API 的 92 字段，Profile API 可能返回额外字段（如完整 ext 对象）。
 * 如果消费方需要 Profile API 特有字段，应直接调用 ERP API。
 */
export async function getErpCustomerProfile(customerId: number): Promise<ErpCustomerProfile> {
  const cacheKey = CACHE_KEY.ERP_CUSTOMER_PROFILE(customerId);
  const cached = cache.get<ErpCustomerProfile>(cacheKey);
  if (cached) return cached;

  // 优先从本地表查询
  try {
    const result = await appQuery<Record<string, unknown>>(
      `SELECT id, name, short_name, consumer_code, contact_name, contact_tel,
              state, area_id, group_id, consumer_manager_id, settle_consumer_id,
              max_debt_amount, max_debt_days, max_debt_order_num, settle_method,
              scan_full_pay, auto_write_off, attached_pic_urls
       FROM erp_customers WHERE id = $1`,
      [customerId]
    );
    if (result.rows.length > 0) {
      const row = result.rows[0];
      const profile: ErpCustomerProfile = {
        id: row.id as number,
        name: row.name as string,
        shortName: row.short_name as string | undefined,
        consumerCode: row.consumer_code as string | undefined,
        contactName: row.contact_name as string | undefined,
        contactTel: row.contact_tel as string | undefined,
        state: row.state as number | undefined,
        areaId: row.area_id as number | undefined,
        groupId: row.group_id as number | undefined,
        consumerManagerId: row.consumer_manager_id as number | undefined,
        settleConsumerId: row.settle_consumer_id as number | undefined,
        maxDebtAmount: row.max_debt_amount != null ? String(row.max_debt_amount) : undefined,
        maxDebtDays: row.max_debt_days != null ? String(row.max_debt_days) : undefined,
        maxDebtOrderNum: row.max_debt_order_num != null ? String(row.max_debt_order_num) : undefined,
        settleMethod: row.settle_method as number | undefined,
        scanFullPay: (row.scan_full_pay as number) === 1 ? true : undefined,
        autoWriteOff: (row.auto_write_off as number) === 1 ? true : undefined,
        attachedPicUrls: (() => {
          try { return row.attached_pic_urls ? JSON.parse(row.attached_pic_urls as string) : undefined; }
          catch { return undefined; }
        })(),
      };
      cache.set(cacheKey, profile, CACHE_TTL.LOW_FREQUENCY);
      return profile;
    }
  } catch (err) {
    log.warn('本地表查询失败，fallback 到 ERP API:', err instanceof Error ? err.message : String(err));
  }

  // fallback: ERP Profile API
  const { cid, uid } = getErpDefaults();
  const response = await erpGet<unknown>(
    '/store-query/query-store-web',
    { id: customerId, cid, uid },
    { pathPrefix: '/redcoast/', businessType: 'customer_profile' }
  );
  const profile = extractErpData<ErpCustomerProfile>(response);
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
  const cacheKey = CACHE_KEY.ERP_CUSTOMER_DEBT_TOTAL(customerId);
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
