/**
 * 滞销预警服务单元测试
 */

jest.mock('../../utils/logger', () => ({
  createLogger: () => ({ info: jest.fn(), error: jest.fn(), warn: jest.fn() }),
}));

jest.mock('../erp-client/erp-product.service', () => ({
  fetchAllProducts: jest.fn(),
}));

jest.mock('../erp-client/erp-inventory.service', () => ({
  getStockByNameMap: jest.fn(),
  getCostPriceByNameMap: jest.fn(),
}));

jest.mock('../erp-client/erp-sales-detail.service', () => ({
  getLastSaleMap: jest.fn(),
}));

jest.mock('./warning-cache', () => ({
  getStrategicGoodsIds: jest.fn(),
}));

jest.mock('../../utils/unitConverter', () => ({
  convertStockUnits: (v: any) => v,
  parseUnitFactor: () => 1,
  parseQuantity: (v: any) => Number(v) || 0,
}));

jest.mock('../../utils/arrayAggregation', () => ({
  getCategoryName: () => '默认分类',
}));

import { fetchAllProducts } from '../erp-client/erp-product.service';
import { getStockByNameMap, getCostPriceByNameMap } from '../erp-client/erp-inventory.service';
import { getLastSaleMap } from '../erp-client/erp-sales-detail.service';
import { getStrategicGoodsIds } from './warning-cache';
import { getSlowMovingProducts } from './slowmoving-warning.service';

const mockFetchProducts = fetchAllProducts as jest.MockedFunction<typeof fetchAllProducts>;
const mockStockByName = getStockByNameMap as jest.MockedFunction<typeof getStockByNameMap>;
const mockCostPrice = getCostPriceByNameMap as jest.MockedFunction<typeof getCostPriceByNameMap>;
const mockLastSaleMap = getLastSaleMap as jest.MockedFunction<typeof getLastSaleMap>;
const mockStrategicIds = getStrategicGoodsIds as jest.MockedFunction<typeof getStrategicGoodsIds>;

describe('slowmoving-warning.service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockStrategicIds.mockResolvedValue(new Set());
    mockCostPrice.mockResolvedValue(new Map());
  });

  describe('getSlowMovingProducts', () => {
    it('返回滞销商品（未销售天数 > 7天）', async () => {
      const tenDaysAgo = new Date(Date.now() - 10 * 86400000).toISOString();

      mockFetchProducts.mockResolvedValueOnce([
        { goodsId: '1', name: '滞销商品', state: 0, typeChainName: '分类', unitFactor: '1' },
        { goodsId: '2', name: '畅销商品', state: 0, typeChainName: '分类', unitFactor: '1' },
      ] as any);
      mockStockByName.mockResolvedValueOnce(new Map([['滞销商品', 50], ['畅销商品', 30]]));
      mockLastSaleMap.mockResolvedValueOnce(new Map([['滞销商品', tenDaysAgo], ['畅销商品', new Date().toISOString()]]));

      const result = await getSlowMovingProducts(7, null, { page: 1, pageSize: 10 });

      expect(result.data).toHaveLength(1);
      expect(result.data[0].productName).toBe('滞销商品');
    });

    it('零库存商品不返回', async () => {
      mockFetchProducts.mockResolvedValueOnce([
        { goodsId: '1', name: '零库存', state: 0, typeChainName: '分类', unitFactor: '1' },
      ] as any);
      mockStockByName.mockResolvedValueOnce(new Map([['零库存', 0]]));
      mockLastSaleMap.mockResolvedValueOnce(new Map());

      const result = await getSlowMovingProducts(7, null, { page: 1, pageSize: 10 });

      expect(result.data).toHaveLength(0);
    });

    it('从未销售的商品视为滞销', async () => {
      mockFetchProducts.mockResolvedValueOnce([
        { goodsId: '1', name: '从未销售', state: 0, typeChainName: '分类', unitFactor: '1' },
      ] as any);
      mockStockByName.mockResolvedValueOnce(new Map([['从未销售', 100]]));
      mockLastSaleMap.mockResolvedValueOnce(new Map()); // 无销售记录

      const result = await getSlowMovingProducts(7, null, { page: 1, pageSize: 10 });

      expect(result.data).toHaveLength(1); // daysWithoutSale = 999 > 7
    });
  });
});
