/**
 * 目标管理 - ERP 数据编排服务
 * 负责客户归属、公海判定、历史销售聚合、商品品类目录
 */

import { createLogger } from '../../utils/logger';
const log = createLogger('SalesTarget-ERP');

import { searchErpCustomers } from '../erp-client/erp-customer.service';
import { fetchAllProducts } from '../erp-client/erp-product.service';
import { getErpStaff } from '../fixed-asset/fixed-asset.query';
import { appQuery } from '../../db/appPool';
import { cache, CACHE_TTL } from '../../utils/cache';
import { ROLE_CODES, SALES_BUSINESS_ATTR_IDS } from '../../utils/constants';
import type {
  CustomerListDTO,
  ProductCatalogDTO,
  HistoricalSalesDTO,
  InitDataDTO,
  TargetCustomerDTO,
  TargetCategoryDTO,
  TargetProductDTO,
  OverviewDTO,
  MarketerOverviewDTO,
} from './sales-target.types';
import { listTargets, getTargetItems } from './sales-target.repository';

const CACHE_PREFIX = 'sales:target:erp';

/**
 * 获取系统内 marketer 角色用户的 ERP staff ID 集合
 * 逻辑：查 users 表 marketer 角色 → 取姓名 → 匹配 ERP staff 列表 → 返回 staff ID Set
 */
export async function getMarketerErpStaffIds(): Promise<Set<number>> {
  const cacheKey = `${CACHE_PREFIX}:marketer-staff-ids`;
  const cached = cache.get<Set<number>>(cacheKey);
  if (cached) return cached;

  // 1. 查询系统内 marketer 角色的用户姓名
  const result = await appQuery(
    `SELECT u.name
     FROM users u
     JOIN user_roles ur ON ur.user_id = u.id
     JOIN roles r ON r.id = ur.role_id
     WHERE r.code = $1 AND u.status = 1`,
    [ROLE_CODES.MARKETER]
  );
  const marketerNames = new Set(result.rows.map((r: { name: string }) => r.name));

  if (marketerNames.size === 0) {
    const empty = new Set<number>();
    cache.set(cacheKey, empty, CACHE_TTL.LOW_FREQUENCY);
    return empty;
  }

  // 2. 获取 ERP 员工列表，按姓名匹配
  const erpStaff = await getErpStaff();
  const staffIds = new Set<number>();
  for (const staff of erpStaff) {
    if (marketerNames.has(staff.name)) {
      staffIds.add(staff.id as number);
    }
  }

  cache.set(cacheKey, staffIds, CACHE_TTL.LOW_FREQUENCY);
  return staffIds;
}

/**
 * 获取当前营销师的 ERP staff ID
 */
export async function getMarketerStaffId(marketerUserId: number): Promise<number | null> {
  // 查姓名
  const userResult = await appQuery('SELECT name FROM users WHERE id = $1', [marketerUserId]);
  if (userResult.rows.length === 0) return null;
  const name = userResult.rows[0].name;

  // 匹配 ERP staff
  const erpStaff = await getErpStaff();
  const matched = erpStaff.find(s => s.name === name);
  return matched ? (matched.id as number) : null;
}

/**
 * 获取客户列表（我的客户 + 公海客户标记）
 * @param currentMarketerStaffId 当前营销师的 ERP staff ID
 * @param marketerErpStaffIds 系统内所有营销师的 ERP staff ID 集合
 */
export async function getCustomerList(
  currentMarketerStaffId: number | null,
  marketerErpStaffIds: Set<number>
): Promise<CustomerListDTO[]> {
  const cacheKey = `${CACHE_PREFIX}:customer-list:${currentMarketerStaffId}`;
  const cached = cache.get<CustomerListDTO[]>(cacheKey);
  if (cached) return cached;

  const allCustomers = await searchErpCustomers();

  const result: CustomerListDTO[] = [];
  for (const c of allCustomers) {
    const raw = c as Record<string, unknown>;
    const managerId = typeof raw.consumerManagerId === 'number' ? raw.consumerManagerId : null;
    const managerName = typeof raw.consumerManagerName === 'string' ? raw.consumerManagerName : null;

    // 公海判定：consumerManagerId 为空，或不属于系统内任何 marketer
    const isPublicSea = managerId === null || !marketerErpStaffIds.has(managerId);

    result.push({
      erp_consumer_id: c.id,
      consumer_name: c.name,
      consumer_manager_name: managerName || null,
      is_public_sea: isPublicSea,
    });
  }

  cache.set(cacheKey, result, CACHE_TTL.DASHBOARD);
  return result;
}

