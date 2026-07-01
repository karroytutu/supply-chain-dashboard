/**
 * ERP 销售明细本地优先 + Fallback 测试
 * @module services/erp-client/erp-sales-detail.spec.ts
 */

jest.mock('../../utils/logger', () => ({
  createLogger: () => ({ warn: jest.fn(), info: jest.fn(), error: jest.fn(), debug: jest.fn() }),
}));
jest.mock('../../db/appPool', () => ({ appQuery: jest.fn() }));
jest.mock('../../utils/cache', () => ({
  cache: { get: jest.fn(), set: jest.fn(), invalidate: jest.fn() },
  CACHE_TTL: { DASHBOARD: 60000, ERP_SLOW: 300000 },
}));
jest.mock('../../utils/cache-keys', () => ({
  CACHE_KEY: {
    ERP_SALES_RECENT: 'erp:sales:recent',
    ERP_SALES_DAILY_MAP: 'erp:sales:daily-map',
    ERP_SALES_LAST_SALE: 'erp:sales:last-sale',
    ERP_SALES_PREFIX: 'erp:sales',
  },
}));
jest.mock('../../utils/beijingTime', () => ({
  beijingDate: jest.fn(() => '2026-07-01'),
  beijingDateOffset: jest.fn((days: number) => {
    const d = new Date('2026-07-01');
    d.setDate(d.getDate() + days);
    return d.toISOString().split('T')[0];
  }),
}));
jest.mock('../../utils/constants', () => ({
  LAST_SALE_LOOKBACK_DAYS: 90,
  SALES_BUSINESS_ATTR_IDS: [1, 2],
}));
jest.mock('../../utils/arrayAggregation', () => ({
  aggregateSum: jest.fn((items: any[], keyFn: Function, valueFn: Function) => {
    const map = new Map<string, number>();
    for (const item of items) {
      const key = keyFn(item);
      map.set(key, (map.get(key) || 0) + valueFn(item));
    }
    return map;
  }),
  lastBy: jest.fn((items: any[], keyFn: Function, valueFn: Function) => {
    const map = new Map<string, any>();
    for (const item of items) {
      const key = keyFn(item);
      const existing = map.get(key);
      if (!existing || valueFn(item) > valueFn(existing)) {
        map.set(key, item);
      }
    }
    return map;
  }),
}));
jest.mock('./erp-client', () => ({ erpPost: jest.fn() }));
jest.mock('./erp-config', () => ({
  getErpDefaults: jest.fn(() => ({ cid: 'test-cid', uid: 'test-uid' })),
}));
jest.mock('./erp-pagination', () => ({
  fetchAllPagesParallel: jest.fn(),
  fetchAllPagesSequential: jest.fn(),
  fetchAllPagesVerified: jest.fn(),
}));

import {
  fetchSalesDetails,
  getDailySalesMap,
  getLastSaleMap,
  getSalesDetailByOriginStr,
} from './erp-sales-detail.service';
import { appQuery } from '../../db/appPool';
import { cache } from '../../utils/cache';
import { fetchAllPagesVerified } from './erp-pagination';

const mockAppQuery = appQuery as jest.MockedFunction<typeof appQuery>;
const mockCache = cache as jest.Mocked<typeof cache>;
const mockFetchAllPages = fetchAllPagesVerified as jest.MockedFunction<typeof fetchAllPagesVerified>;

beforeEach(() => {
  jest.clearAllMocks();
  mockCache.get.mockReturnValue(null);
});

// =====================================================
// fetchSalesDetails
// =====================================================

describe('fetchSalesDetails', () => {
  it('缓存命中 → 直接返回，不调用 ERP API', async () => {
    const cachedData = [{ goodsName: '商品A', goodsId: 1 }] as any;
    mockCache.get.mockReturnValue(cachedData);

    const result = await fetchSalesDetails('2026-06-01', '2026-07-01');

    expect(result).toBe(cachedData);
    expect(mockFetchAllPages).not.toHaveBeenCalled();
  });

  it('缓存未命中 → 调用 ERP API 并写入缓存', async () => {
    const mockRecords = [
      { goodsName: '商品A', goodsId: 1, baseQuantity: 10, settleTime: '2026-06-15' },
    ];
    mockFetchAllPages.mockResolvedValue({ records: mockRecords, knownTotal: mockRecords.length } as any);

    const result = await fetchSalesDetails('2026-06-01', '2026-07-01');

    expect(result).toEqual(mockRecords);
    expect(mockCache.set).toHaveBeenCalled();
  });

  it('skipCache=true → 绕过缓存', async () => {
    mockCache.get.mockReturnValue([{ cached: true }] as any);
    mockFetchAllPages.mockResolvedValue({ records: [{ fresh: true }], knownTotal: 1 } as any);

    const result = await fetchSalesDetails('2026-06-01', '2026-07-01', true);

    expect(result).toEqual([{ fresh: true }]);
    // 缓存不应被读取（但 set 仍会被调用）
    expect(mockFetchAllPages).toHaveBeenCalled();
  });
});

