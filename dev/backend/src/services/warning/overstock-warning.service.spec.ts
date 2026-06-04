/**
 * 库存积压预警服务单元测试
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
  getDailySalesMap: jest.fn(),
}));

jest.mock('./warning-cache', () => ({
  getStrategicGoodsIds: jest.fn(),
}));

jest.mock('../../utils/constants', () => ({
  OVERSTOCK_MILD_DAYS: 60,
  OVERSTOCK_MODERATE_DAYS: 90,
  OVERSTOCK_SERIOUS_DAYS: 120,
  STANDARD_CALC_DAYS: 30,
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
import { getDailySalesMap } from '../erp-client/erp-sales-detail.service';
import { getStrategicGoodsIds } from './warning-cache';
import { getOverstockProducts } from './overstock-warning.service';

const mockFetchProducts = fetchAllProducts as jest.MockedFunction<typeof fetchAllProducts>;
const mockStockByName = getStockByNameMap as jest.MockedFunction<typeof getStockByNameMap>;
const mockCostPrice = getCostPriceByNameMap as jest.MockedFunction<typeof getCostPriceByNameMap>;
const mockSalesMap = getDailySalesMap as jest.MockedFunction<typeof getDailySalesMap>;
const mockStrategicIds = getStrategicGoodsIds as jest.MockedFunction<typeof getStrategicGoodsIds>;

describe('overstock-warning.service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockStrategicIds.mockResolvedValue(new Set());
    mockCostPrice.mockResolvedValue(new Map());
  });

  describe('getOverstockProducts', () => {
    it('返回积压商品（可售天数 > 60天）', async () => {
      mockFetchProducts.mockResolvedValueOnce([
        { goodsId: '1', name: '积压商品', state: 0, typeChainName: '分类', unitFactor: '1' },
        { goodsId: '2', name: '正常商品', state: 0, typeChainName: '分类', unitFactor: '1' },
      ] as any);
      mockStockByName.mockResolvedValueOnce(new Map([['积压商品', 200], ['正常商品', 10]]));
      mockSalesMap.mockResolvedValueOnce(new Map([['积压商品', 1], ['正常商品', 5]]));

      const result = await getOverstockProducts(60, null, { page: 1, pageSize: 10 });

      // 积压商品: 200/1=200天 > 60天，积压
      // 正常商品: 10/5=2天 < 60天，不积压
      expect(result.data).toHaveLength(1);
      expect(result.data[0].productName).toBe('积压商品');
    });

    it('无库存或无销量时不返回', async () => {
      mockFetchProducts.mockResolvedValueOnce([
        { goodsId: '1', name: '零库存', state: 0, typeChainName: '分类', unitFactor: '1' },
        { goodsId: '2', name: '零销量', state: 0, typeChainName: '分类', unitFactor: '1' },
      ] as any);
      mockStockByName.mockResolvedValueOnce(new Map([['零库存', 0], ['零销量', 100]]));
      mockSalesMap.mockResolvedValueOnce(new Map([['零库存', 5], ['零销量', 0]]));

      const result = await getOverstockProducts(60, null, { page: 1, pageSize: 10 });

      expect(result.data).toHaveLength(0);
    });

    it('maxDays 参数限制上限', async () => {
      mockFetchProducts.mockResolvedValueOnce([
        { goodsId: '1', name: '轻度积压', state: 0, typeChainName: '分类', unitFactor: '1' },
        { goodsId: '2', name: '严重积压', state: 0, typeChainName: '分类', unitFactor: '1' },
      ] as any);
      mockStockByName.mockResolvedValueOnce(new Map([['轻度积压', 70], ['严重积压', 500]]));
      mockSalesMap.mockResolvedValueOnce(new Map([['轻度积压', 1], ['严重积压', 1]]));

      const result = await getOverstockProducts(60, 120, { page: 1, pageSize: 10 });

      // 轻度: 70天在60-120之间
      // 严重: 500天 > 120天上限，被过滤掉
      expect(result.data).toHaveLength(1);
      expect(result.data[0].productName).toBe('轻度积压');
    });
  });
});
