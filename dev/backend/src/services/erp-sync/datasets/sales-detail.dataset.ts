/**
 * 销售明细数据集配置
 * Type B (flow-window): 滑动窗口分频同步
 *   热窗口(7天): 每 2 分钟同步
 *   温窗口(8-60天): 每周一凌晨 03:00 同步
 *   冷窗口(60天+): 每月 1 号和 15 号凌晨 04:00 同步
 * @module services/erp-sync/datasets/sales-detail
 */

import { fetchSalesDetails } from '../../erp-client/erp-sales-detail.service';
import { beijingDateOffset, beijingDate } from '../../../utils/beijingTime';
import { config } from '../../../config';
import type { SyncSourceConfig } from '../sync-types';

/** 同步引擎专用超时时间（批量拉取需要更长超时） */
const syncTimeout = config.erpSync.timeout;

export const salesDetailConfig: SyncSourceConfig = {
  id: 'sales',
  name: '销售明细',
  type: 'flow-window',
  syncMode: 'windowed-replace',
  timeColumn: 'settle_time',
  fetchAll: async () => {
    // 默认拉取近 30 天（兼容旧接口）
    const dateFrom = beijingDateOffset(-30);
    const dateTo = beijingDate();
    return fetchSalesDetails(dateFrom, dateTo, false, syncTimeout);
  },
  fetchByRange: async (dateFrom: string, dateTo: string) => {
    return fetchSalesDetails(dateFrom, dateTo, false, syncTimeout);
  },
  fetchAllHistory: async () => {
    // 拉取 2020 年至今的历史数据（按月分块加载，避免一次性拉取过多）
    return fetchSalesDetails('2020-01-01', beijingDate(), false, syncTimeout);
  },
  transform: (api: unknown) => {
    const r = api as Record<string, unknown>;
    return {
      biz_str: r.bizStr,
      goods_id: r.goodsId,
      goods_name: r.goodsName ?? null,
      base_quantity: r.baseQuantity ?? 0,
      actual_quantity: r.actualQuantity ?? 0,
      settle_time: r.settleTime ?? null,
      consumer_name: r.consumerName ?? null,
      consumer_id: r.consumerId ?? null,
      consumer_code: r.consumerCode ?? null,
      settle_consumer_id: r.settleConsumerId ?? null,
      settle_consumer_name: r.settleConsumerName ?? null,
      origin_str: r.originStr ?? null,
      salesman_id: r.salesmanId ?? null,
      salesman_name: r.salesmanName ?? null,
      dept_id: r.deptId ?? null,
      dept_name: r.deptName ?? null,
      deliver_id: r.deliverId ?? null,
      deliver_name: r.deliverName ?? null,
      warehouse_id: r.warehouseId ?? null,
      warehouse_name: r.warehouseName ?? null,
      quality_type: r.qualityType ?? null,
      quality_type_name: r.qualityTypeName ?? null,
      business_attr: r.businessAttr ?? null,
      business_attr_name: r.businessAttrName ?? null,
      settle_method: r.settleMethod ?? null,
      settle_method_name: r.settleMethodName ?? null,
      finance_cost_price: r.financeCostPrice ?? '0',
      finance_cost_amount: r.financeCostAmount ?? '0',
      finance_sales_amount: r.financeSalesAmount ?? '0',
      finance_profit: r.financeProfit ?? '0',
      finance_profit_rate: r.financeProfitRate ?? null,
      sign_amount: r.signAmount ?? '0',
      base_unit_name: r.baseUnitName ?? null,
      pkg_unit_name: r.pkgUnitName ?? null,
      mid_unit_name: r.midUnitName ?? null,
      category_id: r.categoryId ?? null,
      category_name: r.categoryName ?? null,
      brand_id: r.brandId ?? null,
      brand_name: r.brandName ?? null,
      area_id: r.areaId ?? null,
      area_name: r.areaName ?? null,
      group_id: r.groupId ?? null,
      group_name: r.groupName ?? null,
      grade_id: r.gradeId ?? null,
      grade_name: r.gradeName ?? null,
      sub_type: r.subType ?? null,
      order_link_type: r.orderLinkType ?? null,
      bill_from: r.billFrom ?? null,
      specifications: r.specifications ?? null,
      barcode: r.barcode ?? null,
      goods_code: r.goodsCode ?? null,
      goods_unit_factor_name: r.goodsUnitFactorName ?? null,
      tag_id: r.tagId ?? null,
      tag_name: r.tagName ?? null,
      wholesale_price: r.wholesalePrice ?? '0',
      wholesale_amount: r.wholesaleAmount ?? '0',
      order_time: r.orderTime ?? null,
    };
  },
  targetTable: 'erp_sales_details',
  primaryKey: [],
  intervalMs: 120000,
  pageSize: 2000,
  enableFallback: true,
  windows: {
    hot: 7,
    warm: 60,
    cold: 60,                  // 60天之前为冷数据
    hotIntervalMs: 120000,     // 2 分钟
    warmIntervalMs: 604800000, // 7 天
    coldIntervalMs: 1296000000, // 15 天
  },
  postProcessors: [
    { type: 'daily-summary', targetTable: 'erp_daily_sales_summary', groupBy: ['goods_name'] },
  ],
};
