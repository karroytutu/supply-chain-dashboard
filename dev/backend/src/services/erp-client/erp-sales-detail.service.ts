/**
 * ERP 销售结算明细服务
 * 通过舟谱 API 拉取销售数据，替代直连 xinshutong 数据库
 * @module services/erp-client/erp-sales-detail.service
 */

import { erpPost } from './erp-client';
import { beijingDate, beijingDateOffset } from '../../utils/beijingTime';
import { getErpDefaults } from './erp-config';
import { cache, CACHE_TTL } from '../../utils/cache';
import { CACHE_KEY } from '../../utils/cache-keys';
import { LAST_SALE_LOOKBACK_DAYS, SALES_BUSINESS_ATTR_IDS } from '../../utils/constants';
import { fetchAllPagesParallel, fetchAllPagesSequential, fetchAllPagesVerified } from './erp-pagination';
import { appQuery } from '../../db/appPool';
import { createLogger } from '../../utils/logger';

const log = createLogger('ErpSalesDetail');

/** API 返回的销售明细记录 */
export interface ErpSalesDetail {
  goodsName: string;
  goodsId: number;
  baseQuantity: number;
  settleTime: string;
  consumerName: string;
  consumerId: number;
  originStr: string;
  bizStr: string;
  salesmanName: string;
  deptName: string;
  financeCostPrice: string;
  financeSalesAmount: string;
  signAmount: string;
  actualQuantity: number;
  baseUnitName: string;
  categoryName: string;
  brandName: string;
}

/** API 分页响应 */
interface ApiSalesResponse {
  code: number;
  data: {
    records: ErpSalesDetail[];
    total: number;
    current: number;
    size: number;
  };
}

/** 默认 pageSize（实测 1000 最优） */
const DEFAULT_PAGE_SIZE = 1000;

/** in-flight 去重 Map：key 为 `${dateFrom}:${dateTo}`，多个并发调用共享同一 Promise */
const _salesInFlight = new Map<string, Promise<ErpSalesDetail[]>>();

/**
 * 从 ERP API 拉取指定日期范围的销售明细
 */
export async function fetchSalesDetails(
  dateFrom: string,
  dateTo: string,
  skipCache = false
): Promise<ErpSalesDetail[]> {
  // 持久缓存检查（5分钟 TTL，按日期范围区分缓存键）
  const persistKey = `${CACHE_KEY.ERP_SALES_RECENT}:${dateFrom}:${dateTo}`;
  if (!skipCache) {
    const cached = cache.get<ErpSalesDetail[]>(persistKey);
    if (cached) return cached;
  }

  // in-flight 去重
  const inflightKey = `${dateFrom}:${dateTo}`;
  if (!skipCache && _salesInFlight.has(inflightKey)) {
    return _salesInFlight.get(inflightKey)!;
  }

  const doFetch = async (): Promise<ErpSalesDetail[]> => {
    const { cid, uid } = getErpDefaults();

    const fetchPage = async (current: number) => {
      const result = await erpPost<ApiSalesResponse>(
        '/funds-sale/list-sale-detail',
        {
          dimList: [],
          submitTimeFrom: dateFrom,
          submitTimeTo: dateTo,
          goodsIds: [],
          consumerIds: [],
          salesmanIds: [],
          subTypes: [],
          billTypes: [],
          businessAttrIds: [],
          tagIds: [],
          orderStateIds: ['APPROVED'],
          settlementStateIds: [],
          brandIds: [],
          categoryIds: [],
          costPriceType: 'MOVE_COST_PRICE',
          areaIds: [],
          groupIds: [],
          gradeIds: [],
          deliverIds: [],
          orderNote: '',
          originStr: '',
          warehouseIds: [],
          submitTimeType: 'settle_time',
          unitDisplayType: 'BASE_UNIT',
          mixPriceUnit: 'PKG_UNIT',
          exportType: 'mergeexport',
          orderBy: '',
          orderType: '',
          signStateIds: [],
          deptIds: [],
          settleConsumerIds: [],
          supplierIds: [],
          defaultSelectedIndex: 0,
          qualityType: '',
          current,
          size: DEFAULT_PAGE_SIZE,
          fundsSaleTotalAmountFrom: '',
          fundsSaleTotalAmountTo: '',
          bizCollectorIds: [],
          fuzzySearchGoodsStr: '',
          cid,
          uid,
        },
        {
          pathPrefix: '/toliman/',
          businessType: 'sales_detail_fetch',
        }
      );
      return {
        records: result?.data?.records || [],
        total: result?.data?.total || 0,
      };
    };

    const verified = await fetchAllPagesVerified<ErpSalesDetail>(fetchPage, DEFAULT_PAGE_SIZE, `sales:${dateFrom}~${dateTo}`);
    const result = verified.records;

    // 写入持久缓存（5分钟 TTL）
    cache.set(persistKey, result, CACHE_TTL.ERP_SLOW);

    return result;
  };

  const promise = doFetch();
  if (!skipCache) {
    _salesInFlight.set(inflightKey, promise);
    promise.finally(() => _salesInFlight.delete(inflightKey));
  }
  return promise;
}

