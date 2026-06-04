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
  fetchAllInventory: jest.fn(),
  getStockByNameMap: jest.fn(),
}));
jest.mock('../erp-client/erp-sales-detail.service', () => ({
  getLastSaleMap: jest.fn(),
}));
jest.mock('../../utils/arrayAggregation', () => ({
  getCategoryName: jest.fn((chain: string | null) => chain ? chain.split('/')[0] : '未分类'),
}));

import { getSlowMovingData, getSlowMovingProducts } from './slowMoving.service';
import { fetchAllProducts } from '../erp-client/erp-product.service';
import { fetchAllInventory, getStockByNameMap } from '../erp-client/erp-inventory.service';
import { getLastSaleMap } from '../erp-client/erp-sales-detail.service';

const mockFetchAllProducts = fetchAllProducts as jest.MockedFunction<typeof fetchAllProducts>;
const mockFetchAllInventory = fetchAllInventory as jest.MockedFunction<typeof fetchAllInventory>;
const mockGetStockByNameMap = getStockByNameMap as jest.MockedFunction<typeof getStockByNameMap>;
const mockGetLastSaleMap = getLastSaleMap as jest.MockedFunction<typeof getLastSaleMap>;

function daysAgo(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString();
}

describe('getSlowMovingData', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('calculates slow moving rate and distribution correctly', async () => {
    mockFetchAllInventory.mockResolvedValue([
      { goodsName: 'A', availableBaseQuantity: 100, baseCostPrice: '10' },
      { goodsName: 'B', availableBaseQuantity: 200, baseCostPrice: '5' },
      { goodsName: 'C', availableBaseQuantity: 50, baseCostPrice: '20' },
      { goodsName: 'D', availableBaseQuantity: 30, baseCostPrice: '15' },
    ] as any);
    mockGetLastSaleMap.mockResolvedValue(new Map([
      ['A', daysAgo(10)],   // 7-15 days: mild
      ['B', daysAgo(20)],   // 15-30 days: moderate
      ['C', daysAgo(60)],   // >30 days: serious
      // D: no last sale → 999 days → serious
    ]));

    const result = await getSlowMovingData();

    expect(result.unit).toBe('percent');
    expect(result.value).toBeGreaterThan(0);
    expect(result.distribution).toHaveLength(3);
    expect(result.warningStats.mildSlowMoving).toBe(1);
    expect(result.warningStats.moderateSlowMoving).toBe(1);
    expect(result.warningStats.seriousSlowMoving).toBe(2);
    expect(result.slowMovingCost).toBeGreaterThan(0);
    expect(result.totalCost).toBeGreaterThan(0);
  });

  it('skips records with zero available quantity', async () => {
    mockFetchAllInventory.mockResolvedValue([
      { goodsName: 'A', availableBaseQuantity: 0, baseCostPrice: '10' },
    ] as any);
    mockGetLastSaleMap.mockResolvedValue(new Map());

    const result = await getSlowMovingData();
    expect(result.totalCost).toBe(0);
    expect(result.value).toBe(0);
  });

  it('handles empty inventory', async () => {
    mockFetchAllInventory.mockResolvedValue([]);
    mockGetLastSaleMap.mockResolvedValue(new Map());

    const result = await getSlowMovingData();
    expect(result.value).toBe(0);
    expect(result.distribution).toHaveLength(3);
  });

  it('treats products with no sale history as 999 days without sale', async () => {
    mockFetchAllInventory.mockResolvedValue([
      { goodsName: 'X', availableBaseQuantity: 10, baseCostPrice: '100' },
    ] as any);
    mockGetLastSaleMap.mockResolvedValue(new Map());

    const result = await getSlowMovingData();
    expect(result.warningStats.seriousSlowMoving).toBe(1);
    expect(result.slowMovingCost).toBe(1000); // 10 * 100
  });
});

describe('getSlowMovingProducts', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns paginated slow-moving products sorted by daysWithoutSale desc', async () => {
    const products = [
      { goodsId: 1, name: 'A', baseUnitName: '个', pkgUnitName: '箱', unitFactor: 10, categoryChainName: '食品', state: 0 },
      { goodsId: 2, name: 'B', baseUnitName: '个', pkgUnitName: '箱', unitFactor: 5, categoryChainName: '饮品', state: 0 },
    ];
    mockFetchAllProducts.mockResolvedValue(products as any);
    mockGetStockByNameMap.mockResolvedValue(new Map([['A', 100], ['B', 50]]));
    mockGetLastSaleMap.mockResolvedValue(new Map([
      ['A', daysAgo(10)],
      ['B', daysAgo(25)],
    ]));

    const result = await getSlowMovingProducts(7, null, 1, 10);

    expect(result.total).toBe(2);
    // Sorted by daysWithoutSale desc, B (25 days) first
    expect(result.data[0].productName).toBe('B');
    expect(result.data[0]!.slowMoving!.daysWithoutSale).toBeGreaterThan(result.data[1]!.slowMoving!.daysWithoutSale);
  });

  it('filters by maxDays when provided', async () => {
    mockFetchAllProducts.mockResolvedValue([
      { goodsId: 1, name: 'A', baseUnitName: '个', pkgUnitName: '箱', unitFactor: 10, categoryChainName: '食品', state: 0 },
    ] as any);
    mockGetStockByNameMap.mockResolvedValue(new Map([['A', 100]]));
    mockGetLastSaleMap.mockResolvedValue(new Map([['A', daysAgo(60)]]));

    // maxDays=30, but A has 60 days without sale → filtered out
    const result = await getSlowMovingProducts(7, 30, 1, 10);
    expect(result.total).toBe(0);
  });

  it('excludes products with zero stock', async () => {
    mockFetchAllProducts.mockResolvedValue([
      { goodsId: 1, name: 'A', baseUnitName: '个', pkgUnitName: '箱', unitFactor: 10, categoryChainName: null, state: 0 },
    ] as any);
    mockGetStockByNameMap.mockResolvedValue(new Map([['A', 0]]));
    mockGetLastSaleMap.mockResolvedValue(new Map());

    const result = await getSlowMovingProducts(7, null, 1, 10);
    expect(result.total).toBe(0);
  });
});