/**
 * 获取 ERP 商品目录（按品类分组）
 */
export async function getProductCatalog(): Promise<ProductCatalogDTO[]> {
  const cacheKey = `${CACHE_PREFIX}:product-catalog`;
  const cached = cache.get<ProductCatalogDTO[]>(cacheKey);
  if (cached) return cached;

  const products = await fetchAllProducts();

  // 按 categoryChainName 分组
  const categoryMap = new Map<string, ProductCatalogDTO>();
  for (const p of products) {
    const catName = p.categoryChainName || '未分类';
    if (!categoryMap.has(catName)) {
      categoryMap.set(catName, { category_name: catName, products: [] });
    }
    categoryMap.get(catName)!.products.push({
      erp_goods_id: p.goodsId,
      goods_name: p.name,
      unit: p.pkgUnitName || p.baseUnitName,
      unit_price: p.pkgWholesale ?? p.baseWholesale ?? null,
      brand_name: p.brandName || null,
    });
  }

  const result = Array.from(categoryMap.values()).sort((a, b) =>
    a.category_name.localeCompare(b.category_name)
  );

  cache.set(cacheKey, result, CACHE_TTL.LOW_FREQUENCY);
  return result;
}

/**
 * 获取历史销售数据（上月 + 上上月），按 consumerId + goodsId 聚合 financeSalesAmount
 * @param year 目标年份
 * @param month 目标月份
 */
export async function getHistoricalSales(
  year: number,
  month: number
): Promise<HistoricalSalesDTO[]> {
  const cacheKey = `${CACHE_PREFIX}:hist-sales:${year}:${month}`;
  const cached = cache.get<HistoricalSalesDTO[]>(cacheKey);
  if (cached) return cached;

  // 上月日期范围
  const lastMonthDate = new Date(year, month - 2, 1); // month is 1-based, so month-2 = last month index
  const lastMonthStart = formatDate(lastMonthDate);
  const lastMonthEnd = formatDate(new Date(lastMonthDate.getFullYear(), lastMonthDate.getMonth() + 2, 1));

  // 上上月日期范围
  const prevMonthDate = new Date(year, month - 3, 1);
  const prevMonthStart = formatDate(prevMonthDate);
  const prevMonthEnd = formatDate(new Date(prevMonthDate.getFullYear(), prevMonthDate.getMonth() + 2, 1));

  // 从本地表并行拉取两个月数据（只查需要的列 + 按销售类业务类型过滤）
  const salesColumns = 'consumer_id, consumer_name, goods_id, goods_name, finance_sales_amount';
  const [lastMonthResult, prevMonthResult] = await Promise.all([
    appQuery(
      `SELECT ${salesColumns} FROM erp_sales_details WHERE settle_time >= $1 AND settle_time < $2 AND business_attr = ANY($3)`,
      [lastMonthStart, lastMonthEnd, SALES_BUSINESS_ATTR_IDS]
    ),
    appQuery(
      `SELECT ${salesColumns} FROM erp_sales_details WHERE settle_time >= $1 AND settle_time < $2 AND business_attr = ANY($3)`,
      [prevMonthStart, prevMonthEnd, SALES_BUSINESS_ATTR_IDS]
    ),
  ]);
  const lastMonthDetails = lastMonthResult.rows;
  const prevMonthDetails = prevMonthResult.rows;

  // 聚合上月: consumer_id + goods_id → sum(finance_sales_amount)
  const lastMonthMap = new Map<string, { consumerId: number; consumerName: string; goodsId: number; goodsName: string; amount: number }>();
  for (const d of lastMonthDetails) {
    const key = `${d.consumer_id}:${d.goods_id}`;
    const existing = lastMonthMap.get(key);
    const amount = parseFloat(d.finance_sales_amount) || 0;
    if (existing) {
      existing.amount += amount;
    } else {
      lastMonthMap.set(key, {
        consumerId: d.consumer_id,
        consumerName: d.consumer_name,
        goodsId: d.goods_id,
        goodsName: d.goods_name,
        amount,
      });
    }
  }

  // 聚合上上月（与 lastMonthMap 对称，存储元数据 + 金额）
  const prevMonthMap = new Map<string, { consumerId: number; consumerName: string; goodsId: number; goodsName: string; amount: number }>();
  for (const d of prevMonthDetails) {
    const key = `${d.consumer_id}:${d.goods_id}`;
    const existing = prevMonthMap.get(key);
    const amount = parseFloat(d.finance_sales_amount) || 0;
    if (existing) {
      existing.amount += amount;
    } else {
      prevMonthMap.set(key, {
        consumerId: d.consumer_id,
        consumerName: d.consumer_name,
        goodsId: d.goods_id,
        goodsName: d.goods_name,
        amount,
      });
    }
  }

  // 合并结果
  const result: HistoricalSalesDTO[] = [];
  for (const [, v] of lastMonthMap) {
    const prevKey = `${v.consumerId}:${v.goodsId}`;
    result.push({
      erp_consumer_id: v.consumerId,
      consumer_name: v.consumerName,
      erp_goods_id: v.goodsId,
      goods_name: v.goodsName,
      actual_amount_last_month: Math.round(v.amount * 100) / 100,
      actual_amount_prev_month: Math.round((prevMonthMap.get(prevKey)?.amount || 0) * 100) / 100,
    });
  }

  // 补充上上月有但上月没有的记录（遍历聚合后的 Map，避免 O(N^2) 和单行金额错误）
  for (const [key, v] of prevMonthMap) {
    if (!lastMonthMap.has(key)) {
      result.push({
        erp_consumer_id: v.consumerId,
        consumer_name: v.consumerName,
        erp_goods_id: v.goodsId,
        goods_name: v.goodsName,
        actual_amount_last_month: 0,
        actual_amount_prev_month: Math.round(v.amount * 100) / 100,
      });
    }
  }

  cache.set(cacheKey, result, CACHE_TTL.DASHBOARD);
  return result;
}

