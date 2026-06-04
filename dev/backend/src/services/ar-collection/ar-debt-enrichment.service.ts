/**
 * 催收欠款数据富化服务
 * 统一为 ERP 欠款数据补充 hoardTag、客户限额等上下文信息
 * 供任务生成器、预警查询、预警提醒共用
 */
import { createLogger } from '../../utils/logger';
const log = createLogger('ArCollection');

import { appQuery } from '../../db/appPool';
import { cache, CACHE_TTL } from '../../utils/cache';
import { CACHE_KEY } from '../../utils/cache-keys';
import {
  AR_DEFAULT_EXPIRE_DAYS,
  AR_SETTLE_METHOD_CONSUMER_EXPIRE,
  AR_HOARD_TAG_HOARD,
  AR_HOARD_TAG_NORMAL,
  AR_HOLD_TYPE_TIME_LIMITED,
  type ArHoldType,
} from '../../utils/constants';
import { searchErpCustomers } from '../erp-client/erp-customer.service';
import { searchErpSettlementOrders } from '../erp-client/erp-settlement.service';
import type { ERPDebtRecord, EnrichedDebtRecord, CustomerLimits } from './ar-debt.types';

// ============================================
// 缓存 Key 常量
// ============================================

const CACHE_KEY_CUSTOMER_NAME_MAP = CACHE_KEY.CUSTOMER_NAME_MAP;
const CACHE_KEY_CUSTOMER_LIMITS = CACHE_KEY.CUSTOMER_LIMITS;
const CACHE_KEY_SETTLEMENT_HOARD = 'erp:settlement:hoard';

// ============================================
// 核心导出函数
// ============================================

/**
 * 富化欠款记录：补充 hoardTag + 客户限额 + 计算字段
 * @param debts 原始 ERP 欠款记录
 * @param now 当前时间（用于计算逾期天数）
 */
export async function enrichDebtRecords(
  debts: ERPDebtRecord[],
  now: Date = new Date()
): Promise<EnrichedDebtRecord[]> {
  if (debts.length === 0) return [];

  // 1. 获取客户名称 → traderId 映射 + 客户限额
  const consumerNames = [...new Set(debts.map(d => d.consumerName))];
  const { nameToTraderId, customerLimitsMap } = await fetchCustomerData(consumerNames);

  // 2. 获取 hoardTag 映射（billId → hoardTag）
  const hoardTagMap = await fetchHoardTags(debts, nameToTraderId);

  // 2.5. 获取本地 hold 元数据（用于期限压单过期判断）
  const holdExpiryMap = await fetchHoldExpiryState(debts);

  // 3. 组装富化记录
  return debts.map(debt => {
    const traderId = nameToTraderId.get(debt.consumerName) ?? null;
    const limits = customerLimitsMap.get(debt.consumerName);
    const rawHoardTag = resolveHoardTag(debt, hoardTagMap);

    // 查找 hold 元数据
    const holdMeta = holdExpiryMap.get(debt.billId);
    const holdType = holdMeta?.holdType ?? null;
    const holdUntil = holdMeta?.holdUntil ?? null;

    // 期限压单已到期 → 覆盖 hoardTag 为 NORMAL（不再排除催收）
    // 使用字符串比较避免时区偏移：holdUntil 格式为 'YYYY-MM-DD'，与当天日期字符串直接比较
    let hoardTag = rawHoardTag;
    if (
      rawHoardTag === AR_HOARD_TAG_HOARD &&
      holdType === AR_HOLD_TYPE_TIME_LIMITED &&
      holdUntil &&
      holdUntil < now.toISOString().slice(0, 10)
    ) {
      hoardTag = AR_HOARD_TAG_NORMAL;
    }

    // 计算逾期相关字段
    const workDate = new Date(debt.workTime);
    const maxAllowedDays =
      Number(debt.settleMethod) === AR_SETTLE_METHOD_CONSUMER_EXPIRE
        ? Number(debt.consumerExpireDay) || 0
        : AR_DEFAULT_EXPIRE_DAYS;
    const ageDays = Math.floor((now.getTime() - workDate.getTime()) / 86400000);
    const overdueDays = Math.max(0, ageDays - maxAllowedDays);
    const overdueDate = new Date(workDate.getTime() + maxAllowedDays * 86400000);
    const overdueDateStr = overdueDate.toISOString().slice(0, 10);
    const isOverdue = ageDays > maxAllowedDays;

    return {
      ...debt,
      hoardTag,
      holdType,
      holdUntil,
      traderId,
      overdueDays,
      overdueDateStr,
      maxAllowedDays,
      isOverdue,
      customerMaxDebtOrderNum: limits?.maxDebtOrderNum ?? null,
      customerMaxDebtDays: limits?.maxDebtDays ?? null,
      customerMaxDebtAmount: limits?.maxDebtAmount ?? null,
    } satisfies EnrichedDebtRecord;
  });
}

