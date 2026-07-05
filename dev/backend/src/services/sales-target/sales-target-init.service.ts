/**
 * 目标管理 - 初始数据构建服务
 * 当指定营销师+月份无已保存的目标记录时，从 ERP 上月销售数据构建初始值
 */

import { appQuery } from '../../db/appPool';
import { SALES_BUSINESS_ATTR_IDS } from '../../utils/constants';
import { searchErpCustomers } from '../erp-client/erp-customer.service';
import { getMarketerStaffId } from './sales-target-marketer.service';
import { getMonthRange } from './sales-target-utils';
import type {
  InitDataDTO,
  TargetCustomerDTO,
  TargetCategoryDTO,
  TargetProductDTO,
} from './sales-target.types';

/**
 * 构建初始化目标数据（从 ERP 上月销售明细构建）
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
    const mgrId = c.consumerManagerId ?? null;
    if (staffId !== null && mgrId === staffId) {
      myCustomerMap.set(c.id, c.name);
    }
  }

  // 4. 从本地表拉取上月销售明细
  const [lastMonthStart, lastMonthEnd] = getMonthRange(year, month, 1);

  const salesResult = await appQuery(
    'SELECT consumer_id, consumer_name, goods_id, goods_name, finance_sales_amount, finance_cost_amount, category_name FROM erp_sales_details WHERE settle_time >= $1 AND settle_time < $2 AND business_attr = ANY($3)',
    [lastMonthStart, lastMonthEnd, SALES_BUSINESS_ATTR_IDS]
  );

  // 5. 按客户→品类→商品聚合，仅保留该营销师的客户
  const customerDataMap = new Map<number, {
    consumer_name: string;
    categoryMap: Map<string, {
      category_name: string;
      productMap: Map<number, { goods_name: string; category_name: string; amount: number; costAmount: number; }>;
    }>;
  }>();

  for (const d of salesResult.rows) {
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
    const costAmount = parseFloat(d.finance_cost_amount) || 0;
    if (existing) {
      existing.amount += amount;
      existing.costAmount += costAmount;
    } else {
      categoryData.productMap.set(d.goods_id, {
        goods_name: d.goods_name, category_name: catName, amount, costAmount,
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
        const grossMarginRate = prodData.amount > 0
          ? Math.round((prodData.amount - prodData.costAmount) / prodData.amount * 10000) / 10000
          : 0;
        products.push({
          erp_goods_id: goodsId, goods_name: prodData.goods_name,
          unit: null, unit_price: null,
          target_amount: rounded, remark: '',
          actual_amount_last_month: rounded, actual_amount_prev_month: 0,
          gross_margin_rate: grossMarginRate,
        });
      }
      categories.push({
        category_name: catData.category_name,
        target_amount: Math.round(catActualTotal * 100) / 100,
        actual_amount_last_month: Math.round(catActualTotal * 100) / 100,
        actual_amount_prev_month: 0,
        products,
      });
    }
    customers.push({
      erp_consumer_id: consumerId, consumer_name: custData.consumer_name,
      is_planned_new: false, categories,
    });
  }

  return {
    is_saved: false, target_id: null,
    status: 'draft', oa_instance_id: null,
    marketer_id: marketerUserId, marketer_name: marketerName,
    year, month, customers,
  };
}
