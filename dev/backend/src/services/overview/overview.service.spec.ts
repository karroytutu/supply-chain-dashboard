/**
 * 数据总览服务单元测试
 * Mock 所有依赖模块
 */

jest.mock('../../utils/logger', () => ({
  createLogger: () => ({ warn: jest.fn(), info: jest.fn(), error: jest.fn() }),
}));

jest.mock('../../utils/cache', () => ({
  cache: {
    get: jest.fn().mockReturnValue(null),
    getStale: jest.fn().mockReturnValue(null),
    isFresh: jest.fn().mockReturnValue(false),
    set: jest.fn(),
    invalidate: jest.fn(),
  },
  CACHE_TTL: { DASHBOARD: 60000, HIGH_FREQUENCY: 30000, LOW_FREQUENCY: 300000 },
}));

jest.mock('../../db/appPool', () => ({ appQuery: jest.fn() }));

jest.mock('../../utils/cache-keys', () => ({
  CACHE_KEY: { OVERVIEW_STATS: 'overview:stats' },
}));

jest.mock('../../utils/constants', () => ({
  STANDARD_CALC_DAYS: 30,
}));

jest.mock('../../utils/dateFormat', () => ({
  formatDateOnly: (d: any) => (d instanceof Date ? d.toISOString().split('T')[0] : String(d)),
}));

jest.mock('../availability', () => ({
  getAvailabilityData: jest.fn(),
}));

jest.mock('../erp-client/erp-batch-inventory.service', () => ({
  fetchAllBatchInventory: jest.fn().mockResolvedValue([]),
}));

jest.mock('../erp-client/erp-inventory.service', () => ({
  fetchAllInventory: jest.fn().mockResolvedValue([]),
}));

jest.mock('../erp-client/erp-product.service', () => ({
  fetchAllProducts: jest.fn().mockResolvedValue([]),
}));

jest.mock('../erp-client/erp-sales-detail.service', () => ({
  getDailySalesMap: jest.fn().mockResolvedValue(new Map()),
  getLastSaleMap: jest.fn().mockResolvedValue(new Map()),
}));

jest.mock('../expiring', () => ({
  getExpiringData: jest.fn(),
}));

jest.mock('../slowMoving', () => ({
  getSlowMovingData: jest.fn(),
}));

jest.mock('../strategic-product', () => ({
  getStrategicProductStats: jest.fn(),
}));

jest.mock('../turnover', () => ({
  getTurnoverData: jest.fn(),
}));

import { cache } from '../../utils/cache';
import { appQuery } from '../../db/appPool';
import { getAvailabilityData } from '../availability';
import { getExpiringData } from '../expiring';
import { getSlowMovingData } from '../slowMoving';
import { getStrategicProductStats } from '../strategic-product';
import { getTurnoverData } from '../turnover';
import { mockQueryResult } from '../../__tests__/helpers/mockDb';
import { getOverviewStats, getOverviewFull, getTrendData } from './overview.service';

const mockCache = cache as jest.Mocked<typeof cache>;
const mockAppQuery = appQuery as jest.MockedFunction<typeof appQuery>;

function setupDefaultMocks() {
  (getAvailabilityData as jest.Mock).mockResolvedValue({
    totalSku: 500,
    value: 85.5,
    warningStats: { outOfStock: 10, lowStock: 5 },
    strategicAvailability: { value: 90.0 },
  });
  (getTurnoverData as jest.Mock).mockResolvedValue({
    value: 45,
    warningStats: { mildOverstock: 3, moderateOverstock: 2, seriousOverstock: 1 },
  });
  (getExpiringData as jest.Mock).mockResolvedValue({
    within7Days: 5,
    within15Days: 10,
    within30Days: 20,
    expiringCost: 50000,
  });
  (getSlowMovingData as jest.Mock).mockResolvedValue({
    slowMovingCost: 30000,
  });
  (getStrategicProductStats as jest.Mock).mockResolvedValue({
    total: 50,
    pending: 10,
    confirmed: 35,
    rejected: 5,
  });
}

beforeEach(() => {
  jest.resetAllMocks();
  mockCache.getStale.mockReturnValue(null);
  mockCache.get.mockReturnValue(null);
  mockCache.isFresh.mockReturnValue(false);
  setupDefaultMocks();
});