// =====================================================
// getDailySalesMap
// =====================================================

describe('getDailySalesMap', () => {
  it('本地表查询成功 → 返回 SQL 聚合结果', async () => {
    mockAppQuery.mockResolvedValue({
      rows: [
        { goods_name: '商品A', total_qty: '300' },
        { goods_name: '商品B', total_qty: '600' },
      ],
    } as any);

    const result = await getDailySalesMap(30);

    expect(result.size).toBe(2);
    expect(result.get('商品A')).toBe(10); // 300 / 30
    expect(result.get('商品B')).toBe(20); // 600 / 30
    // 验证写入了缓存
    expect(mockCache.set).toHaveBeenCalled();
  });

  it('本地表查询失败 → fallback 到内存聚合', async () => {
    // 第一次 appQuery（本地聚合）抛错
    mockAppQuery.mockRejectedValue(new Error('表不存在'));
    // fetchSalesDetails 的 fallback
    mockFetchAllPages.mockResolvedValue({
      records: [{ goodsName: '商品A', baseQuantity: 300 }],
      knownTotal: 1,
    } as any);

    const result = await getDailySalesMap(30);

    expect(result.size).toBeGreaterThan(0);
    // 验证调用了 ERP API（通过 fetchAllPagesParallel）
    expect(mockFetchAllPages).toHaveBeenCalled();
  });

  it('本地表返回空 → fallback 到内存聚合', async () => {
    mockAppQuery.mockResolvedValue({ rows: [] } as any);
    mockFetchAllPages.mockResolvedValue({
      records: [{ goodsName: '商品C', baseQuantity: 100 }],
      knownTotal: 1,
    } as any);

    const result = await getDailySalesMap(30);

    expect(result.size).toBeGreaterThan(0);
  });

  it('缓存命中 → 直接返回', async () => {
    const cachedMap = new Map([['商品X', 42]]);
    mockCache.get.mockReturnValue(cachedMap as any);

    const result = await getDailySalesMap();

    expect(result).toBe(cachedMap);
    expect(mockAppQuery).not.toHaveBeenCalled();
  });
});

// =====================================================
// getLastSaleMap
// =====================================================

describe('getLastSaleMap', () => {
  it('本地表成功 → 返回 SQL 聚合结果', async () => {
    mockAppQuery.mockResolvedValue({
      rows: [
        { goods_name: '商品A', last_settle_time: '2026-06-28' },
      ],
    } as any);

    const result = await getLastSaleMap();

    expect(result.size).toBe(1);
    expect(result.get('商品A')).toBe('2026-06-28');
  });

  it('本地表失败 → fallback', async () => {
    mockAppQuery.mockRejectedValue(new Error('fail'));
    mockFetchAllPages.mockResolvedValue({
      records: [{ goodsName: '商品A', settleTime: '2026-06-28' }],
      knownTotal: 1,
    } as any);

    const result = await getLastSaleMap();

    expect(result.size).toBeGreaterThan(0);
  });
});

// =====================================================
// getSalesDetailByOriginStr
// =====================================================

describe('getSalesDetailByOriginStr', () => {
  it('本地表命中 → 正确映射', async () => {
    mockAppQuery.mockResolvedValue({
      rows: [{
        goods_name: '商品A', goods_id: 101, base_quantity: 5,
        settle_time: '2026-06-15', consumer_name: '客户A',
        consumer_id: 1001, origin_str: 'XS001', biz_str: 'B001',
        salesman_name: '张三', dept_name: '销售部',
        finance_cost_price: '10', finance_sales_amount: '50',
        sign_amount: '50', actual_quantity: 5,
        base_unit_name: '箱', category_name: '饮料', brand_name: '品牌A',
      }],
    } as any);

    const result = await getSalesDetailByOriginStr('XS001');

    expect(result).not.toBeNull();
    expect(result!.goodsName).toBe('商品A');
    expect(result!.goodsId).toBe(101);
    expect(result!.consumerName).toBe('客户A');
    expect(result!.originStr).toBe('XS001');
  });

  it('本地表未命中 → fallback 到 ERP API', async () => {
    mockAppQuery.mockResolvedValue({ rows: [] } as any);
    mockFetchAllPages.mockResolvedValue({
      records: [{ goodsName: '商品B', originStr: 'XS002', consumerId: 1002 }],
      knownTotal: 1,
    } as any);

    const result = await getSalesDetailByOriginStr('XS002');

    expect(result).not.toBeNull();
    expect(result!.goodsName).toBe('商品B');
    expect(result!.originStr).toBe('XS002');
  });

  it('本地表和 ERP 都无数据 → 返回 null', async () => {
    mockAppQuery.mockResolvedValue({ rows: [] } as any);
    mockFetchAllPages.mockResolvedValue({ records: [], knownTotal: 0 });

    const result = await getSalesDetailByOriginStr('NOT_FOUND');

    expect(result).toBeNull();
  });
});
