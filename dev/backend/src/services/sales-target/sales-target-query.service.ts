/**
 * 目标管理 - 查询服务
 * 提供目标列表、详情、汇总等查询能力
 */

import { createLogger } from '../../utils/logger';
const log = createLogger('SalesTarget-Query');

import {
  listTargets,
  getTargetById,
  getTargetItems,
} from './sales-target.repository';
import type {
  TargetDetailDTO,
  TargetCustomerDTO,
  TargetCategoryDTO,
  TargetProductDTO,
  TargetListQuery,
  SalesTargetItem,
} from './sales-target.types';

/**
 * 查询目标列表
 */
export async function queryTargetList(query: TargetListQuery) {
  return listTargets(query);
}

/**
 * 查询目标详情（含客户→品类→商品树形结构）
 */
export async function queryTargetDetail(targetId: number): Promise<TargetDetailDTO | null> {
  const target = await getTargetById(targetId);
  if (!target) return null;

  const items = await getTargetItems(targetId);

  // 按客户→品类→商品组织树形结构
  const customers = buildCustomerTree(items);

  return {
    id: target.id,
    marketer_id: target.marketer_id,
    marketer_name: target.marketer_name,
    year: target.year,
    month: target.month,
    status: target.status,
    oa_instance_id: target.oa_instance_id,
    created_at: target.created_at,
    updated_at: target.updated_at,
    customers,
  };
}

/**
 * 将扁平明细行组织为客户→品类→商品三级树
 */
function buildCustomerTree(items: SalesTargetItem[]): TargetCustomerDTO[] {
  // 按消费者分组
  const customerMap = new Map<string, {
    erp_consumer_id: number | null;
    consumer_name: string;
    is_planned_new: boolean;
    categoryMap: Map<string, {
      category_name: string;
      target_amount: number;
      products: TargetProductDTO[];
    }>;
  }>();

  for (const item of items) {
    const custKey = `${item.erp_consumer_id ?? 'null'}:${item.consumer_name}`;
    let customer = customerMap.get(custKey);

    if (!customer) {
      customer = {
        erp_consumer_id: item.erp_consumer_id,
        consumer_name: item.consumer_name,
        is_planned_new: item.is_planned_new,
        categoryMap: new Map(),
      };
      customerMap.set(custKey, customer);
    }

    // 品类分组
    const catName = item.category_name || '未分类';
    let category = customer.categoryMap.get(catName);
    if (!category) {
      category = { category_name: catName, target_amount: 0, products: [] };
      customer.categoryMap.set(catName, category);
    }

    // 商品行
    category.products.push({
      erp_goods_id: item.erp_goods_id,
      goods_name: item.goods_name,
      unit: item.unit,
      unit_price: item.unit_price,
      target_amount: Number(item.target_amount) || 0,
      remark: item.remark || '',
      actual_amount_last_month: 0, // 由 ERP 服务补充
      actual_amount_prev_month: 0,
      gross_margin_rate: 0,        // 由 ERP 服务补充
    });

    category.target_amount += Number(item.target_amount) || 0;
  }

  // 转为数组
  const customers: TargetCustomerDTO[] = [];
  for (const [, cust] of customerMap) {
    const categories: TargetCategoryDTO[] = [];
    for (const [, cat] of cust.categoryMap) {
      categories.push({
        category_name: cat.category_name,
        target_amount: Math.round(cat.target_amount * 100) / 100,
        actual_amount_last_month: 0, // 由上层补充
        actual_amount_prev_month: 0,
        products: cat.products,
      });
    }
    customers.push({
      erp_consumer_id: cust.erp_consumer_id,
      consumer_name: cust.consumer_name,
      is_planned_new: cust.is_planned_new,
      categories,
    });
  }

  return customers;
}