/**
 * 过滤压单欠款
 * 压单是硬排除——HOARD 欠款在任何场景下都不应进入催收/预警
 * @usedBy ar-collection-task-generator.ts, ar-warning.query.ts, ar-warning.task.ts
 */
export function filterHoardDebts(debts: EnrichedDebtRecord[]): EnrichedDebtRecord[] {
  return debts.filter(d => d.hoardTag !== AR_HOARD_TAG_HOARD);
}

// ============================================
// 客户数据获取
// ============================================

/**
 * 获取客户名称 → traderId 映射和客户限额数据
 * 使用缓存避免重复 API 调用
 * @usedBy ar-hoard-detect.ts (压单检测获取客户映射)
 */
export async function fetchCustomerData(_consumerNames: string[]): Promise<{
  nameToTraderId: Map<string, number>;
  customerLimitsMap: Map<string, CustomerLimits>;
}> {
  const nameToTraderId = new Map<string, number>();
  const customerLimitsMap = new Map<string, CustomerLimits>();

  // 尝试从缓存获取
  const cachedNameMap = cache.get<Map<string, number>>(CACHE_KEY_CUSTOMER_NAME_MAP);
  const cachedLimits = cache.get<Map<string, CustomerLimits>>(CACHE_KEY_CUSTOMER_LIMITS);

  if (cachedNameMap && cachedLimits) {
    return { nameToTraderId: cachedNameMap, customerLimitsMap: cachedLimits };
  }

  try {
    // 批量获取所有 ERP 客户（searchErpCustomers 会分页拉取全部）
    const customers = await searchErpCustomers();

    for (const customer of customers) {
      const name = customer.name;
      if (name) {
        nameToTraderId.set(name, customer.id);

        // 从搜索结果中提取客户限额字段
        const c = customer as Record<string, unknown>;
        customerLimitsMap.set(name, {
          traderId: customer.id,
          maxDebtOrderNum: parseNumberOrNull(c.maxDebtOrderNum as string | undefined),
          maxDebtDays: parseNumberOrNull(c.maxDebtDays as string | undefined),
          maxDebtAmount: parseNumberOrNull(c.maxDebtAmount as string | undefined),
        });
      }
    }

    // 缓存结果
    cache.set(CACHE_KEY_CUSTOMER_NAME_MAP, nameToTraderId, CACHE_TTL.LOW_FREQUENCY);
    cache.set(CACHE_KEY_CUSTOMER_LIMITS, customerLimitsMap, CACHE_TTL.LOW_FREQUENCY);
  } catch (error) {
    log.error('获取ERP客户数据失败:', error);
    // 容错：返回空的映射，不影响后续处理（客户限额将全部为 null）
  }

  return { nameToTraderId, customerLimitsMap };
}

// ============================================
// HoardTag 获取
// ============================================

/**
 * 获取 billId → hoardTag 映射
 * 策略：先检查原始记录是否已含 hoardTag（PG 视图可能已包含）
 * 若不含，则按客户从 ERP API 获取结算单的 hoardTag
 * @usedBy ar-hoard-detect.ts (压单检测获取最新 hoardTag)
 */
