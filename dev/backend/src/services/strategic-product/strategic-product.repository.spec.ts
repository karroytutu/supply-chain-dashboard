/**
 * 战略商品数据访问层单元测试
 * Mock: appPool, cache, ERP 服务
 */

jest.mock('../../db/appPool', () => ({
  appQuery: jest.fn(),
}));

jest.mock('../../utils/logger', () => ({
  createLogger: () => ({ warn: jest.fn(), info: jest.fn(), error: jest.fn() }),
}));

jest.mock('../../utils/cache', () => ({
  cache: {
    get: jest.fn().mockReturnValue(null),
    set: jest.fn(),
    invalidate: jest.fn(),
  },
  CACHE_TTL: { DASHBOARD: 60000, HIGH_FREQUENCY: 30000, LOW_FREQUENCY: 300000 },
}));

jest.mock('../erp-client/erp-product.service', () => ({
  fetchAllProducts: jest.fn(),
  getProductById: jest.fn(),
}));

jest.mock('../erp-client/erp-inventory.service', () => ({
  getStockSummaryMap: jest.fn(),
}));

import { appQuery } from '../../db/appPool';
import { cache } from '../../utils/cache';
import { mockQueryResult, mockQuerySequence } from '../../__tests__/helpers/mockDb';
import { fetchAllProducts } from '../erp-client/erp-product.service';
import { getStockSummaryMap } from '../erp-client/erp-inventory.service';
import {
  getProducts,
  getStats,
  getCategoryTree,
  getProductsForSelection,
  isStrategicProduct,
  getStrategicLevels,
  addProducts,
  deleteProduct,
  confirmProduct,
  batchConfirmProducts,
  batchDeleteProducts,
  invalidateProductCache,
} from './strategic-product.repository';

const mockAppQuery = appQuery as jest.MockedFunction<typeof appQuery>;
const mockCache = cache as jest.Mocked<typeof cache>;
const mockFetchProducts = fetchAllProducts as jest.MockedFunction<typeof fetchAllProducts>;
const mockStockMap = getStockSummaryMap as jest.MockedFunction<typeof getStockSummaryMap>;

beforeEach(() => {
  jest.resetAllMocks();
  mockCache.get.mockReturnValue(null);
  mockFetchProducts.mockResolvedValue([]);
  mockStockMap.mockResolvedValue(new Map());
});

// ==================== getProducts ====================

describe('getProducts', () => {
  it('无过滤条件查询全部', async () => {
    mockQuerySequence(mockAppQuery, [[{ total: '10' }], []]);

    const result = await getProducts({ page: 1, pageSize: 20 });
    expect(result.total).toBe(10);
    expect(result.page).toBe(1);
    expect(result.totalPages).toBe(1);
  });

  it('分页计算正确', async () => {
    mockQuerySequence(mockAppQuery, [[{ total: '50' }], []]);

    await getProducts({ page: 3, pageSize: 10 });
    const listParams = mockAppQuery.mock.calls[1][1] as any[];
    expect(listParams[listParams.length - 1]).toBe(20); // offset
    expect(listParams[listParams.length - 2]).toBe(10); // limit
  });

  it('status 过滤条件', async () => {
    mockQuerySequence(mockAppQuery, [[{ total: '0' }], []]);

    await getProducts({ status: 'pending' });
    const sql = mockAppQuery.mock.calls[0][0] as string;
    expect(sql).toContain('sp.status = $1');
  });

  it('categoryPath LIKE 过滤', async () => {
    mockQuerySequence(mockAppQuery, [[{ total: '0' }], []]);

    await getProducts({ categoryPath: '食品' });
    const sql = mockAppQuery.mock.calls[0][0] as string;
    expect(sql).toContain('category_path LIKE');
  });

  it('keyword ILIKE 过滤', async () => {
    mockQuerySequence(mockAppQuery, [[{ total: '0' }], []]);

    await getProducts({ keyword: '测试' });
    const sql = mockAppQuery.mock.calls[0][0] as string;
    expect(sql).toContain('ILIKE');
  });
});

// ==================== getStats ====================

describe('getStats', () => {
  it('返回统计数据', async () => {
    const stats = { total: '20', pending: '5', confirmed: '10', rejected: '5' };
    mockAppQuery.mockResolvedValueOnce(mockQueryResult([stats]));

    const result = await getStats();
    expect(result.total).toBe('20');
    expect(result.pending).toBe('5');
  });

  it('缓存命中时不查数据库', async () => {
    const cachedStats = { total: '15' };
    mockCache.get.mockReturnValueOnce(cachedStats);

    const result = await getStats();
    expect(result).toBe(cachedStats);
    expect(mockAppQuery).not.toHaveBeenCalled();
  });
});

// ==================== isStrategicProduct ====================

describe('isStrategicProduct', () => {
  it('是战略商品返回 true', async () => {
    mockAppQuery.mockResolvedValueOnce(mockQueryResult([{ '?column?': 1 }]));
    const result = await isStrategicProduct('G001');
    expect(result).toBe(true);
  });

  it('非战略商品返回 false', async () => {
    mockAppQuery.mockResolvedValueOnce(mockQueryResult([]));
    const result = await isStrategicProduct('G999');
    expect(result).toBe(false);
  });
});

// ==================== getStrategicLevels ====================

describe('getStrategicLevels', () => {
  it('批量获取战略等级', async () => {
    mockAppQuery.mockResolvedValueOnce(mockQueryResult([{ goods_id: 'G001' }]));

    const result = await getStrategicLevels(['G001', 'G002']);
    expect(result.get('G001')).toBe('strategic');
    expect(result.get('G002')).toBe('normal');
  });

  it('全部非战略', async () => {
    mockAppQuery.mockResolvedValueOnce(mockQueryResult([]));

    const result = await getStrategicLevels(['G001']);
    expect(result.get('G001')).toBe('normal');
  });
});

