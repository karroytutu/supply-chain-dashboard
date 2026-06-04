/**
 * 事务 helper 单元测试
 * 测试 withTransaction 的正常提交、异常回滚、client 释放
 */

jest.mock('../db/appPool', () => ({
  getAppClient: jest.fn(),
}));

import { withTransaction } from './transaction';
import { getAppClient } from '../db/appPool';

const mockGetAppClient = getAppClient as jest.MockedFunction<typeof getAppClient>;

function createMockClient() {
  return {
    query: jest.fn().mockResolvedValue({ rows: [], rowCount: 0 }),
    release: jest.fn(),
  };
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('withTransaction', () => {
  it('正常流程: BEGIN → fn → COMMIT → release', async () => {
    const client = createMockClient();
    mockGetAppClient.mockResolvedValue(client as any);

    const result = await withTransaction(async (c) => {
      await c.query('INSERT INTO test VALUES ($1)', [1]);
      return { success: true };
    });

    expect(client.query).toHaveBeenNthCalledWith(1, 'BEGIN');
    expect(client.query).toHaveBeenNthCalledWith(2, 'INSERT INTO test VALUES ($1)', [1]);
    expect(client.query).toHaveBeenNthCalledWith(3, 'COMMIT');
    expect(client.release).toHaveBeenCalledTimes(1);
    expect(result).toEqual({ success: true });
  });

  it('异常回滚: BEGIN → fn throws → ROLLBACK → release → rethrow', async () => {
    const client = createMockClient();
    mockGetAppClient.mockResolvedValue(client as any);

    const error = new Error('DB constraint violation');

    await expect(
      withTransaction(async (c) => {
        await c.query('INSERT INTO test VALUES ($1)', [1]);
        throw error;
      })
    ).rejects.toThrow('DB constraint violation');

    expect(client.query).toHaveBeenNthCalledWith(1, 'BEGIN');
    expect(client.query).toHaveBeenNthCalledWith(2, 'INSERT INTO test VALUES ($1)', [1]);
    expect(client.query).toHaveBeenNthCalledWith(3, 'ROLLBACK');
    expect(client.release).toHaveBeenCalledTimes(1);
  });

  it('无论成功失败都释放 client', async () => {
    const client = createMockClient();
    mockGetAppClient.mockResolvedValue(client as any);

    // 成功
    await withTransaction(async () => 'ok');
    expect(client.release).toHaveBeenCalledTimes(1);

    client.release.mockClear();

    // 失败
    try {
      await withTransaction(async () => { throw new Error('fail'); });
    } catch {
      // expected
    }
    expect(client.release).toHaveBeenCalledTimes(1);
  });

  it('fn 的返回值正确传递', async () => {
    const client = createMockClient();
    mockGetAppClient.mockResolvedValue(client as any);

    const result = await withTransaction(async () => ({ id: 42, name: 'test' }));
    expect(result).toEqual({ id: 42, name: 'test' });
  });

  it('getAppClient 失败时直接抛出', async () => {
    mockGetAppClient.mockRejectedValue(new Error('Pool exhausted'));

    await expect(withTransaction(async () => 'ok')).rejects.toThrow('Pool exhausted');
  });
});
