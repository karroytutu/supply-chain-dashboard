/**
 * 目标管理 - 概览汇总服务
 * 计算全部营销师的目标概览（目标总额、客户数、SKU数、毛利、提成）
 */

import { cache, CACHE_TTL } from '../../utils/cache';
import {
  SALES_BUSINESS_ATTR_IDS,
  COMMISSION_RATE_INCREMENT,
  COMMISSION_RATE_BASE,
  COMMISSION_RATE_LOW,
  COMMISSION_BASELINE_THRESHOLD,
} from '../../utils/constants';
import { ERP_CACHE_PREFIX } from './cache-keys';
import { searchErpCustomers } from '../erp-client/erp-customer.service';
import { getErpStaff } from '../fixed-asset/fixed-asset.query';
import { getMarketerUsers, getMonthRange } from './sales-target-utils';
import { listTargets, getTargetItemsByTargetIds } from './sales-target.repository';
import { getMarginRatesByConsumerGoods, getConsumerAggregation } from '../erp-client/erp-sales-aggregation.service';
import type { OverviewDTO, MarketerOverviewDTO, TargetApprovalStatus, StaffSales, SavedTargetInfo } from './sales-target.types';

/** 计算提成（与前端 calcCommission 逻辑一致） */
function calcCommission(
  estimatedGrossProfit: number,
  lastMonthGrossProfit: number,
): { baseCommission: number; incrementCommission: number } {
  const baseline = lastMonthGrossProfit;
  const profit = estimatedGrossProfit;
  if (baseline <= 0) {
    return { baseCommission: 0, incrementCommission: Math.round(profit * COMMISSION_RATE_INCREMENT * 100) / 100 };
  }
  if (profit >= baseline) {
    return {
      baseCommission: Math.round(baseline * COMMISSION_RATE_BASE * 100) / 100,
      incrementCommission: Math.round((profit - baseline) * COMMISSION_RATE_INCREMENT * 100) / 100,
    };
  }
  if (profit >= baseline * COMMISSION_BASELINE_THRESHOLD) {
    return { baseCommission: Math.round(profit * COMMISSION_RATE_BASE * 100) / 100, incrementCommission: 0 };
  }
  return { baseCommission: Math.round(profit * COMMISSION_RATE_LOW * 100) / 100, incrementCommission: 0 };
}

/**
 * 获取概览汇总数据（全部营销师的目标概览）
 */