/**
 * 获取近 N 天的日均销量 Map
 * 从本地 erp_sales_details 表 SQL 聚合
 *
 * @param days - 计算天数，默认 30
 */
export async function getDailySalesMap(days = 30): Promise<Map<string, number>> {
  const cacheKey = CACHE_KEY.ERP_SALES_DAILY_MAP;

  const cached = cache.get<Map<string, number>>(cacheKey);
  if (cached) return cached;

  const dateFrom = beijingDateOffset(-days);
  const result = await appQuery<{ goods_name: string; total_qty: string }>(
    `SELECT goods_name, SUM(base_quantity) AS total_qty
     FROM erp_sales_details
     WHERE settle_time >= $1 AND business_attr = ANY($2)
     GROUP BY goods_name`,
    [dateFrom, SALES_BUSINESS_ATTR_IDS]
  );
  const dailyMap = new Map<string, number>();
  result.rows.forEach(r => {
    dailyMap.set(r.goods_name, (Number(r.total_qty) || 0) / days);
  });
  cache.set(cacheKey, dailyMap, CACHE_TTL.DASHBOARD);
  return dailyMap;
}

/**
 * 获取每个商品的最后销售时间 Map
 * 从本地 erp_sales_details 表 SQL 聚合
 */
export async function getLastSaleMap(): Promise<Map<string, string>> {
  const cacheKey = CACHE_KEY.ERP_SALES_LAST_SALE;

  const cached = cache.get<Map<string, string>>(cacheKey);
  if (cached) return cached;

  const dateFrom = beijingDateOffset(-LAST_SALE_LOOKBACK_DAYS);
  const result = await appQuery<{ goods_name: string; last_settle_time: string }>(
    `SELECT goods_name, MAX(settle_time) AS last_settle_time
     FROM erp_sales_details
     WHERE settle_time >= $1 AND business_attr = ANY($2)
     GROUP BY goods_name`,
    [dateFrom, SALES_BUSINESS_ATTR_IDS]
  );
  const resultMap = new Map<string, string>();
  result.rows.forEach(r => resultMap.set(r.goods_name, r.last_settle_time));
  cache.set(cacheKey, resultMap, CACHE_TTL.DASHBOARD);
  return resultMap;
}

/**
 * 按订单号查询销售明细（用于退货同步获取客户名/营销师）
 * 从本地 erp_sales_details 表查询
 */
export async function getSalesDetailByOriginStr(originStr: string): Promise<ErpSalesDetail | null> {
  const result = await appQuery<Record<string, unknown>>(
    `SELECT goods_name, goods_id, base_quantity, settle_time, consumer_name,
            consumer_id, origin_str, biz_str, salesman_name, dept_name,
            finance_cost_price, finance_sales_amount, sign_amount,
            actual_quantity, base_unit_name, category_name, brand_name
     FROM erp_sales_details WHERE origin_str = $1 LIMIT 1`,
    [originStr]
  );
  if (result.rows.length > 0) {
    return mapLocalRowToSalesDetail(result.rows[0]);
  }
  return null;
}

/** 本地表行 -> ErpSalesDetail 映射 */
function mapLocalRowToSalesDetail(row: Record<string, unknown>): ErpSalesDetail {
  return {
    goodsName: (row.goods_name as string) || '',
    goodsId: (row.goods_id as number) || 0,
    baseQuantity: Number(row.base_quantity) || 0,
    settleTime: (row.settle_time as string) || '',
    consumerName: (row.consumer_name as string) || '',
    consumerId: (row.consumer_id as number) || 0,
    originStr: (row.origin_str as string) || '',
    bizStr: (row.biz_str as string) || '',
    salesmanName: (row.salesman_name as string) || '',
    deptName: (row.dept_name as string) || '',
    financeCostPrice: (row.finance_cost_price as string) || '0',
    financeSalesAmount: (row.finance_sales_amount as string) || '0',
    signAmount: (row.sign_amount as string) || '0',
    actualQuantity: Number(row.actual_quantity) || 0,
    baseUnitName: (row.base_unit_name as string) || '',
    categoryName: (row.category_name as string) || '',
    brandName: (row.brand_name as string) || '',
  };
}

/**
 * 清除销售明细缓存
 */
export function invalidateSalesCache(): void {
  cache.invalidate(CACHE_KEY.ERP_SALES_PREFIX);
}
