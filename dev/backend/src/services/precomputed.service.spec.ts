/**
 * 预计算服务单元测试
 */

jest.mock('../utils/logger', () => ({
  createLogger: () => ({ info: jest.fn(), error: jest.fn(), warn: jest.fn() }),
}));

jest.mock('../utils/cache', () => {
  const cacheMock = {
    get: jest.fn(),
    set: jest.fn(),
    invalidate: jest.fn(),
  };
  return {
    cache: cacheMock,
    CACHE_TTL: { LOW_FREQUENCY: 300000 },
  };
});

jest.mock('../utils/constants', () => ({
  STANDARD_CALC_DAYS: 30,
}));

jest.mock('./erp-client/erp-inventory.service', () => ({
  getStockSummaryMap: jest.fn(),
}));

jest.mock('./erp-client/erp-sales-detail.service', () => ({
  getDailySalesMap: jest.fn(),
}));

import { cache, CACHE_TTL } from '../utils/cache';
import { getStockSummaryMap as getInventoryStockMap } from './erp-client/erp-inventory.service';
import { getDailySalesMap as getErpDailySalesMap } from './erp-client/erp-sales-detail.service';
import {
  getDailySalesMap,
  getStockSummaryMap,
  invalidatePrecomputedCache,
} from './precomputed.service';

const mockCache = cache as jest.Mocked<typeof cache>;
const mockGetErpSales = getErpDailySalesMap as jest.MockedFunction<typeof getErpDailySalesMap>;
const mockGetInventoryStock = getInventoryStockMap as jest.MockedFunction<typeof getInventoryStockMap>;

describe('precomputed.service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('getDailySalesMap', () => {
    it('缓存命中时直接返回', async () => {
      const cachedMap = new Map([['商品A', 10]]);
      mockCache.get.mockReturnValueOnce(cachedMap);

      const result = await getDailySalesMap();

      expect(result).toBe(cachedMap);
      expect(mockGetErpSales).not.toHaveBeenCalled();
    });

    it('缓存未命中时从 ERP 获取并缓存', async () => {
      mockCache.get.mockReturnValueOnce(null);
      const salesMap = new Map([['商品A', 10], ['商品B', 20]]);
      mockGetErpSales.mockResolvedValueOnce(salesMap);

      const result = await getDailySalesMap();

      expect(result).toBe(salesMap);
      expect(mockCache.set).toHaveBeenCalledWith(
        'daily_sales:map',
        salesMap,
        CACHE_TTL.LOW_FREQUENCY
      );
    });
  });

  describe('getStockSummaryMap', () => {
    it('缓存命中时直接返回', async () => {
      const cachedMap = new Map([['1001', 50]]);
      mockCache.get.mockReturnValueOnce(cachedMap);

      const result = await getStockSummaryMap();

      expect(result).toBe(cachedMap);
      expect(mockGetInventoryStock).not.toHaveBeenCalled();
    });

    it('缓存未命中时从 ERP 获取并转换 key 为 string', async () => {
      mockCache.get.mockReturnValueOnce(null);
      // ERP 返回 number key
      const erpMap = new Map<number, number>([[1001, 50], [1002, 30]]);
      mockGetInventoryStock.mockResolvedValueOnce(erpMap);

      const result = await getStockSummaryMap();

      expect(result.get('1001')).toBe(50);
      expect(result.get('1002')).toBe(30);
      expect(mockCache.set).toHaveBeenCalledWith(
        'stock:summary:map',
        result,
        CACHE_TTL.LOW_FREQUENCY
      );
    });
  });

  describe('invalidatePrecomputedCache', () => {
    it('清除日均销售和库存汇总缓存', () => {
      invalidatePrecomputedCache();

      expect(mockCache.invalidate).toHaveBeenCalledWith('daily_sales:');
      expect(mockCache.invalidate).toHaveBeenCalledWith('stock:summary:');
    });
  });
});
