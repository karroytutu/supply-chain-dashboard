/**
 * 目标管理 - 历史销售服务
 * 负责上月/上上月销售数据聚合、enrichWithHistoricalSales
 */

import { createLogger } from '../../utils/logger';
const log = createLogger('SalesTarget-Historical');

import { appQuery } from '../../db/appPool';
import { cache, CACHE_TTL } from '../../utils/cache';
import { SALES_BUSINESS_ATTR_IDS } from '../../utils/constants';
import { getMonthRange } from './sales-target-utils';
import { ERP_CACHE_PREFIX } from './cache-keys';
import type { HistoricalSalesDTO, TargetCustomerDTO } from './sales-target.types';

/**
 * 获取历史销售数据（上月 + 上上月），按 consumerId + goodsId 聚合
 */
export async function getHistoricalSales(
  year: number,
  month: number
): Promise<HistoricalSalesDTO[]> {
  const cacheKey = `${ERP_CACHE_PREFIX}:hist-sales:${year}:${month}`;
  const cached = cache.get<HistoricalSalesDTO[]>(cacheKey);
  if (cached) return cached;

  const [lastMonthStart, lastMonthEnd] = getMonthRange(year, month, 1);
  const [prevMonthStart, prevMonthEnd] = getMonthRange(year, month, 2);

  // SQL 层聚合（GROUP BY），避免将全量明细拉到应用层
  const aggSql = `SELECT consumer_id, consumer_name, goods_id, goods_name,
       SUM(finance_sales_amount::numeric) AS finance_sales_amount,
       SUM(finance_cost_amount::numeric) AS finance_cost_amount
  FROM erp_sales_details
  WHERE settle_time >= $1 AND settle_time < $2 AND business_attr = ANY($3)
  GROUP BY consumer_id, consumer_name, goods_id, goods_name`;

  const [lastMonthResult, prevMonthResult] = await Promise.all([
    appQuery(aggSql, [lastMonthStart, lastMonthEnd, SALES_BUSINESS_ATTR_IDS]),
    appQuery(aggSql, [prevMonthStart, prevMonthEnd, SALES_BUSINESS_ATTR_IDS]),
  ]);

  // 构建 prevMonth 查找 Map（consumer_id:goods_id -> amount）
  interface AggRow { consumerId: number; consumerName: string; goodsId: number; goodsName: string; amount: number; costAmount: number; }
  const prevMonthMap = new Map<string, AggRow>();
  for (const d of prevMonthResult.rows) {
    prevMonthMap.set(`${d.consumer_id}:${d.goods_id}`, {
      consumerId: d.consumer_id, consumerName: d.consumer_name,
      goodsId: d.goods_id, goodsName: d.goods_name,
      amount: parseFloat(d.finance_sales_amount) || 0,
      costAmount: parseFloat(d.finance_cost_amount) || 0,
    });
  }

  // 组装结果：上月数据 + 匹配上上月数据
  const result: HistoricalSalesDTO[] = [];
  for (const d of lastMonthResult.rows) {
    const amount = parseFloat(d.finance_sales_amount) || 0;
    const costAmount = parseFloat(d.finance_cost_amount) || 0;
    const prevKey = `${d.consumer_id}:${d.goods_id}`;
    const grossMarginRate = amount > 0 ? Math.round((amount - costAmount) / amount * 10000) / 10000 : 0;
    result.push({
      erp_consumer_id: d.consumer_id, consumer_name: d.consumer_name,
      erp_goods_id: d.goods_id, goods_name: d.goods_name,
      actual_amount_last_month: Math.round(amount * 100) / 100,
      actual_amount_prev_month: Math.round((prevMonthMap.get(prevKey)?.amount || 0) * 100) / 100,
      gross_margin_rate: grossMarginRate,
    });
  }

  // 预构建上月 key Set，避免 O(n*m) 线性扫描
  const lastMonthKeys = new Set(
    lastMonthResult.rows.map((d: Record<string, unknown>) => `${d.consumer_id}:${d.goods_id}`)
  );

  // 补充仅在上上月有销售、上月无销售的记录
  for (const [key, v] of prevMonthMap) {
    if (!lastMonthKeys.has(key)) {
      result.push({
        erp_consumer_id: v.consumerId, consumer_name: v.consumerName,
        erp_goods_id: v.goodsId, goods_name: v.goodsName,
        actual_amount_last_month: 0,
        actual_amount_prev_month: Math.round(v.amount * 100) / 100,
        gross_margin_rate: 0,
      });
    }
  }

  cache.set(cacheKey, result, CACHE_TTL.DASHBOARD);
  return result;
}

/**
 * 将 ERP 历史销售数据合并到客户树的商品行和品类汇总中
 * 失败时不抛出异常，商品行保留原有 actual 值
 */
export async function enrichWithHistoricalSales(
  customers: TargetCustomerDTO[],
  year: number,
  month: number,
): Promise<void> {
  const histMap = new Map<string, { last: number; prev: number; marginRate: number }>();
  try {
    const historicalSales = await getHistoricalSales(year, month);
    for (const h of historicalSales) {
      histMap.set(`${h.erp_consumer_id}:${h.erp_goods_id}`, {
        last: h.actual_amount_last_month,
        prev: h.actual_amount_prev_month,
        marginRate: h.gross_margin_rate,
      });
    }
  } catch (err) {
    log.warn('历史销售数据加载失败，actual 字段将保留默认值:', err);
    return;
  }
  for (const customer of customers) {
    for (const cat of customer.categories) {
      let catLast = 0, catPrev = 0;
      for (const prod of cat.products) {
        const key = `${customer.erp_consumer_id}:${prod.erp_goods_id}`;
        const hist = histMap.get(key);
        if (hist) {
          prod.actual_amount_last_month = hist.last;
          prod.actual_amount_prev_month = hist.prev;
          prod.gross_margin_rate = hist.marginRate;
        }
        catLast += prod.actual_amount_last_month;
        catPrev += prod.actual_amount_prev_month;
      }
      cat.actual_amount_last_month = Math.round(catLast * 100) / 100;
      cat.actual_amount_prev_month = Math.round(catPrev * 100) / 100;
    }
  }
}
