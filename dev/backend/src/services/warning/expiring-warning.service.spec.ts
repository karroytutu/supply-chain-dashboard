/**
 * 临期预警服务单元测试
 */

jest.mock('../../utils/logger', () => ({
  createLogger: () => ({ info: jest.fn(), error: jest.fn(), warn: jest.fn() }),
}));

jest.mock('../erp-client/erp-product.service', () => ({
  fetchAllProducts: jest.fn(),
}));

jest.mock('../erp-client/erp-inventory.service', () => ({
  getCostPriceByNameMap: jest.fn(),
}));

jest.mock('../erp-client/erp-batch-inventory.service', () => ({
  fetchAllBatchInventory: jest.fn(),
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
import { getCostPriceByNameMap } from '../erp-client/erp-inventory.service';
import { fetchAllBatchInventory } from '../erp-client/erp-batch-inventory.service';
import { getStrategicGoodsIds } from './warning-cache';
import { getExpiringProducts } from './expiring-warning.service';

const mockFetchProducts = fetchAllProducts as jest.MockedFunction<typeof fetchAllProducts>;
const mockCostPrice = getCostPriceByNameMap as jest.MockedFunction<typeof getCostPriceByNameMap>;
const mockBatchInventory = fetchAllBatchInventory as jest.MockedFunction<typeof fetchAllBatchInventory>;
const mockStrategicIds = getStrategicGoodsIds as jest.MockedFunction<typeof getStrategicGoodsIds>;

describe('expiring-warning.service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockStrategicIds.mockResolvedValue(new Set());
    mockCostPrice.mockResolvedValue(new Map());
  });

  describe('getExpiringProducts', () => {
    it('返回临期商品列表', async () => {
      mockFetchProducts.mockResolvedValueOnce([
        { goodsId: '1', name: '临期商品A', state: 0, typeChainName: '分类', unitFactor: '1' },
      ] as any);
      mockBatchInventory.mockResolvedValueOnce([
        { goodsName: '临期商品A', daysToExpire: 10, baseQuantity: 100, baseCostPrice: '10', expireDate: '2026-07-01' },
      ] as any);

      const result = await getExpiringProducts(7, 15, { page: 1, pageSize: 10 });

      expect(result.data).toHaveLength(1);
      expect(result.data[0].productName).toBe('临期商品A');
    });

    it('过滤掉不在范围内的批次', async () => {
      mockFetchProducts.mockResolvedValueOnce([
        { goodsId: '1', name: '非临期商品', state: 0, typeChainName: '分类', unitFactor: '1' },
      ] as any);
      mockBatchInventory.mockResolvedValueOnce([
        { goodsName: '非临期商品', daysToExpire: 60, baseQuantity: 50, baseCostPrice: '5', expireDate: '2026-09-01' },
      ] as any);

      const result = await getExpiringProducts(7, 15, { page: 1, pageSize: 10 });

      expect(result.data).toHaveLength(0); // 60天 > 15天上限，不在范围内
    });

    it('战略商品筛选', async () => {
      mockStrategicIds.mockResolvedValue(new Set(['1']));
      mockFetchProducts.mockResolvedValueOnce([
        { goodsId: '1', name: '战略临期', state: 0, typeChainName: '分类', unitFactor: '1' },
        { goodsId: '2', name: '普通临期', state: 0, typeChainName: '分类', unitFactor: '1' },
      ] as any);
      mockBatchInventory.mockResolvedValueOnce([
        { goodsName: '战略临期', daysToExpire: 10, baseQuantity: 100, baseCostPrice: '10', expireDate: '2026-07-01' },
        { goodsName: '普通临期', daysToExpire: 10, baseQuantity: 50, baseCostPrice: '5', expireDate: '2026-07-01' },
      ] as any);

      const result = await getExpiringProducts(7, 15, {
        page: 1,
        pageSize: 10,
        strategicLevel: 'strategic',
      });

      expect(result.data).toHaveLength(1);
      expect(result.data[0].productName).toBe('战略临期');
    });
  });
});