export async function fetchHoardTags(
  debts: ERPDebtRecord[],
  nameToTraderId: Map<string, number>
): Promise<Map<string, string>> {
  const hoardTagMap = new Map<string, string>();

  // 1. 如果原始记录已含 hoardTag，直接使用
  const needsApiFetch: string[] = [];
  let hasViewHoardTag = false;

  for (const debt of debts) {
    if (debt.hoardTag) {
      hoardTagMap.set(debt.billId, debt.hoardTag);
      hasViewHoardTag = true;
    } else {
      needsApiFetch.push(debt.billId);
    }
  }

  // 如果所有记录都从视图获取到了 hoardTag，无需调 API
  if (needsApiFetch.length === 0 && hasViewHoardTag) {
    return hoardTagMap;
  }

  // 如果视图中没有任何 hoardTag 字段（全部为 undefined），需要从 API 获取
  // 如果部分有部分没有，也需要补充缺失的
  if (!hasViewHoardTag || needsApiFetch.length > 0) {
    // 按客户分组获取结算单 hoardTag
    const debtsByConsumer = new Map<string, ERPDebtRecord[]>();
    for (const debt of debts) {
      if (!debt.hoardTag) {
        const existing = debtsByConsumer.get(debt.consumerName) || [];
        existing.push(debt);
        debtsByConsumer.set(debt.consumerName, existing);
      }
    }

    // 并行获取各客户的结算单（限制并发数）
    const CONCURRENCY_LIMIT = 5;
    const entries = Array.from(debtsByConsumer.entries());
    const _results = await parallelMap(
      entries,
      CONCURRENCY_LIMIT,
      async ([consumerName, consumerDebts]) => {
        const traderId = nameToTraderId.get(consumerName);
        if (!traderId) return;

        // 检查缓存
        const cacheKey = `${CACHE_KEY_SETTLEMENT_HOARD}:${traderId}`;
        const cached = cache.get<Map<string, string>>(cacheKey);

        if (cached) {
          // 从缓存中匹配 billId
          for (const debt of consumerDebts) {
            const tag = cached.get(debt.billId);
            if (tag) hoardTagMap.set(debt.billId, tag);
          }
          return;
        }

        try {
          const orders = await searchErpSettlementOrders({ traderId });

          // 构建 billId → hoardTag 映射
          const orderHoardMap = new Map<string, string>();
          let missingHoardFieldCount = 0;
          for (const order of orders) {
            // 结算单 API 返回的字段名为 hoardTag（英文值 'NORMAL'/'HOARD'）
            // 欠款明细 API 返回的字段名为 isHoard（中文值 '是'/'否'），两者不同
            const orderRaw = order as Record<string, unknown>;
            const rawTag = (orderRaw.hoardTag ?? orderRaw.isHoard) as string | undefined;
            if (!rawTag) {
              missingHoardFieldCount++;
              continue;
            }
            // 兼容两种值格式：中文('是'/'否') 和英文('HOARD'/'NORMAL')
            const tag = rawTag === '是' ? 'HOARD' : rawTag === '否' ? 'NORMAL' : rawTag;
            orderHoardMap.set(String(order.id), tag);
            // 也用 bizStr（结算单号）匹配
            if (order.bizStr) {
              orderHoardMap.set(order.bizStr, tag);
            }
          }
          if (missingHoardFieldCount > 0) {
            log.warn(
              `客户(traderId=${traderId}) ${missingHoardFieldCount}/${orders.length} 条结算单缺少 hoardTag/isHoard 字段`
            );
          }

          // 缓存该客户的结算单 hoardTag 映射
          cache.set(cacheKey, orderHoardMap, CACHE_TTL.LOW_FREQUENCY);

          // 匹配 billId
          for (const debt of consumerDebts) {
            const tag = orderHoardMap.get(debt.billId);
            if (tag) hoardTagMap.set(debt.billId, tag);
          }
        } catch (error) {
          log.error(`获取客户 ${consumerName}(traderId=${traderId}) 结算单失败:`, error);
          // 容错：该客户的 hoardTag 保持未知，不影响其他客户
        }
      }
    );
  }

  return hoardTagMap;
}

/**
 * 解析单条欠款的 hoardTag
 * 优先使用映射中的值，其次使用原始记录中的值，最后为 null
 */
function resolveHoardTag(
  debt: ERPDebtRecord,
  hoardTagMap: Map<string, string>
): typeof AR_HOARD_TAG_NORMAL | typeof AR_HOARD_TAG_HOARD | null {
  const tag = hoardTagMap.get(debt.billId) || debt.hoardTag;
  if (tag === AR_HOARD_TAG_HOARD || tag === AR_HOARD_TAG_NORMAL) return tag;
  return null;
}

// ============================================
// Hold 元数据获取
// ============================================

/** hold 元数据（来自本地 ar_collection_details） */
interface HoldMeta {
  holdType: ArHoldType;
  holdUntil: string | null;
}

/**
 * 获取 billId → hold 元数据映射
 * 从本地 ar_collection_details 查询 hold_type 和 hold_until
 * 用于判断期限压单是否已到期
 */
async function fetchHoldExpiryState(debts: ERPDebtRecord[]): Promise<Map<string, HoldMeta>> {
  const holdExpiryMap = new Map<string, HoldMeta>();
  if (debts.length === 0) return holdExpiryMap;

  try {
    const billIds = debts.map(d => d.billId);
    const result = await appQuery<{
      erp_bill_id: string;
      hold_type: string;
      hold_until: string | null;
    }>(
      `SELECT erp_bill_id, hold_type, hold_until::text
       FROM ar_collection_details
       WHERE erp_bill_id = ANY($1)
         AND hold_type IS NOT NULL`,
      [billIds]
    );

    for (const row of result.rows) {
      holdExpiryMap.set(row.erp_bill_id, {
        holdType: row.hold_type as ArHoldType,
        holdUntil: row.hold_until,
      });
    }
  } catch (error) {
    log.error('获取hold元数据失败:', error);
    // 容错：holdExpiryMap 保持空，不影响主流程
  }

  return holdExpiryMap;
}

// ============================================
// 工具函数
// ============================================

/** 安全解析可能为字符串的数字，null/空字符串返回 null */
function parseNumberOrNull(value: string | undefined | null): number | null {
  if (value === undefined || value === null || value === '') return null;
  const num = Number(value);
  return isNaN(num) ? null : num;
}

/** 带并发限制的并行映射 */
async function parallelMap<T, R>(
  items: T[],
  concurrency: number,
  fn: (item: T) => Promise<R>
): Promise<R[]> {
  const results: R[] = [];
  let index = 0;

  async function worker(): Promise<void> {
    while (index < items.length) {
      const currentIndex = index++;
      const result = await fn(items[currentIndex]);
      results.push(result);
    }
  }

  const workers = Array.from({ length: Math.min(concurrency, items.length) }, () => worker());
  await Promise.all(workers);
  return results;
}
