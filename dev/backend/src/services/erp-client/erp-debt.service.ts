/**
 * ERP 客户欠款明细服务
 * 通过舟谱 API 拉取欠款数据，替代直连 xinshutong 数据库
 * @module services/erp-client/erp-debt.service
 */

import { erpPost } from './erp-client';
import { getErpDefaults } from './erp-config';
import { cache, CACHE_TTL } from '../../utils/cache';
import { CACHE_KEY } from '../../utils/cache-keys';
import type { ERPDebtRecord } from '../ar-collection/ar-debt.types';

/** API 返回的原始欠款记录 */
interface ApiDebtRecord {
  billId: number;
  bizStr?: string;
  bizOrderStr: string;
  consumerName: string;
  managerUsers: string;
  totalAmount: string;
  leftAmount: string;
  settleMethod: number;
  consumerExpireDay: number;
  billTypeName: string;
  workTime: string;
  isHoard?: string;
  collectState?: string;
  salesmanName?: string;
  settlementState?: string;
}

/** API 分页响应 */
interface ApiDebtResponse {
  code: number;
  data: {
    records: ApiDebtRecord[];
    total: number;
    current: number;
    size: number;
  };
}

/** 默认 pageSize（实测 2000 最优） */
const DEFAULT_PAGE_SIZE = 2000;

/**
 * 将 API 原始记录转换为 ERPDebtRecord
 * API 返回的 totalAmount/leftAmount 是 string，需转为 number
 */
function toERPDebtRecord(api: ApiDebtRecord): ERPDebtRecord {
  return {
    billId: String(api.billId),
    bizStr: api.bizStr,
    bizOrderStr: api.bizOrderStr,
    consumerName: api.consumerName,
    managerUsers: api.managerUsers,
    totalAmount: parseFloat(api.totalAmount) || 0,
    leftAmount: parseFloat(api.leftAmount) || 0,
    settleMethod: api.settleMethod,
    consumerExpireDay: api.consumerExpireDay,
    billTypeName: api.billTypeName,
    workTime: api.workTime,
    // 欠款明细 API 返回 isHoard（中文 '是'/'否'），结算单 API 返回 hoardTag（英文 'HOARD'/'NORMAL'）
    // 两者是同一业务概念的不同 API 字段名，映射为系统内部的 hoardTag: 'HOARD'/'NORMAL'
    // 未知值统一为 null，避免脏数据泄漏到 ar_collection_details.hoard_tag
    hoardTag: api.isHoard === '是' ? 'HOARD' : api.isHoard === '否' ? 'NORMAL' : null,
  };
}

/**
 * 从 ERP API 全量拉取客户欠款明细
 *
 * @param skipCache - 为 true 时绕过缓存（定时同步任务使用）
 * @returns leftAmount > 0 的所有欠款记录
 */
export async function fetchAllErpDebts(skipCache = false): Promise<ERPDebtRecord[]> {
  const cacheKey = CACHE_KEY.ERP_DEBTS_ALL;

  // 缓存检查（仅非 skipCache 模式）
  if (!skipCache) {
    const cached = cache.get<ERPDebtRecord[]>(cacheKey);
    if (cached) return cached;
  }

  const { cid, uid } = getErpDefaults();
  const allRecords: ApiDebtRecord[] = [];
  let current = 1;

  while (true) {
    const result = await erpPost<ApiDebtResponse>(
      '/consumer-collect/detail',
      {
        workStartDate: '2020-01-01',
        workEndDate: new Date().toISOString().slice(0, 10),
        size: DEFAULT_PAGE_SIZE,
        total: 0,
        current,
        settlementStateIds: ['NONE', 'PART'],
        timeType: ['WORK'],
        ifShowSubtotal: false,
        groupingDims: ['settlerName'],
        cid,
        uid,
      },
      {
        pathPrefix: '/toliman/',
        businessType: 'debt_fetch',
      }
    );

    const records = result?.data?.records || [];
    allRecords.push(...records);

    // 判断是否还有下一页
    const total = result?.data?.total || 0;
    if (allRecords.length >= total || records.length < DEFAULT_PAGE_SIZE) {
      break;
    }
    current++;
  }

  // 过滤 leftAmount > 0 并转换类型
  const debts = allRecords.filter(r => parseFloat(r.leftAmount) > 0).map(toERPDebtRecord);

  // 写入缓存（TTL 30s）
  cache.set(cacheKey, debts, CACHE_TTL.HIGH_FREQUENCY);

  return debts;
}

/**
 * 检查指定的 billId 是否仍在 ERP 欠款列表中
 * 用于核销时验证 ERP 数据是否仍存在
 *
 * @param billIds 要检查的 billId 列表
 * @returns 仍存在于 ERP 中的 billId 集合
 */
export async function checkExistingBillIds(billIds: string[]): Promise<Set<string>> {
  if (billIds.length === 0) return new Set();

  // 复用全量缓存数据（如果有的话）
  const allDebts = await fetchAllErpDebts();
  const existingIds = new Set(allDebts.map(d => d.billId));

  return new Set(billIds.filter(id => existingIds.has(id)));
}
