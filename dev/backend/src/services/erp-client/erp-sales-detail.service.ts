/**
 * ERP 销售结算明细服务
 * 通过舟谱 API 拉取销售数据，替代直连 xinshutong 数据库
 * @module services/erp-client/erp-sales-detail.service
 */

import { erpPost } from './erp-client';
import { getErpDefaults } from './erp-config';
import { cache, CACHE_TTL } from '../../utils/cache';
import { CACHE_KEY } from '../../utils/cache-keys';
import { LAST_SALE_LOOKBACK_DAYS } from '../../utils/constants';
import { aggregateSum, lastBy } from '../../utils/arrayAggregation';

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
  // in-flight 去重
  const inflightKey = `${dateFrom}:${dateTo}`;
  if (!skipCache && _salesInFlight.has(inflightKey)) {
    return _salesInFlight.get(inflightKey)!;
  }

  const doFetch = async (): Promise<ErpSalesDetail[]> => {
    const { cid, uid } = getErpDefaults();
    const allRecords: ErpSalesDetail[] = [];
    let current = 1;

    while (true) {
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

      const records = result?.data?.records || [];
      allRecords.push(...records);

      const total = result?.data?.total || 0;
      if (allRecords.length >= total || records.length < DEFAULT_PAGE_SIZE) {
        break;
      }
      current++;
    }

    return allRecords;
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
 * 替代 SQL: SELECT goodsName, SUM(baseQuantity)/days GROUP BY goodsName
 *
 * @param days - 计算天数，默认 30
 */
export async function getDailySalesMap(days = 30): Promise<Map<string, number>> {
  const cacheKey = CACHE_KEY.ERP_SALES_RECENT;

  // 检查缓存
  const cached = cache.get<Map<string, number>>(cacheKey);
  if (cached) return cached;

  const now = new Date();
  const fromDate = new Date(now);
  fromDate.setDate(fromDate.getDate() - days);

  const dateFrom = fromDate.toISOString().slice(0, 10);
  const dateTo = now.toISOString().slice(0, 10);

  const details = await fetchSalesDetails(dateFrom, dateTo);

  // 按商品名汇总销量，除以天数得到日均
  const totalSalesMap = aggregateSum(
    details,
    d => d.goodsName,
    d => d.baseQuantity
  );

  const dailyMap = new Map<string, number>();
  totalSalesMap.forEach((total, name) => {
    dailyMap.set(name, total / days);
  });

  // 缓存（TTL 60s）
  cache.set(cacheKey, dailyMap, CACHE_TTL.DASHBOARD);

  return dailyMap;
}

/**
 * 获取每个商品的最后销售时间 Map
 * 替代 SQL: SELECT goodsName, MAX(settleTime) GROUP BY goodsName
 */
export async function getLastSaleMap(): Promise<Map<string, string>> {
  const cacheKey = CACHE_KEY.ERP_SALES_LAST_SALE;

  const cached = cache.get<Map<string, string>>(cacheKey);
  if (cached) return cached;

  const now = new Date();
  const fromDate = new Date(now);
  // 查最近 45 天（滞销最大阈值30天 + 50%缓冲），超出此范围的商品视为严重滞销
  fromDate.setDate(fromDate.getDate() - LAST_SALE_LOOKBACK_DAYS);

  const details = await fetchSalesDetails(
    fromDate.toISOString().slice(0, 10),
    now.toISOString().slice(0, 10)
  );

  const lastSaleMap = lastBy(
    details,
    d => d.goodsName,
    d => d.settleTime
  );

  // 转换为 Map<string, string>
  const result = new Map<string, string>();
  lastSaleMap.forEach((detail, name) => {
    result.set(name, detail.settleTime);
  });

  // 缓存（TTL 60s）
  cache.set(cacheKey, result, CACHE_TTL.DASHBOARD);

  return result;
}

/**
 * 按订单号查询销售明细（用于退货同步获取客户名/营销师）
 */
export async function getSalesDetailByOriginStr(originStr: string): Promise<ErpSalesDetail | null> {
  // 先尝试从缓存中查找
  const now = new Date();
  const fromDate = new Date(now);
  fromDate.setDate(fromDate.getDate() - 90);

  const details = await fetchSalesDetails(
    fromDate.toISOString().slice(0, 10),
    now.toISOString().slice(0, 10)
  );

  return details.find(d => d.originStr === originStr) || null;
}

/**
 * 清除销售明细缓存
 */
export function invalidateSalesCache(): void {
  cache.invalidate('erp:sales:');
}
