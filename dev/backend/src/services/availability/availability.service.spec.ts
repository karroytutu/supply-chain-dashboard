/**
 * 库存齐全率服务单元测试
 */

jest.mock('../../utils/logger', () => ({
  createLogger: () => ({ warn: jest.fn(), info: jest.fn(), error: jest.fn() }),
}));

jest.mock('../../db/appPool', () => ({
  appQuery: jest.fn(),
}));

jest.mock('../../utils/cache', () => ({
  cache: {
    get: jest.fn().mockReturnValue(null),
    set: jest.fn(),
    invalidate: jest.fn(),
  },
  CACHE_TTL: { DASHBOARD: 60000, HIGH_FREQUENCY: 30000, LOW_FREQUENCY: 300000 },
}));

jest.mock('../../utils/constants', () => ({
  STANDARD_CALC_DAYS: 30,
}));

jest.mock('../erp-client/erp-data-facade', () => ({
  getAvailabilityStats: jest.fn(),
  getCategoryAggregation: jest.fn(),
  getOutOfStockProducts: jest.fn(),
}));

jest.mock('../erp-client/erp-inventory.service', () => ({
  getStockByNameMap: jest.fn(),
}));

jest.mock('../erp-client/erp-sales-detail.service', () => ({
  getDailySalesMap: jest.fn(),
}));

jest.mock('../erp-client/erp-snapshot.service', () => ({
  getMonthlyAvailability: jest.fn(),
}));

import { appQuery } from '../../db/appPool';
import { cache } from '../../utils/cache';
import { mockQueryResult } from '../../__tests__/helpers/mockDb';
import { getAvailabilityStats, getCategoryAggregation, getOutOfStockProducts } from '../erp-client/erp-data-facade';
import { getStockByNameMap } from '../erp-client/erp-inventory.service';
import { getMonthlyAvailability } from '../erp-client/erp-snapshot.service';
import {
  getAvailabilityData,
  getStrategicMonthlyAvailability,
  getCategoryTreeData,
  getOutOfStockProductsByCategory,
} from './availability.service';

const mockAppQuery = appQuery as jest.MockedFunction<typeof appQuery>;
const mockCache = cache as jest.Mocked<typeof cache>;

beforeEach(() => {
  jest.resetAllMocks();
  mockCache.get.mockReturnValue(null);
});

// ==================== getAvailabilityData ====================

describe('getAvailabilityData', () => {
  it('返回完整的齐全率数据', async () => {
    (getAvailabilityStats as jest.Mock).mockResolvedValueOnce({
      totalEnabled: 100, inStock: 85, outOfStock: 10, lowStock: 5,
      availabilityRate: 85.0,
    });
    (getCategoryAggregation as jest.Mock).mockResolvedValueOnce([
      { name: '食品', availabilityRate: 90, totalCount: 20, level: 'l1' },
    ]);
    mockAppQuery.mockResolvedValueOnce(mockQueryResult([
      { goods_name: '商品A' }, { goods_name: '商品B' },
    ]));
    (getStockByNameMap as jest.Mock).mockResolvedValueOnce(new Map([['商品A', 10]]));
    (getMonthlyAvailability as jest.Mock).mockResolvedValueOnce(new Map());

    const result = await getAvailabilityData();

    expect(result.value).toBe(85.0);
    expect(result.totalSku).toBe(100);
    expect(result.warningStats?.outOfStock).toBe(10);
    expect(result.warningStats?.lowStock).toBe(5);
    expect(result.categories).toHaveLength(1);
    expect(result.strategicAvailability).toBeDefined();
    expect(result.strategicAvailability!.totalStrategicSku).toBe(2);
    expect(result.strategicAvailability!.inStockStrategic).toBe(1);
  });

  it('无战略商品时不计算战略齐全率', async () => {
    (getAvailabilityStats as jest.Mock).mockResolvedValueOnce({
      totalEnabled: 50, inStock: 40, outOfStock: 5, lowStock: 5,
      availabilityRate: 80,
    });
    (getCategoryAggregation as jest.Mock).mockResolvedValueOnce([]);
    mockAppQuery.mockResolvedValueOnce(mockQueryResult([]));

    const result = await getAvailabilityData();

    expect(result.strategicAvailability).toBeUndefined();
    expect(result.strategicMonthlyAvailability).toBeUndefined();
  });
});

