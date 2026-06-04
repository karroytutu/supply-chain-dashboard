/**
 * Dashboard 服务聚合入口单元测试
 */

jest.mock('../utils/cache', () => ({
  cache: {
    get: jest.fn().mockReturnValue(null),
    set: jest.fn(),
    invalidate: jest.fn(),
  },
  CACHE_TTL: { DASHBOARD: 60000 },
}));

jest.mock('./availability', () => ({
  getAvailabilityData: jest.fn(),
  getCategoryTreeData: jest.fn(),
  getOutOfStockProductsByCategory: jest.fn(),
}));

jest.mock('./turnover', () => ({
  getTurnoverData: jest.fn(),
}));

jest.mock('./expiring', () => ({
  getExpiringData: jest.fn(),
}));

jest.mock('./slowMoving', () => ({
  getSlowMovingData: jest.fn(),
}));

jest.mock('./warning', () => ({
  getWarningProducts: jest.fn(),
}));

jest.mock('../utils/logger', () => ({
  createLogger: () => ({ warn: jest.fn(), info: jest.fn(), error: jest.fn() }),
}));

import { cache } from '../utils/cache';
import { getAvailabilityData } from './availability';
import { getTurnoverData } from './turnover';
import { getExpiringData } from './expiring';
import { getSlowMovingData } from './slowMoving';
import { getDashboardData } from './dashboard.service';

const mockCache = cache as jest.Mocked<typeof cache>;

function setupDefaultMocks() {
  (getAvailabilityData as jest.Mock).mockResolvedValue({
    totalSku: 500, value: 85.5, warningStats: {},
  });
  (getTurnoverData as jest.Mock).mockResolvedValue({
    value: 45, warningStats: {},
  });
  (getExpiringData as jest.Mock).mockResolvedValue({
    within7Days: 5, within15Days: 10, within30Days: 20,
  });
  (getSlowMovingData as jest.Mock).mockResolvedValue({
    slowMovingCost: 30000,
  });
}

beforeEach(() => {
  jest.resetAllMocks();
  mockCache.get.mockReturnValue(null);
  setupDefaultMocks();
});

// ==================== getDashboardData ====================

describe('getDashboardData', () => {
  it('聚合所有模块数据', async () => {
    const result = await getDashboardData();

    expect(result.availability).toBeDefined();
    expect(result.availability.totalSku).toBe(500);
    expect(result.turnover).toBeDefined();
    expect(result.turnover.value).toBe(45);
    expect(result.expiring).toBeDefined();
    expect(result.slowMoving).toBeDefined();
  });

  it('包含时间周期信息', async () => {
    const result = await getDashboardData();

    expect(result.period.current).toMatch(/^\d{4}-\d{2}$/);
    expect(result.period.previous).toMatch(/^\d{4}-\d{2}$/);
    expect(result.period.type).toBe('month');
  });

  it('缓存命中时直接返回', async () => {
    const cachedData = { availability: {}, turnover: {}, expiring: {}, slowMoving: {}, period: {} };
    mockCache.get.mockReturnValueOnce(cachedData);

    const result = await getDashboardData();
    expect(result).toBe(cachedData);
    expect(getAvailabilityData).not.toHaveBeenCalled();
  });

  it('写入缓存', async () => {
    await getDashboardData();
    expect(mockCache.set).toHaveBeenCalledWith('dashboard:overview', expect.anything(), 60000);
  });

  it('一月时 previous 为上年12月', async () => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-01-15T12:00:00Z'));

    const result = await getDashboardData();
    expect(result.period.previous).toBe('2025-12');
    expect(result.period.current).toBe('2026-01');

    jest.useRealTimers();
  });
});
