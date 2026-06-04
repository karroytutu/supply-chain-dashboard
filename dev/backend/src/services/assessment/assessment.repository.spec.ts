/**
 * 考核 Repository 数据访问层单元测试
 */

jest.mock('../../db/appPool', () => ({
  appQuery: jest.fn(),
  getAppClient: jest.fn(),
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

import { appQuery } from '../../db/appPool';
import { cache } from '../../utils/cache';
import { mockQueryResult } from '../../__tests__/helpers/mockDb';
import { getRecords, getStats, getMyRecords } from './assessment.repository';

const mockAppQuery = appQuery as jest.MockedFunction<typeof appQuery>;
const mockCache = cache as jest.Mocked<typeof cache>;

beforeEach(() => {
  jest.resetAllMocks();
  mockCache.get.mockReturnValue(null);
});

// ==================== getRecords ====================

describe('getRecords', () => {
  it('无过滤条件查询', async () => {
    mockAppQuery
      .mockResolvedValueOnce(mockQueryResult([{ count: '10' }]))
      .mockResolvedValueOnce(mockQueryResult([
        { id: 1, category: 'return_order', status: 'pending', penalty_amount: '100' },
      ]));

    const result = await getRecords({ page: 1, page_size: 20 });
    expect(result.total).toBe(10);
    expect(result.rows).toHaveLength(1);
  });

  it('缓存命中时不查数据库', async () => {
    const cached = { rows: [{ id: 1 }], total: 1 };
    mockCache.get.mockReturnValueOnce(cached);

    const result = await getRecords({ page: 1, page_size: 20 });
    expect(result).toBe(cached);
    expect(mockAppQuery).not.toHaveBeenCalled();
  });

  it('分页计算正确', async () => {
    mockAppQuery
      .mockResolvedValueOnce(mockQueryResult([{ count: '50' }]))
      .mockResolvedValueOnce(mockQueryResult([]));

    await getRecords({ page: 3, page_size: 10 });
    const dataSql = mockAppQuery.mock.calls[1][0] as string;
    expect(dataSql).toContain('LIMIT');
    expect(dataSql).toContain('OFFSET');
    const params = mockAppQuery.mock.calls[1][1] as any[];
    expect(params[params.length - 1]).toBe(20); // offset = (3-1)*10
    expect(params[params.length - 2]).toBe(10); // limit
  });

  it('写入缓存', async () => {
    mockAppQuery
      .mockResolvedValueOnce(mockQueryResult([{ count: '0' }]))
      .mockResolvedValueOnce(mockQueryResult([]));

    await getRecords({ page: 1, page_size: 20 });
    expect(mockCache.set).toHaveBeenCalled();
  });
});

// ==================== getStats ====================

describe('getStats', () => {
  it('返回统计数据', async () => {
    const stats = {
      total_amount: '500',
      pending_count: '3',
      pending_amount: '200',
      confirmed_count: '2',
      today_new: '1',
      today_confirmed: '0',
      involved_users: '2',
    };
    mockAppQuery.mockResolvedValueOnce(mockQueryResult([stats]));

    const result = await getStats();
    expect(result.total_amount).toBe('500');
    expect(result.pending_count).toBe('3');
  });

  it('按 category 过滤', async () => {
    mockAppQuery.mockResolvedValueOnce(mockQueryResult([{ total_amount: '0' }]));

    await getStats('return_order');
    const sql = mockAppQuery.mock.calls[0][0] as string;
    expect(sql).toContain('WHERE category = $1');
  });

  it('缓存命中时不查数据库', async () => {
    const cachedStats = { total_amount: '100' };
    mockCache.get.mockReturnValueOnce(cachedStats);

    const result = await getStats();
    expect(result).toBe(cachedStats);
    expect(mockAppQuery).not.toHaveBeenCalled();
  });
});

// ==================== getMyRecords ====================

describe('getMyRecords', () => {
  it('按 userId 查询', async () => {
    mockAppQuery
      .mockResolvedValueOnce(mockQueryResult([{ count: '5' }]))
      .mockResolvedValueOnce(mockQueryResult([
        { id: 1, assessment_user_id: 42, status: 'pending' },
      ]));

    const result = await getMyRecords(42, { page: 1, page_size: 10 });
    expect(result.total).toBe(5);
    expect(result.rows).toHaveLength(1);
  });
});
