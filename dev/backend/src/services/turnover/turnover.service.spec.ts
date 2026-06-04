/**
 * 库存周转天数服务单元测试
 */

jest.mock('../../utils/logger', () => ({
  createLogger: () => ({ warn: jest.fn(), info: jest.fn(), error: jest.fn() }),
}));

jest.mock('../../utils/cache', () => ({
  cache: {
    get: jest.fn().mockReturnValue(null),
    set: jest.fn(),
    invalidate: jest.fn(),
  },
  CACHE_TTL: { DASHBOARD: 60000 },
}));

jest.mock('../../utils/constants', () => ({
  STANDARD_CALC_DAYS: 30,
  TURNOVER_EXCELLENT_DAYS: 30,
  TURNOVER_GOOD_DAYS: 60,
  TURNOVER_ATTENTION_DAYS: 90,
  OVERSTOCK_MILD_DAYS: 60,
  OVERSTOCK_MODERATE_DAYS: 90,
  OVERSTOCK_SERIOUS_DAYS: 120,
  getTurnoverHealthStatus: (days: number) => {
    if (days <= 30) return 'excellent';
    if (days <= 60) return 'good';
    if (days <= 90) return 'attention';
    return 'warning';
  },
}));

jest.mock('../erp-client/erp-product.service', () => ({
  fetchAllProducts: jest.fn(),
}));

jest.mock('../erp-client/erp-inventory.service', () => ({
  getStockByNameMap: jest.fn(),
}));

jest.mock('../erp-client/erp-sales-detail.service', () => ({
  getDailySalesMap: jest.fn(),
}));

jest.mock('../erp-client/erp-stock-cost.service', () => ({
  getStockCostByMonth: jest.fn(),
}));

jest.mock('../../utils/arrayAggregation', () => ({
  getCategoryName: jest.fn().mockReturnValue('未分类'),
}));

import { getStockCostByMonth } from '../erp-client/erp-stock-cost.service';
import { fetchAllProducts } from '../erp-client/erp-product.service';
import { getStockByNameMap } from '../erp-client/erp-inventory.service';
import { getDailySalesMap } from '../erp-client/erp-sales-detail.service';
import { getTurnoverData } from './turnover.service';

beforeEach(() => {
  jest.resetAllMocks();
  // 恢复默认 mock 行为
  (fetchAllProducts as jest.Mock).mockResolvedValue([]);
  (getStockByNameMap as jest.Mock).mockResolvedValue(new Map());
  (getDailySalesMap as jest.Mock).mockResolvedValue(new Map());
});

describe('getTurnoverData', () => {
  it('有库存成本数据时计算周转天数', async () => {
    // 模拟本月和上月库存成本
    (getStockCostByMonth as jest.Mock)
      .mockResolvedValueOnce({ totalCostAmount: 60000, itemCount: 100 }) // 本月
      .mockResolvedValueOnce({ totalCostAmount: 50000, itemCount: 90 })  // 上月
      .mockResolvedValueOnce({ totalCostAmount: 0 })  // 品类本月
      .mockResolvedValueOnce({ totalCostAmount: 0 }); // 品类上月

    const result = await getTurnoverData();

    expect(result.value).toBeGreaterThan(0);
    expect(result.unit).toBe('day');
    expect(result.healthStatus).toBeDefined();
    expect(result.warningStats).toBeDefined();
  });

  it('无库存成本时周转天数为 0', async () => {
    (getStockCostByMonth as jest.Mock).mockResolvedValue({ totalCostAmount: 0, itemCount: 0 });

    const result = await getTurnoverData();

    expect(result.value).toBe(0);
  });

  it('计算环比趋势', async () => {
    (getStockCostByMonth as jest.Mock)
      .mockResolvedValueOnce({ totalCostAmount: 120000, itemCount: 200 }) // 本月（周转=15天）
      .mockResolvedValueOnce({ totalCostAmount: 60000, itemCount: 100 })  // 上月（周转=15天）
      .mockResolvedValueOnce({ totalCostAmount: 0 })
      .mockResolvedValueOnce({ totalCostAmount: 0 });

    const result = await getTurnoverData();
    expect(result.trend).toBeDefined();
    expect(result.trendDirection).toBeDefined();
  });

  it('包含品类周转数据', async () => {
    (getStockCostByMonth as jest.Mock).mockResolvedValue({ totalCostAmount: 0, itemCount: 0 });

    const result = await getTurnoverData();
    expect(result.categories).toBeDefined();
    expect(Array.isArray(result.categories)).toBe(true);
  });
});
