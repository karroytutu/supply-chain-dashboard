/**
 * 缺货和低库存预警服务单元测试
 */

jest.mock('../../utils/logger', () => ({
  createLogger: () => ({ info: jest.fn(), error: jest.fn(), warn: jest.fn() }),
}));

jest.mock('../erp-client/erp-product.service', () => ({
  fetchAllProducts: jest.fn(),
}));

jest.mock('../erp-client/erp-inventory.service', () => ({
  getStockSummaryMap: jest.fn(),
}));

jest.mock('../erp-client/erp-sales-detail.service', () => ({
  getDailySalesMap: jest.fn(),
}));

jest.mock('./warning-cache', () => ({
  getStrategicGoodsIds: jest.fn(),
}));

jest.mock('../../utils/constants', () => ({
  LOW_STOCK_DAYS: 15,
  STANDARD_CALC_DAYS: 30,
}));

jest.mock('../../utils/unitConverter', () => ({
  convertStockUnits: (v: number) => v,
  parseUnitFactor: (v: any) => 1,
  parseQuantity: (v: any) => Number(v) || 0,
}));

jest.mock('../../utils/arrayAggregation', () => ({
  getCategoryName: () => '默认分类',
}));

import { fetchAllProducts } from '../erp-client/erp-product.service';
import { getStockSummaryMap } from '../erp-client/erp-inventory.service';
import { getDailySalesMap } from '../erp-client/erp-sales-detail.service';
import { getStrategicGoodsIds } from './warning-cache';
import { getOutOfStockProducts, getLowStockProducts } from './stock-warning.service';

const mockFetchProducts = fetchAllProducts as jest.MockedFunction<typeof fetchAllProducts>;
const mockStockMap = getStockSummaryMap as jest.MockedFunction<typeof getStockSummaryMap>;
const mockSalesMap = getDailySalesMap as jest.MockedFunction<typeof getDailySalesMap>;
const mockStrategicIds = getStrategicGoodsIds as jest.MockedFunction<typeof getStrategicGoodsIds>;

describe('stock-warning.service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockStrategicIds.mockResolvedValue(new Set());
  });

  describe('getOutOfStockProducts', () => {
    it('返回零库存商品列表', async () => {
      mockFetchProducts.mockResolvedValueOnce([
        { goodsId: '1', name: '商品A', state: 0, typeChainName: '分类A', unitFactor: '1' },
        { goodsId: '2', name: '商品B', state: 0, typeChainName: '分类B', unitFactor: '1' },
      ] as any);
      mockStockMap.mockResolvedValueOnce(new Map([['1', 0], ['2', 5]]) as any);
      mockSalesMap.mockResolvedValueOnce(new Map([['商品A', 10], ['商品B', 5]]));

      const result = await getOutOfStockProducts({ page: 1, pageSize: 10 });

      expect(result.data).toHaveLength(1);
      expect(result.data[0].productName).toBe('商品A'); // 只有商品A库存为0
    });

    it('战略商品筛选', async () => {
      mockStrategicIds.mockResolvedValue(new Set(['1']));
      mockFetchProducts.mockResolvedValueOnce([
        { goodsId: '1', name: '战略商品', state: 0, typeChainName: '分类', unitFactor: '1' },
        { goodsId: '2', name: '普通商品', state: 0, typeChainName: '分类', unitFactor: '1' },
      ] as any);
      mockStockMap.mockResolvedValueOnce(new Map([['1', 0], ['2', 0]]) as any);
      mockSalesMap.mockResolvedValueOnce(new Map());

      const result = await getOutOfStockProducts({
        page: 1,
        pageSize: 10,
        strategicLevel: 'strategic',
      });

      expect(result.data).toHaveLength(1);
      expect(result.data[0].productName).toBe('战略商品');
    });

    it('分页正确', async () => {
      const products = Array.from({ length: 25 }, (_, i) => ({
        goodsId: String(i),
        name: `商品${i}`,
        state: 0,
        typeChainName: '分类',
        unitFactor: '1',
      }));
      mockFetchProducts.mockResolvedValueOnce(products as any);
      mockStockMap.mockResolvedValueOnce(new Map(products.map((_, i) => [i, 0])) as any);
      mockSalesMap.mockResolvedValueOnce(new Map());

      const result = await getOutOfStockProducts({ page: 2, pageSize: 10 });

      expect(result.total).toBe(25);
      expect(result.totalPages).toBe(3);
      expect(result.data).toHaveLength(10);
    });
  });

  describe('getLowStockProducts', () => {
    it('返回低库存商品（可售天数 < 15天）', async () => {
      mockFetchProducts.mockResolvedValueOnce([
        { goodsId: '1', name: '低库存商品', state: 0, typeChainName: '分类', unitFactor: '1' },
        { goodsId: '2', name: '正常商品', state: 0, typeChainName: '分类', unitFactor: '1' },
      ] as any);
      mockStockMap.mockResolvedValueOnce(new Map([['1', 10], ['2', 100]]) as any);
      mockSalesMap.mockResolvedValueOnce(new Map([['低库存商品', 2], ['正常商品', 1]]));

      const result = await getLowStockProducts({ page: 1, pageSize: 10 });

      // 商品1: 10/2=5天 < 15天，属于低库存
      // 商品2: 100/1=100天 > 15天，不属于低库存
      expect(result.data.length).toBeGreaterThanOrEqual(1);
    });
  });
});