// ==================== getStrategicMonthlyAvailability ====================

describe('getStrategicMonthlyAvailability', () => {
  it('空列表返回 undefined', async () => {
    const result = await getStrategicMonthlyAvailability([]);
    expect(result).toBeUndefined();
  });

  it('有快照数据时计算月度平均', async () => {
    const dailyMap = new Map([
      ['2026-06-01', 8],
      ['2026-06-02', 9],
      ['2026-06-03', 7],
    ]);
    (getMonthlyAvailability as jest.Mock).mockResolvedValueOnce(dailyMap);

    const result = await getStrategicMonthlyAvailability(['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J']);
    expect(result).toBeDefined();
    expect(result!.totalStrategicSku).toBe(10);
    expect(result!.daysInMonth).toBe(3);
    expect(result!.dailyRates).toHaveLength(3);
    expect(result!.value).toBeGreaterThan(0);
  });

  it('无快照数据时月度平均为 0', async () => {
    (getMonthlyAvailability as jest.Mock).mockResolvedValueOnce(new Map());

    const result = await getStrategicMonthlyAvailability(['A', 'B']);
    expect(result!.value).toBe(0);
    expect(result!.daysInMonth).toBe(0);
  });
});

// ==================== getCategoryTreeData ====================

describe('getCategoryTreeData', () => {
  it('缓存命中时直接返回', async () => {
    const cached = [{ name: '食品', value: 10 }];
    mockCache.get.mockReturnValueOnce(cached);

    const result = await getCategoryTreeData();
    expect(result).toBe(cached);
    expect(getCategoryAggregation).not.toHaveBeenCalled();
  });

  it('构建品类树并缓存', async () => {
    (getCategoryAggregation as jest.Mock).mockResolvedValueOnce([
      { name: '食品', availabilityRate: 90, totalCount: 20, inStockCount: 18, level: 'l1', categoryPath: '食品' },
      { name: '饮料', availabilityRate: 80, totalCount: 10, inStockCount: 8, level: 'l2', categoryPath: '食品/饮料' },
      { name: '碳酸饮料', availabilityRate: 75, totalCount: 5, inStockCount: 3, level: 'l3', categoryPath: '食品/饮料/碳酸饮料' },
    ]);

    const result = await getCategoryTreeData();
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe('食品');
    expect(result[0].children).toHaveLength(1);
    expect(result[0].children![0].name).toBe('饮料');
    expect(result[0].children![0].children).toHaveLength(1);
    expect(mockCache.set).toHaveBeenCalled();
  });
});

// ==================== getOutOfStockProductsByCategory ====================

describe('getOutOfStockProductsByCategory', () => {
  it('返回分页缺货商品列表', async () => {
    (getOutOfStockProducts as jest.Mock).mockResolvedValueOnce({
      data: ['商品A', '商品B'],
      total: 2,
    });

    const result = await getOutOfStockProductsByCategory('食品', { page: 1, pageSize: 20 });
    expect(result.data).toHaveLength(2);
    expect(result.data[0].productName).toBe('商品A');
    expect(result.total).toBe(2);
    expect(result.page).toBe(1);
  });

  it('pageSize 上限为 100', async () => {
    (getOutOfStockProducts as jest.Mock).mockResolvedValueOnce({ data: [], total: 0 });

    const result = await getOutOfStockProductsByCategory('食品', { page: 1, pageSize: 200 });
    expect(result.pageSize).toBe(100);
  });

  it('page 最小为 1', async () => {
    (getOutOfStockProducts as jest.Mock).mockResolvedValueOnce({ data: [], total: 0 });

    const result = await getOutOfStockProductsByCategory('食品', { page: -1, pageSize: 10 });
    expect(result.page).toBe(1);
  });
});