/**
 * 构建初始化目标数据（从 ERP 上月销售明细构建）
 * 当指定营销师+月份无已保存的目标记录时调用
 */
export async function buildInitialTargetData(
  marketerUserId: number,
  year: number,
  month: number,
): Promise<InitDataDTO> {
  // 1. 获取营销师姓名
  const userResult = await appQuery('SELECT name FROM users WHERE id = $1', [marketerUserId]);
  if (userResult.rows.length === 0) {
    throw new Error('营销师不存在');
  }
  const marketerName = userResult.rows[0].name;

  // 2. 获取营销师 ERP staff ID
  const staffId = await getMarketerStaffId(marketerUserId);

  // 3. 获取所有 ERP 客户，筛选该营销师名下的
  const allCustomers = await searchErpCustomers();
  const myCustomerMap = new Map<number, string>();
  for (const c of allCustomers) {
    const raw = c as Record<string, unknown>;
    const mgrId = typeof raw.consumerManagerId === 'number' ? raw.consumerManagerId : null;
    if (staffId !== null && mgrId === staffId) {
      myCustomerMap.set(c.id, c.name);
    }
  }

  // 4. 从本地表拉取上月销售明细
  const lastMonthDate = new Date(year, month - 2, 1); // month 1-based
  const lastMonthStart = formatDate(lastMonthDate);
  const lastMonthEnd = formatDate(new Date(lastMonthDate.getFullYear(), lastMonthDate.getMonth() + 2, 1));

  const salesResult = await appQuery(
    'SELECT consumer_id, consumer_name, goods_id, goods_name, finance_sales_amount, category_name FROM erp_sales_details WHERE settle_time >= $1 AND settle_time < $2 AND business_attr = ANY($3)',
    [lastMonthStart, lastMonthEnd, SALES_BUSINESS_ATTR_IDS]
  );
  const salesDetails = salesResult.rows;

  // 5. 按客户→品类→商品聚合，仅保留该营销师的客户
  const customerDataMap = new Map<number, {
    consumer_name: string;
    categoryMap: Map<string, {
      category_name: string;
      productMap: Map<number, {
        goods_name: string;
        category_name: string;
        amount: number;
      }>;
    }>;
  }>();

  for (const d of salesDetails) {
    if (!myCustomerMap.has(d.consumer_id)) continue;

    let customerData = customerDataMap.get(d.consumer_id);
    if (!customerData) {
      customerData = { consumer_name: d.consumer_name, categoryMap: new Map() };
      customerDataMap.set(d.consumer_id, customerData);
    }

    const catName = d.category_name || '未分类';
    let categoryData = customerData.categoryMap.get(catName);
    if (!categoryData) {
      categoryData = { category_name: catName, productMap: new Map() };
      customerData.categoryMap.set(catName, categoryData);
    }

    const existing = categoryData.productMap.get(d.goods_id);
    const amount = parseFloat(d.finance_sales_amount) || 0;
    if (existing) {
      existing.amount += amount;
    } else {
      categoryData.productMap.set(d.goods_id, {
        goods_name: d.goods_name,
        category_name: catName,
        amount,
      });
    }
  }

  // 6. 转为 DTO 结构
  const customers: TargetCustomerDTO[] = [];
  for (const [consumerId, custData] of customerDataMap) {
    const categories: TargetCategoryDTO[] = [];
    for (const [, catData] of custData.categoryMap) {
      const products: TargetProductDTO[] = [];
      let catActualTotal = 0;
      for (const [goodsId, prodData] of catData.productMap) {
        const rounded = Math.round(prodData.amount * 100) / 100;
        catActualTotal += rounded;
        products.push({
          erp_goods_id: goodsId,
          goods_name: prodData.goods_name,
          unit: null,
          unit_price: null,
          target_amount: rounded,  // 默认目标 = 上月实际达成
          remark: '',
          actual_amount_last_month: rounded,
          actual_amount_prev_month: 0,
        });
      }
      categories.push({
        category_name: catData.category_name,
        target_amount: Math.round(catActualTotal * 100) / 100,  // 默认目标 = 上月实际达成
        actual_amount_last_month: Math.round(catActualTotal * 100) / 100,
        actual_amount_prev_month: 0,
        products,
      });
    }
    customers.push({
      erp_consumer_id: consumerId,
      consumer_name: custData.consumer_name,
      is_planned_new: false,
      categories,
    });
  }

  return {
    is_saved: false,
    target_id: null,
    marketer_id: marketerUserId,
    marketer_name: marketerName,
    year,
    month,
    customers,
  };
}

