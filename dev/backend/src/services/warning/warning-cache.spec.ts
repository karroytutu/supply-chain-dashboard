/**
 * 预警缓存管理单元测试
 */

jest.mock('../../utils/logger', () => ({
  createLogger: () => ({ warn: jest.fn(), info: jest.fn(), error: jest.fn() }),
}));

jest.mock('../../db/appPool', () => ({
  appQuery: jest.fn(),
}));

jest.mock('../../utils/cache', () => ({
  cache: {
    get: jest.fn().mockReturnValue(null),
    set: jest.fn(),
    invalidate: jest.fn(),
  },
  CACHE_TTL: { LOW_FREQUENCY: 300000 },
}));

jest.mock('../../utils/cache-keys', () => ({
  CACHE_KEY: { STRATEGIC_PRODUCT_IDS: 'strategic:product:ids' },
}));

import { appQuery } from '../../db/appPool';
import { cache } from '../../utils/cache';
import { mockQueryResult } from '../../__tests__/helpers/mockDb';
import { getStrategicGoodsIds, clearStrategicGoodsCache } from './warning-cache';

const mockAppQuery = appQuery as jest.MockedFunction<typeof appQuery>;
const mockCache = cache as jest.Mocked<typeof cache>;

beforeEach(() => {
  jest.resetAllMocks();
  mockCache.get.mockReturnValue(null);
});

describe('getStrategicGoodsIds', () => {
  it('缓存未命中时从数据库查询', async () => {
    mockAppQuery.mockResolvedValueOnce(
      mockQueryResult([{ goods_id: 'G001' }, { goods_id: 'G002' }])
    );

    const result = await getStrategicGoodsIds();
    expect(result).toBeInstanceOf(Set);
    expect(result.size).toBe(2);
    expect(result.has('G001')).toBe(true);
    expect(result.has('G002')).toBe(true);
    expect(mockCache.set).toHaveBeenCalled();
  });

  it('缓存命中时直接返回', async () => {
    const cachedSet = new Set(['G001']);
    mockCache.get.mockReturnValueOnce(cachedSet);

    const result = await getStrategicGoodsIds();
    expect(result).toBe(cachedSet);
    expect(mockAppQuery).not.toHaveBeenCalled();
  });

  it('数据库查询失败时返回空 Set', async () => {
    mockAppQuery.mockRejectedValueOnce(new Error('DB error'));

    const result = await getStrategicGoodsIds();
    expect(result.size).toBe(0);
  });
});

describe('clearStrategicGoodsCache', () => {
  it('调用 cache.invalidate', () => {
    clearStrategicGoodsCache();
    expect(mockCache.invalidate).toHaveBeenCalledWith('strategic:product:ids');
  });
});