// ==================== getOverviewStats ====================

describe('getOverviewStats', () => {
  it('无缓存时完整计算', async () => {
    const result = await getOverviewStats();

    expect(result.totalSku).toBe(500);
    expect(result.strategicProductCount).toBe(50);
    expect(result.turnoverDays).toBe(45);
    expect(result.availabilityRate).toBe(90.0);
    expect(mockCache.set).toHaveBeenCalled();
  });

  it('计算预警商品总数', async () => {
    const result = await getOverviewStats();

    // outOfStock(10) + lowStock(5) + mild(3) + moderate(2) + serious(1) = 21
    expect(result.warningProductCount).toBe(21);
  });

  it('计算临期商品总数', async () => {
    const result = await getOverviewStats();

    // within7Days(5) + within15Days(10) + within30Days(20) = 35
    expect(result.expiringProductCount).toBe(35);
  });

  it('缓存新鲜时直接返回', async () => {
    const cachedStats = { totalSku: 400, warningProductCount: 15 };
    mockCache.getStale.mockReturnValueOnce(cachedStats as any);
    mockCache.isFresh.mockReturnValueOnce(true);

    const result = await getOverviewStats();
    expect(result).toBe(cachedStats);
    expect(getAvailabilityData).not.toHaveBeenCalled();
  });

  it('过期缓存返回旧数据并后台刷新', async () => {
    const staleStats = { totalSku: 300 };
    mockCache.getStale.mockReturnValueOnce(staleStats as any);
    mockCache.isFresh.mockReturnValueOnce(false);

    const result = await getOverviewStats();
    expect(result).toBe(staleStats);
    // 后台刷新是异步的，不等待
  });

  it('period 包含当前月份', async () => {
    const result = await getOverviewStats();
    expect(result.period.current).toMatch(/^\d{4}-\d{2}$/);
    expect(result.period.type).toBe('month');
  });
});

// ==================== getOverviewFull ====================

describe('getOverviewFull', () => {
  it('返回 stats + trend', async () => {
    // trend 需要 mock appQuery
    mockAppQuery.mockResolvedValueOnce(mockQueryResult([]));

    const result = await getOverviewFull();
    expect(result.stats).toBeDefined();
    expect(result.trend).toBeDefined();
    expect(result.trend.data.length).toBeGreaterThan(0);
  });
});

// ==================== getTrendData ====================

describe('getTrendData', () => {
  it('有历史数据时使用数据库数据', async () => {
    const rows = [
      { date: new Date('2026-05-28'), rate: 85.5, in_stock_count: 400, total_count: 500 },
      { date: new Date('2026-05-29'), rate: 86.0, in_stock_count: 410, total_count: 500 },
    ];
    mockAppQuery.mockResolvedValueOnce(mockQueryResult(rows));

    const result = await getTrendData(7);
    expect(result.data).toHaveLength(2);
    expect(result.data[0].availabilityRate).toBe(85.5);
    expect(result.period).toBe('7天');
  });

  it('无历史数据时生成模拟数据', async () => {
    mockAppQuery.mockResolvedValueOnce(mockQueryResult([]));

    const result = await getTrendData(7);
    expect(result.data).toHaveLength(7);
    expect(result.period).toBe('7天');
  });

  it('缓存命中时直接返回', async () => {
    const cachedTrend = { data: [{ date: '2026-05-28', availabilityRate: 85 }], period: '7天' };
    mockCache.get.mockReturnValueOnce(cachedTrend);

    const result = await getTrendData(7);
    expect(result).toBe(cachedTrend);
    expect(mockAppQuery).not.toHaveBeenCalled();
  });

  it('数据库查询失败时回退到模拟数据', async () => {
    mockAppQuery.mockRejectedValueOnce(new Error('table not found'));

    const result = await getTrendData(7);
    expect(result.data).toHaveLength(7);
  });

  it('自定义天数参数', async () => {
    mockAppQuery.mockResolvedValueOnce(mockQueryResult([]));

    const result = await getTrendData(14);
    expect(result.data).toHaveLength(14);
    expect(result.period).toBe('14天');
  });
});