/**
 * 获取概览汇总数据（全部营销师的目标概览）
 * 1. 查系统内所有营销师用户
 * 2. 查该月已保存的目标汇总
 * 3. 拉取上月 ERP 销售明细，按营销师聚合
 */
export async function getOverviewData(
  year: number,
  month: number,
): Promise<OverviewDTO> {
  const cacheKey = `${CACHE_PREFIX}:overview:${year}:${month}`;
  const cached = cache.get<OverviewDTO>(cacheKey);
  if (cached) return cached;

  // 1. 查所有营销师用户
  const marketerResult = await appQuery(
    `SELECT u.id, u.name
     FROM users u
     JOIN user_roles ur ON ur.user_id = u.id
     JOIN roles r ON r.id = ur.role_id
     WHERE r.code = $1 AND u.status = 1
     ORDER BY u.name`,
    [ROLE_CODES.MARKETER]
  );
  const marketers: Array<{ id: number; name: string }> = marketerResult.rows;

  // 2. 查该月已保存的目标（含明细，计算 targetAmount 总和）
  const savedTargets = await listTargets({ year, month });
  const savedTargetMap = new Map<number, { targetId: number; totalAmount: number }>();
  for (const t of savedTargets) {
    const items = await getTargetItems(t.id);
    const totalAmount = items.reduce((sum, item) => sum + (Number(item.target_amount) || 0), 0);
    savedTargetMap.set(t.marketer_id, { targetId: t.id, totalAmount });
  }

  // 3. 获取 ERP staff 列表，建立 userId → staffId 的映射
  const erpStaff = await getErpStaff();
  const userToStaffMap = new Map<number, number>();
  for (const m of marketers) {
    const matched = erpStaff.find(s => s.name === m.name);
    if (matched) {
      userToStaffMap.set(m.id, matched.id as number);
    }
  }

  // 4. 从本地表拉取上月销售明细，按营销师聚合
  const lastMonthDate = new Date(year, month - 2, 1);
  const lastMonthStart = formatDate(lastMonthDate);
  const lastMonthEnd = formatDate(new Date(lastMonthDate.getFullYear(), lastMonthDate.getMonth() + 2, 1));
  const salesResult = await appQuery(
    'SELECT consumer_id, finance_sales_amount FROM erp_sales_details WHERE settle_time >= $1 AND settle_time < $2 AND business_attr = ANY($3)',
    [lastMonthStart, lastMonthEnd, SALES_BUSINESS_ATTR_IDS]
  );
  const salesDetails = salesResult.rows;

  // 按 consumerManagerId 聚合销售额
  const allCustomers = await searchErpCustomers();
  const consumerToManagerStaffId = new Map<number, number>();
  for (const c of allCustomers) {
    const raw = c as Record<string, unknown>;
    const mgrId = typeof raw.consumerManagerId === 'number' ? raw.consumerManagerId : null;
    if (mgrId !== null) {
      consumerToManagerStaffId.set(c.id, mgrId);
    }
  }

  // staffId → { amount, customerIds }
  const staffSalesMap = new Map<number, { amount: number; customerIds: Set<number> }>();
  for (const d of salesDetails) {
    const staffId = consumerToManagerStaffId.get(d.consumer_id);
    if (staffId === undefined) continue;
    let entry = staffSalesMap.get(staffId);
    if (!entry) {
      entry = { amount: 0, customerIds: new Set() };
      staffSalesMap.set(staffId, entry);
    }
    entry.amount += parseFloat(d.finance_sales_amount) || 0;
    entry.customerIds.add(d.consumer_id);
  }

  // 5. 组装营销师维度明细
  let totalTarget = 0;
  let totalLastMonthActual = 0;
  let marketersWithTarget = 0;

  const marketerOverviews: MarketerOverviewDTO[] = marketers.map(m => {
    const staffId = userToStaffMap.get(m.id);
    const saved = savedTargetMap.get(m.id);
    const salesEntry = staffId !== undefined ? staffSalesMap.get(staffId) : undefined;

    const targetAmount = saved ? Math.round(saved.totalAmount * 100) / 100 : 0;
    const lastMonthActual = salesEntry ? Math.round(salesEntry.amount * 100) / 100 : 0;
    const customerCount = salesEntry ? salesEntry.customerIds.size : 0;
    const hasSaved = !!saved;
    const growthRate = hasSaved && lastMonthActual > 0
      ? Math.round((targetAmount - lastMonthActual) / lastMonthActual * 10000) / 10000
      : null;

    if (hasSaved) {
      totalTarget += targetAmount;
      marketersWithTarget++;
    }
    totalLastMonthActual += lastMonthActual;

    return {
      id: m.id,
      name: m.name,
      targetAmount,
      lastMonthActual,
      growthRate,
      hasSaved,
      customerCount,
    };
  });

  // 按上月实际销售额降序排列
  marketerOverviews.sort((a, b) => b.lastMonthActual - a.lastMonthActual);

  const globalGrowthRate = marketersWithTarget > 0 && totalLastMonthActual > 0
    ? Math.round((totalTarget - totalLastMonthActual) / totalLastMonthActual * 10000) / 10000
    : null;

  const result: OverviewDTO = {
    summary: {
      totalTarget: Math.round(totalTarget * 100) / 100,
      totalLastMonthActual: Math.round(totalLastMonthActual * 100) / 100,
      growthRate: globalGrowthRate,
      marketerCount: marketers.length,
      marketersWithTarget,
    },
    marketers: marketerOverviews,
  };

  cache.set(cacheKey, result, CACHE_TTL.HIGH_FREQUENCY);
  return result;
}

/** 格式化为 YYYY-MM-DD */
function formatDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}