export async function getOverviewData(year: number, month: number): Promise<OverviewDTO> {
  const cacheKey = `${ERP_CACHE_PREFIX}:overview:${year}:${month}`;
  const cached = cache.get<OverviewDTO>(cacheKey);
  if (cached) return cached;

  // 上月日期范围（同步计算）
  const [lastMonthStart, lastMonthEnd] = getMonthRange(year, month, 1);

  // 并行执行无数据依赖的查询
  const [marketers, erpStaff, marginRows, consumerAggRows, allCustomers, allTargets] = await Promise.all([
    getMarketerUsers(),
    getErpStaff(),
    getMarginRatesByConsumerGoods(lastMonthStart, lastMonthEnd, SALES_BUSINESS_ATTR_IDS),
    getConsumerAggregation(lastMonthStart, lastMonthEnd, SALES_BUSINESS_ATTR_IDS),
    searchErpCustomers(),
    listTargets({ year, month }),
  ]);

  // 建立 userId → staffId 映射
  const userToStaffMap = new Map<number, number>();
  for (const m of marketers) {
    const matched = erpStaff.find(s => s.name === m.name);
    if (matched) userToStaffMap.set(m.id, matched.id as number);
  }

  // 毛利率 Map: consumer_id + goods_id → marginRate
  const marginRateMap = new Map<string, number>();
  for (const d of marginRows) {
    const amount = parseFloat(d.total_amount) || 0;
    const costAmount = parseFloat(d.total_cost) || 0;
    const rate = amount > 0 ? Math.round((amount - costAmount) / amount * 10000) / 10000 : 0;
    marginRateMap.set(`${d.consumer_id}:${d.goods_id}`, rate);
  }

  // 按 consumerManagerId 映射到 staffId
  const consumerToManagerStaffId = new Map<number, number>();
  for (const c of allCustomers) {
    const mgrId = c.consumerManagerId ?? null;
    if (mgrId !== null) consumerToManagerStaffId.set(c.id, mgrId);
  }

  const staffSalesMap = new Map<number, StaffSales>();

  for (const d of consumerAggRows) {
    const staffId = consumerToManagerStaffId.get(d.consumer_id);
    if (staffId === undefined) continue;
    const amount = parseFloat(d.total_amount) || 0;
    const costAmount = parseFloat(d.total_cost) || 0;
    const categories = new Set<string>(d.categories || []);
    let entry = staffSalesMap.get(staffId);
    if (!entry) {
      entry = { amount: 0, costAmount: 0, customerCount: 0, goodsIds: new Set(), categoryNames: new Set() };
      staffSalesMap.set(staffId, entry);
    }
    entry.amount += amount;
    entry.costAmount += costAmount;
    entry.customerCount++;
    const goodsIds = new Set<number>((d.goods_ids || []).map(Number));
    for (const gid of goodsIds) entry.goodsIds.add(gid);
    for (const cat of categories) entry.categoryNames.add(cat);
  }

  // 筛选 approved 目标用于汇总计算
  const statusByMarketer = new Map<number, string>();
  for (const t of allTargets) {
    statusByMarketer.set(t.marketer_id, t.status);
  }
  const savedTargets = allTargets.filter(t => t.status === 'approved');
  const allTargetIds = savedTargets.map(t => t.id);
  const itemsByTargetId = await getTargetItemsByTargetIds(allTargetIds);

  const savedTargetMap = new Map<number, SavedTargetInfo>();
  for (const t of savedTargets) {
    const items = itemsByTargetId.get(t.id) || [];
    const info: SavedTargetInfo = {
      totalAmount: 0, customerIds: new Set(), skuIds: new Set(),
      categoryNames: new Set(), estimatedGrossProfit: 0,
    };
    for (const item of items) {
      const amt = Number(item.target_amount) || 0;
      info.totalAmount += amt;
      if (item.erp_consumer_id) info.customerIds.add(item.erp_consumer_id);
      if (item.erp_goods_id) info.skuIds.add(item.erp_goods_id);
      if (item.category_name) info.categoryNames.add(item.category_name);
      const rateKey = `${item.erp_consumer_id}:${item.erp_goods_id}`;
      const rate = marginRateMap.get(rateKey) || 0;
      info.estimatedGrossProfit += amt * rate;
    }
    info.totalAmount = Math.round(info.totalAmount * 100) / 100;
    info.estimatedGrossProfit = Math.round(info.estimatedGrossProfit * 100) / 100;
    savedTargetMap.set(t.marketer_id, info);
  }

  // 6. 组装营销师维度明细
  let totalTarget = 0, totalLastMonthActual = 0, marketersWithTarget = 0;
  let sumTargetCustomerCount = 0, sumLastMonthCustomerCount = 0;
  let sumTargetSkuCount = 0, sumLastMonthSkuCount = 0;
  let sumTargetCategoryCount = 0, sumLastMonthCategoryCount = 0;
  let sumEstimatedGrossProfit = 0, sumBaseCommission = 0, sumIncrementCommission = 0;

  const marketerOverviews: MarketerOverviewDTO[] = marketers.map(m => {
    const staffId = userToStaffMap.get(m.id);
    const saved = savedTargetMap.get(m.id);
    const salesEntry = staffId !== undefined ? staffSalesMap.get(staffId) : undefined;

    const targetAmount = saved ? saved.totalAmount : 0;
    const lastMonthActual = salesEntry ? Math.round(salesEntry.amount * 100) / 100 : 0;
    // growthRate 仅基于 approved 目标计算（saved 来自 approved 目标 Map）
    const growthRate = saved !== undefined && lastMonthActual > 0
      ? Math.round((targetAmount - lastMonthActual) / lastMonthActual * 10000) / 10000
      : null;

    const customerCount = saved ? saved.customerIds.size : 0;
    const skuCount = saved ? saved.skuIds.size : 0;
    const categoryCount = saved ? saved.categoryNames.size : 0;
    const avgCustomerValue = customerCount > 0 ? Math.round(targetAmount / customerCount * 100) / 100 : 0;

    const lastMonthCustomerCount = salesEntry ? salesEntry.customerCount : 0;
    const lastMonthSkuCount = salesEntry ? salesEntry.goodsIds.size : 0;
    const lastMonthCategoryCount = salesEntry ? salesEntry.categoryNames.size : 0;
    const lastMonthAvgCustomerValue = lastMonthCustomerCount > 0
      ? Math.round(lastMonthActual / lastMonthCustomerCount * 100) / 100 : 0;

    const estimatedGrossProfit = saved ? saved.estimatedGrossProfit : 0;
    const lastMonthGrossProfit = salesEntry
      ? Math.round((salesEntry.amount - salesEntry.costAmount) * 100) / 100 : 0;
    const commission = calcCommission(estimatedGrossProfit, lastMonthGrossProfit);

    // hasSaved 基于是否存在任何目标记录（不限状态），避免草稿/审批中目标显示 '-' 与冲突状态
    const anyTargetStatus = statusByMarketer.has(m.id);
    if (anyTargetStatus) {
      totalTarget += targetAmount;
      marketersWithTarget++;
      sumTargetCustomerCount += customerCount;
      sumTargetSkuCount += skuCount;
      sumTargetCategoryCount += categoryCount;
      sumEstimatedGrossProfit += estimatedGrossProfit;
      sumBaseCommission += commission.baseCommission;
      sumIncrementCommission += commission.incrementCommission;
    }
    totalLastMonthActual += lastMonthActual;
    sumLastMonthCustomerCount += lastMonthCustomerCount;
    sumLastMonthSkuCount += lastMonthSkuCount;
    sumLastMonthCategoryCount += lastMonthCategoryCount;

    return {
      id: m.id, name: m.name,
      target_amount: targetAmount, last_month_actual: lastMonthActual,
      growth_rate: growthRate, has_saved: anyTargetStatus,
      target_status: (statusByMarketer.get(m.id) as TargetApprovalStatus | undefined) || null,
      customer_count: customerCount, last_month_customer_count: lastMonthCustomerCount,
      sku_count: skuCount, last_month_sku_count: lastMonthSkuCount,
      category_count: categoryCount, last_month_category_count: lastMonthCategoryCount,
      avg_customer_value: avgCustomerValue, last_month_avg_customer_value: lastMonthAvgCustomerValue,
      estimated_gross_profit: estimatedGrossProfit, last_month_gross_profit: lastMonthGrossProfit,
      base_commission: commission.baseCommission,
      increment_commission: commission.incrementCommission,
    };
  });

  marketerOverviews.sort((a, b) => b.last_month_actual - a.last_month_actual);

  const globalGrowthRate = marketersWithTarget > 0 && totalLastMonthActual > 0
    ? Math.round((totalTarget - totalLastMonthActual) / totalLastMonthActual * 10000) / 10000
    : null;
  const globalAvgCustomerValue = sumTargetCustomerCount > 0
    ? Math.round(totalTarget / sumTargetCustomerCount * 100) / 100 : 0;
  const globalLastMonthAvgCustomerValue = sumLastMonthCustomerCount > 0
    ? Math.round(totalLastMonthActual / sumLastMonthCustomerCount * 100) / 100 : 0;

  const result: OverviewDTO = {
    summary: {
      total_target: Math.round(totalTarget * 100) / 100,
      total_last_month_actual: Math.round(totalLastMonthActual * 100) / 100,
      growth_rate: globalGrowthRate,
      marketer_count: marketers.length,
      marketers_with_target: marketersWithTarget,
      target_customer_count: sumTargetCustomerCount,
      last_month_customer_count: sumLastMonthCustomerCount,
      target_sku_count: sumTargetSkuCount,
      last_month_sku_count: sumLastMonthSkuCount,
      target_category_count: sumTargetCategoryCount,
      last_month_category_count: sumLastMonthCategoryCount,
      avg_customer_value: globalAvgCustomerValue,
      last_month_avg_customer_value: globalLastMonthAvgCustomerValue,
      total_estimated_gross_profit: Math.round(sumEstimatedGrossProfit * 100) / 100,
      total_base_commission: Math.round(sumBaseCommission * 100) / 100,
      total_increment_commission: Math.round(sumIncrementCommission * 100) / 100,
    },
    marketers: marketerOverviews,
  };

  cache.set(cacheKey, result, CACHE_TTL.DASHBOARD);
  return result;
}
