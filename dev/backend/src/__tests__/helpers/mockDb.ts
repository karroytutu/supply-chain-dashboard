/**
 * 数据库 Mock 工厂工具
 * 提供统一的 appQuery / getAppClient mock 构建方法
 * 配合 jest.mock('../../db/appPool') 使用
 *
 * @example
 * // 在 spec 文件顶部
 * jest.mock('../../db/appPool', () => ({
 *   appQuery: jest.fn(),
 *   getAppClient: jest.fn(),
 * }));
 *
 * import { appQuery } from '../../db/appPool';
 * import { mockQueryResult, mockQueryError } from '../../__tests__/helpers/mockDb';
 *
 * const mockAppQuery = appQuery as jest.MockedFunction<typeof appQuery>;
 *
 * it('returns data', async () => {
 *   mockAppQuery.mockResolvedValueOnce(mockQueryResult([{ id: 1, name: 'test' }]));
 *   // ...
 * });
 */

import type { QueryResult, PoolClient, QueryResultRow } from 'pg';

/**
 * 构造 appQuery 的模拟返回值
 * @param rows 数据行数组
 * @param rowCount 受影响行数（默认等于 rows.length）
 */
export function mockQueryResult<T extends QueryResultRow = Record<string, unknown>>(
  rows: T[],
  rowCount?: number,
): QueryResult<T> {
  return {
    rows,
    rowCount: rowCount ?? rows.length,
    command: 'SELECT',
    oid: 0,
    fields: [],
  } as QueryResult<T>;
}

/**
 * 构造 appQuery 的模拟错误
 * @param message 错误消息
 */
export function mockQueryError(message: string): Error {
  return new Error(message);
}

/**
 * 创建模拟的 PoolClient，用于测试 withTransaction 场景
 * 包含 query / release 两个核心方法
 */
export function createMockPoolClient(): jest.Mocked<PoolClient> {
  const client = {
    query: jest.fn().mockResolvedValue({ rows: [], rowCount: 0 }),
    release: jest.fn(),
    connect: jest.fn(),
    on: jest.fn(),
    once: jest.fn(),
    addListener: jest.fn(),
    removeListener: jest.fn(),
    removeAllListeners: jest.fn(),
    emit: jest.fn(),
    prependListener: jest.fn(),
    prependOnceListener: jest.fn(),
    eventNames: jest.fn().mockReturnValue([]),
    listeners: jest.fn().mockReturnValue([]),
    rawListeners: jest.fn().mockReturnValue([]),
    listenerCount: jest.fn().mockReturnValue(0),
    getMaxListeners: jest.fn().mockReturnValue(10),
    setMaxListeners: jest.fn(),
    off: jest.fn(),
  } as unknown as jest.Mocked<PoolClient>;

  return client;
}

/**
 * 快速设置 appQuery 按顺序返回多组结果
 * 等价于多次调用 mockResolvedValueOnce
 *
 * @example
 * mockQuerySequence([
 *   [{ id: 1 }],          // 第1次调用返回
 *   [{ count: '10' }],    // 第2次调用返回
 * ]);
 */
export function mockQuerySequence(
  mockFn: jest.MockedFunction<any>,
  results: Array<Record<string, unknown>[]>,
): void {
  results.forEach((rows) => {
    mockFn.mockResolvedValueOnce(mockQueryResult(rows));
  });
}