// ==================== addProducts ====================

describe('addProducts', () => {
  it('空 goodsIds 直接返回', async () => {
    const result = await addProducts([], 1);
    expect(result.addedCount).toBe(0);
    expect(result.skippedCount).toBe(0);
  });

  it('成功添加商品', async () => {
    mockFetchProducts.mockResolvedValueOnce([
      { goodsId: 1, name: '商品A', categoryChainName: '食品' } as any,
    ]);
    mockAppQuery.mockResolvedValueOnce(mockQueryResult([], 1));

    const result = await addProducts(['1'], 5);
    expect(result.addedCount).toBe(1);
  });

  it('商品在 ERP 中不存在时全部跳过', async () => {
    mockFetchProducts.mockResolvedValueOnce([]);

    const result = await addProducts(['999'], 5);
    expect(result.addedCount).toBe(0);
    expect(result.skippedCount).toBe(1);
  });
});

// ==================== deleteProduct ====================

describe('deleteProduct', () => {
  it('成功删除返回 true', async () => {
    mockAppQuery.mockResolvedValueOnce(mockQueryResult([], 1));
    const result = await deleteProduct(1);
    expect(result).toBe(true);
  });

  it('不存在返回 false', async () => {
    mockAppQuery.mockResolvedValueOnce(mockQueryResult([], 0));
    const result = await deleteProduct(999);
    expect(result).toBe(false);
  });
});

// ==================== confirmProduct ====================

describe('confirmProduct', () => {
  it('采购主管确认', async () => {
    const row = { id: 1, goods_name: '商品A', status: 'pending' };
    mockQuerySequence(mockAppQuery, [
      [row], // SELECT current
      [],    // UPDATE
      [{ ...row, procurement_confirmed: true }], // SELECT after update
    ]);

    const result = await confirmProduct(1, 'confirm', 5, ['procurement_manager'], '张三');
    expect(result).not.toBeNull();
  });

  it('商品不存在返回 null', async () => {
    mockAppQuery.mockResolvedValueOnce(mockQueryResult([]));
    const result = await confirmProduct(999, 'confirm', 5, ['admin'], '张三');
    expect(result).toBeNull();
  });

  it('无权限角色返回 null', async () => {
    mockAppQuery.mockResolvedValueOnce(mockQueryResult([{ id: 1 }]));
    const result = await confirmProduct(1, 'confirm', 5, ['viewer'], '张三');
    expect(result).toBeNull();
  });

  it('admin 同时更新采购和营销确认', async () => {
    const row = { id: 1, status: 'pending' };
    mockQuerySequence(mockAppQuery, [[row], [], [row]]);

    await confirmProduct(1, 'confirm', 5, ['admin'], '管理员');
    const updateSql = mockAppQuery.mock.calls[1][0] as string;
    expect(updateSql).toContain('procurement_confirmed');
    expect(updateSql).toContain('marketing_confirmed');
  });

  it('reject 操作设置 status = rejected', async () => {
    const row = { id: 1, status: 'pending' };
    mockQuerySequence(mockAppQuery, [[row], [], [row]]);

    await confirmProduct(1, 'reject', 5, ['admin'], '管理员');
    const updateSql = mockAppQuery.mock.calls[1][0] as string;
    expect(updateSql).toContain("status = 'rejected'");
  });
});

// ==================== batchConfirmProducts ====================

describe('batchConfirmProducts', () => {
  it('空 ids 直接返回', async () => {
    const result = await batchConfirmProducts({
      ids: [], action: 'confirm', userId: 5, userRoles: ['admin'],
    });
    expect(result.successCount).toBe(0);
    expect(result.failedCount).toBe(0);
  });

  it('admin 批量确认', async () => {
    mockAppQuery.mockResolvedValueOnce(mockQueryResult([], 3)); // UPDATE
    mockAppQuery.mockResolvedValueOnce(mockQueryResult([])); // confirm update

    const result = await batchConfirmProducts({
      ids: [1, 2, 3], action: 'confirm', userId: 5, userRoles: ['admin'],
    });
    expect(result.successCount).toBe(3);
  });
});

// ==================== batchDeleteProducts ====================

describe('batchDeleteProducts', () => {
  it('空 ids 返回 0', async () => {
    const result = await batchDeleteProducts({ ids: [] });
    expect(result.deletedCount).toBe(0);
  });

  it('按 ids 批量删除', async () => {
    mockAppQuery.mockResolvedValueOnce(mockQueryResult([], 3));

    const result = await batchDeleteProducts({ ids: [1, 2, 3] });
    expect(result.deletedCount).toBe(3);
  });

  it('selectAll 时按条件删除', async () => {
    mockAppQuery.mockResolvedValueOnce(mockQueryResult([], 10));

    const result = await batchDeleteProducts({
      selectAll: true, status: 'pending',
    });
    expect(result.deletedCount).toBe(10);
  });
});

// ==================== invalidateProductCache ====================

describe('invalidateProductCache', () => {
  it('清除所有相关缓存', () => {
    invalidateProductCache();
    expect(mockCache.invalidate).toHaveBeenCalledWith('strategic:product:list:');
    expect(mockCache.invalidate).toHaveBeenCalledWith('strategic:product:stats');
    expect(mockCache.invalidate).toHaveBeenCalledWith('strategic:product:category_tree');
  });
});
