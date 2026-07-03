/**
 * ERP 客户欠款明细服务
 * 通过舟谱 API 拉取欠款数据，替代直连 xinshutong 数据库
 * @module services/erp-client/erp-debt.service
 */

import { erpPost } from './erp-client';
import { beijingDate } from '../../utils/beijingTime';
import { getErpDefaults } from './erp-config';
import { cache, CACHE_TTL } from '../../utils/cache';
import { CACHE_KEY } from '../../utils/cache-keys';
import { fetchAllPagesParallel } from './erp-pagination';
import { withInFlightDedup } from './erp-inflight';
import { appQuery } from '../../db/appPool';
import type { ERPDebtRecord } from '../erp-debt/erp-debt.types';
import { createLogger } from '../../utils/logger';

const log = createLogger('ErpDebtService');

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
  /** 已结金额（核销金额），ERP 返回字符串 */
  writeOffAmount?: string;
  /** 单据备注，如 "XD241107000036访销订单" */
  billNote?: string;
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
    writeOffAmount: parseFloat(api.writeOffAmount || '0') || 0,
    billNote: api.billNote || '',
  };
}

/**
 * 从本地 erp_debts 表读取欠款数据（同步引擎已预填充）
 * 返回格式与原 ERPDebtRecord 完全一致，消费方无需修改
 */
async function fetchDebtsFromLocalTable(): Promise<ERPDebtRecord[] | null> {
  try {
    const result = await appQuery<Record<string, unknown>>(
      `SELECT bill_id, biz_str, biz_order_str, consumer_name, manager_users,
              total_amount, left_amount, settle_method, consumer_expire_day,
              bill_type_name, work_time, hoard_tag, write_off_amount, bill_note
       FROM erp_debts WHERE left_amount > 0`
    );
    if (result.rows.length === 0) return null;

    return result.rows.map(row => ({
      billId: String(row.bill_id),
      bizStr: row.biz_str as string | undefined,
      bizOrderStr: row.biz_order_str as string,
      consumerName: row.consumer_name as string,
      managerUsers: row.manager_users as string,
      totalAmount: Number(row.total_amount) || 0,
      leftAmount: Number(row.left_amount) || 0,
      settleMethod: row.settle_method as number,
      consumerExpireDay: row.consumer_expire_day as number,
      billTypeName: row.bill_type_name as string,
      workTime: row.work_time as string,
      hoardTag: (row.hoard_tag as string) || null,
      writeOffAmount: Number(row.write_off_amount) || 0,
      billNote: (row.bill_note as string) || '',
    }));
  } catch (err) {
    log.warn('本地表查询失败，将 fallback 到 ERP API:', err instanceof Error ? err.message : String(err));
    return null;
  }
}

/**
 * 从 ERP API 拉取全量欠款数据（内部共享函数）
 * 封装分页拉取 + 过滤 + 类型转换，供 fetchDebtsFromErpApi 和 fetchAllErpDebts 共用
 * @returns leftAmount > 0 的所有欠款记录
 */
async function _fetchDebtsFromErp(): Promise<ERPDebtRecord[]> {
  const { cid, uid } = getErpDefaults();
  const workEndDate = beijingDate();

  const fetchPage = async (current: number) => {
    const result = await erpPost<ApiDebtResponse>(
      '/consumer-collect/detail',
      {
        workStartDate: '2020-01-01',
        workEndDate,
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
    return {
      records: result?.data?.records || [],
      total: result?.data?.total || 0,
    };
  };

  const allRecords = await fetchAllPagesParallel<ApiDebtRecord>(fetchPage, DEFAULT_PAGE_SIZE);
  return allRecords.filter(r => parseFloat(r.leftAmount) > 0).map(toERPDebtRecord);
}

/**
 * 直接从 ERP API 拉取全量欠款数据（不经过本地表、不触发 forceSync）
 * 供同步引擎的 fetchAll 调用，避免循环调用链
 * @returns leftAmount > 0 的所有欠款记录
 */
export async function fetchDebtsFromErpApi(): Promise<ERPDebtRecord[]> {
  return _fetchDebtsFromErp();
}

/**
 * 从本地表或 ERP API 获取客户欠款明细
 *
 * 迁移策略：先查本地 erp_debts 表（同步引擎每 2 分钟填充），
 * 表为空或查询失败时 fallback 到 ERP API（过渡期降级方案）。
 * 函数签名不变，消费方无需修改。
 *
 * @param skipCache - 为 true 时强制刷新（触发同步引擎后读取最新数据）
 * @returns leftAmount > 0 的所有欠款记录
 */
export async function fetchAllErpDebts(skipCache = false): Promise<ERPDebtRecord[]> {
  // skipCache=true：先尝试触发同步引擎强制同步，再读本地表
  if (skipCache) {
    try {
      const { forceSync } = await import('../erp-sync/sync-orchestrator');
      await forceSync('debts');
    } catch {
      // 同步引擎未初始化或失败，忽略
    }
    const localDebts = await fetchDebtsFromLocalTable();
    if (localDebts) return localDebts;
    log.warn('本地表无数据，fallback 到 ERP API');
  }

  // 正常路径：先查本地表
  if (!skipCache) {
    const localDebts = await fetchDebtsFromLocalTable();
    if (localDebts) return localDebts;
  }

  const cacheKey = CACHE_KEY.ERP_DEBTS_ALL;

  // 缓存检查（fallback 路径）
  if (!skipCache) {
    const cached = cache.get<ERPDebtRecord[]>(cacheKey);
    if (cached) return cached;
  }

  // in-flight 去重 + ERP 拉取
  if (!skipCache) {
    return withInFlightDedup('erp:debts:all', async () => {
      const debts = await _fetchDebtsFromErp();
      cache.set(cacheKey, debts, CACHE_TTL.ERP_BASE);
      return debts;
    });
  }

  // skipCache 且本地表无数据时，直接拉取 ERP
  const debts = await _fetchDebtsFromErp();
  cache.set(cacheKey, debts, CACHE_TTL.ERP_BASE);
  return debts;
}

/**
 * 检查指定的 billId 是否仍在 ERP 欠款列表中
 * 优先查本地 erp_debts 表，fallback 到全量缓存
 *
 * @param billIds 要检查的 billId 列表
 * @returns 仍存在于 ERP 中的 billId 集合
 */
export async function checkExistingBillIds(billIds: string[]): Promise<Set<string>> {
  if (billIds.length === 0) return new Set();

  // 优先从本地表查询（精确匹配，避免全量加载）
  try {
    const result = await appQuery<{ bill_id: string }>(
      'SELECT bill_id FROM erp_debts WHERE bill_id = ANY($1)',
      [billIds]
    );
    if (result.rows.length > 0) {
      return new Set(result.rows.map(r => r.bill_id));
    }
  } catch (err) {
    log.warn('本地表查询失败，fallback 到全量缓存:', err instanceof Error ? err.message : String(err));
  }

  // fallback：复用全量缓存数据
  const allDebts = await fetchAllErpDebts();
  const existingIds = new Set(allDebts.map(d => d.billId));
  return new Set(billIds.filter(id => existingIds.has(id)));
}
