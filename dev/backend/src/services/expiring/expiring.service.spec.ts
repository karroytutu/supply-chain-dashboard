jest.mock('../../utils/logger', () => ({
  createLogger: () => ({ warn: jest.fn(), info: jest.fn(), error: jest.fn() }),
}));
jest.mock('../../utils/errorUtils', () => ({
  getErrorMessage: (e: unknown) => (e instanceof Error ? e.message : String(e)),
}));
jest.mock('../erp-client/erp-product.service', () => ({
  fetchAllProducts: jest.fn(),
}));
jest.mock('../erp-client/erp-inventory.service', () => ({
  getStockByNameMap: jest.fn(),
  getCostPriceByNameMap: jest.fn(),
}));
jest.mock('../erp-client/erp-batch-inventory.service', () => ({
  fetchAllBatchInventory: jest.fn(),
}));
jest.mock('../../utils/arrayAggregation', () => ({
  getCategoryName: jest.fn((chain: string | null) => chain ? chain.split('/')[0] : '未分类'),
}));

import { getExpiringData, getExpiringProducts } from './expiring.service';
import { fetchAllProducts } from '../erp-client/erp-product.service';
import { getStockByNameMap, getCostPriceByNameMap } from '../erp-client/erp-inventory.service';
import { fetchAllBatchInventory } from '../erp-client/erp-batch-inventory.service';

const mockFetchAllProducts = fetchAllProducts as jest.MockedFunction<typeof fetchAllProducts>;
const mockGetCostPriceByNameMap = getCostPriceByNameMap as jest.MockedFunction<typeof getCostPriceByNameMap>;
const mockGetStockByNameMap = getStockByNameMap as jest.MockedFunction<typeof getStockByNameMap>;
const mockFetchAllBatchInventory = fetchAllBatchInventory as jest.MockedFunction<typeof fetchAllBatchInventory>;

function makeProduct(overrides: any = {}) {
  return {
    goodsId: 1,
    name: '测试商品',
    state: 0,
    shelfLife: 90,
    baseUnitName: '个',
    pkgUnitName: '箱',
    unitFactor: 10,
    categoryChainName: '食品/零食',
    ...overrides,
  };
}

function makeBatch(overrides: any = {}) {
  return {
    goodsName: '测试商品',
    quantity: '100',
    unitName: '个',
    daysToExpire: 5,
    expireDate: '2026-06-10',
    ...overrides,
  };
}

describe('getExpiringData', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns correct expiring rate and breakdown', async () => {
    mockFetchAllProducts.mockResolvedValue([makeProduct()] as any);
    mockGetCostPriceByNameMap.mockResolvedValue(new Map([['测试商品', 10]]));
    mockFetchAllBatchInventory.mockResolvedValue([
      makeBatch({ daysToExpire: 5 }),  // within 7 days (serious)
      makeBatch({ daysToExpire: 10, quantity: '200' }),  // within 15 days (warning)
      makeBatch({ daysToExpire: 20, quantity: '300' }),  // within 30 days (attention)
      makeBatch({ daysToExpire: 60, quantity: '500' }),  // not expiring (but shelfLife=90, threshold=30)
    ] as any);

    const result = await getExpiringData();

    expect(result.unit).toBe('percent');
    expect(result.within7Days).toBe(1);
    expect(result.within15Days).toBe(1);
    expect(result.within30Days).toBe(1);
    expect(result.breakdown).toHaveLength(3);
    expect(result.totalCost).toBeGreaterThan(0);
  });

  it('skips inactive products (state !== 0)', async () => {
    mockFetchAllProducts.mockResolvedValue([makeProduct({ state: 1 })] as any);
    mockGetCostPriceByNameMap.mockResolvedValue(new Map([['测试商品', 10]]));
    mockFetchAllBatchInventory.mockResolvedValue([makeBatch()] as any);

    const result = await getExpiringData();
    expect(result.totalCost).toBe(0);
  });

  it('handles empty batch inventory', async () => {
    mockFetchAllProducts.mockResolvedValue([makeProduct()] as any);
    mockGetCostPriceByNameMap.mockResolvedValue(new Map());
    mockFetchAllBatchInventory.mockResolvedValue([]);

    const result = await getExpiringData();
    expect(result.value).toBe(0);
    expect(result.healthStatus).toBe('excellent');
  });

  it('handles pkg unit conversion', async () => {
    mockFetchAllProducts.mockResolvedValue([makeProduct({ unitFactor: 10 })] as any);
    mockGetCostPriceByNameMap.mockResolvedValue(new Map([['测试商品', 5]]));
    mockFetchAllBatchInventory.mockResolvedValue([
      makeBatch({ unitName: '箱', quantity: '2', daysToExpire: 5 }),
    ] as any);

    const result = await getExpiringData();
    // base qty = 2 * 10 = 20, cost = 20 * 5 = 100
    expect(result.totalCost).toBe(100);
  });

  it('classifies health status correctly based on expiring rate', async () => {
    // Setup: total cost = 1000, expiring cost = 60 → rate = 6% → warning
    mockFetchAllProducts.mockResolvedValue([makeProduct()] as any);
    mockGetCostPriceByNameMap.mockResolvedValue(new Map([['测试商品', 10]]));
    mockFetchAllBatchInventory.mockResolvedValue([
      makeBatch({ daysToExpire: 5, quantity: '6' }),   // expiring: 60
      makeBatch({ daysToExpire: 100, quantity: '94' }), // not expiring: 940
    ] as any);

    const result = await getExpiringData();
    expect(result.healthStatus).toBe('warning'); // >5%
  });
});

describe('getExpiringProducts', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns paginated expiring products sorted by daysToExpire', async () => {
    mockFetchAllProducts.mockResolvedValue([makeProduct()] as any);
    mockGetStockByNameMap.mockResolvedValue(new Map([['测试商品', 500]]));
    mockFetchAllBatchInventory.mockResolvedValue([
      makeBatch({ daysToExpire: 10, expireDate: '2026-06-14' }),
      makeBatch({ daysToExpire: 5, expireDate: '2026-06-09' }),
    ] as any);

    const result = await getExpiringProducts(0, 15, 1, 10);

    expect(result.total).toBe(1);
    expect(result.data[0].expiring.daysToExpiry).toBe(5);
    expect(result.data[0].productName).toBe('测试商品');
  });

  it('filters out batches outside the day range', async () => {
    mockFetchAllProducts.mockResolvedValue([makeProduct()] as any);
    mockGetStockByNameMap.mockResolvedValue(new Map());
    mockFetchAllBatchInventory.mockResolvedValue([
      makeBatch({ daysToExpire: 50 }), // outside range
    ] as any);

    const result = await getExpiringProducts(0, 30, 1, 10);
    expect(result.total).toBe(0);
    expect(result.data).toHaveLength(0);
  });

  it('handles pagination correctly', async () => {
    const products = Array.from({ length: 5 }, (_, i) =>
      makeProduct({ goodsId: i + 1, name: `商品${i}` })
    );
    const batches = Array.from({ length: 5 }, (_, i) =>
      makeBatch({ goodsName: `商品${i}`, daysToExpire: i + 1 })
    );

    mockFetchAllProducts.mockResolvedValue(products as any);
    mockGetStockByNameMap.mockResolvedValue(new Map());
    mockFetchAllBatchInventory.mockResolvedValue(batches as any);

    const result = await getExpiringProducts(0, 30, 1, 2);
    expect(result.data).toHaveLength(2);
    expect(result.totalPages).toBe(3);
    expect(result.page).toBe(1);
  });
});
