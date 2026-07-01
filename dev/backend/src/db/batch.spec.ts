/**
 * batchInsert 分批插入工具单元测试
 */

import { batchInsert, DEFAULT_BATCH_SIZE } from './batch';

/** Mock PoolClient，记录所有 query 调用 */
function createMockClient() {
  const calls: Array<{ sql: string; values: unknown[] }> = [];
  return {
    query: jest.fn(async (sql: string, values: unknown[]) => {
      calls.push({ sql, values });
      return { rows: [], rowCount: values ? values.length / (sql.match(/\$/g) || []).length : 0 };
    }),
    calls,
  };
}

describe('batchInsert', () => {
  it('rows 为空时不执行任何 query，返回 0', async () => {
    const client = createMockClient();
    const result = await batchInsert(client as any, 'test_table', ['a', 'b'], []);
    expect(result).toBe(0);
    expect(client.query).not.toHaveBeenCalled();
  });

  it('rows 少于 batchSize 时只执行 1 次 query', async () => {
    const client = createMockClient();
    const rows = [
      [1, 'Alice'],
      [2, 'Bob'],
      [3, 'Charlie'],
    ];
    const result = await batchInsert(client as any, 'users', ['id', 'name'], rows);
    expect(result).toBe(3);
    expect(client.query).toHaveBeenCalledTimes(1);

    const call = client.calls[0];
    expect(call.sql).toContain('INSERT INTO users (id, name)');
    expect(call.sql).toContain('($1, $2), ($3, $4), ($5, $6)');
    expect(call.values).toEqual([1, 'Alice', 2, 'Bob', 3, 'Charlie']);
  });

  it('rows 超过 batchSize 时正确分批', async () => {
    const client = createMockClient();
    const batchSize = 3;
    // 7 行数据，batchSize=3 -> 3 + 3 + 1 = 3 批
    const rows = Array.from({ length: 7 }, (_, i) => [i + 1, `user_${i + 1}`]);
    const result = await batchInsert(client as any, 'users', ['id', 'name'], rows, batchSize);
    expect(result).toBe(7);
    expect(client.query).toHaveBeenCalledTimes(3);

    // 第 1 批：3 行，占位符 $1-$6
    expect(client.calls[0].sql).toContain('($1, $2), ($3, $4), ($5, $6)');
    expect(client.calls[0].values).toHaveLength(6);

    // 第 2 批：3 行，占位符重新从 $1 开始
    expect(client.calls[1].sql).toContain('($1, $2), ($3, $4), ($5, $6)');
    expect(client.calls[1].values).toHaveLength(6);

    // 第 3 批：1 行，占位符 $1-$2
    expect(client.calls[2].sql).toContain('($1, $2)');
    expect(client.calls[2].values).toHaveLength(2);
  });

  it('参数占位符序号在每批内连续正确', async () => {
    const client = createMockClient();
    // 3 列 x 2 行 = 6 个参数
    const rows = [
      [10, 'x', true],
      [20, 'y', false],
    ];
    await batchInsert(client as any, 't', ['a', 'b', 'c'], rows);
    const call = client.calls[0];
    expect(call.sql).toBe('INSERT INTO t (a, b, c) VALUES ($1, $2, $3), ($4, $5, $6)');
    expect(call.values).toEqual([10, 'x', true, 20, 'y', false]);
  });

  it('DEFAULT_BATCH_SIZE 为 500', () => {
    expect(DEFAULT_BATCH_SIZE).toBe(500);
  });

  it('恰好等于 batchSize 时只执行 1 次 query', async () => {
    const client = createMockClient();
    const batchSize = 2;
    const rows = [
      [1, 'a'],
      [2, 'b'],
    ];
    const result = await batchInsert(client as any, 't', ['id', 'val'], rows, batchSize);
    expect(result).toBe(2);
    expect(client.query).toHaveBeenCalledTimes(1);
  });
});
