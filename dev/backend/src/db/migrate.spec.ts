/**
 * 迁移执行器单元测试
 * 重点验证失败迁移的处理行为：不记录到历史、中止后续迁移
 */

jest.mock('../utils/logger', () => ({
  createLogger: () => ({
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  }),
}));

import { runMigrations } from './migrate';

describe('runMigrations', () => {
  let mockQuery: jest.Mock;

  beforeEach(() => {
    mockQuery = jest.fn();
    // 模拟 migrations_history 表创建
    mockQuery.mockResolvedValueOnce({ rows: [] }); // CREATE TABLE
    // 模拟已执行的迁移列表（空 = 全部待执行）
    mockQuery.mockResolvedValueOnce({ rows: [] }); // SELECT filename
  });

  it('成功的迁移应记录到 migrations_history', async () => {
    // 模拟 readdirSync 返回一个迁移文件
    jest.spyOn(require('fs'), 'existsSync').mockReturnValue(true);
    jest.spyOn(require('fs'), 'readdirSync').mockReturnValue(['001_test.sql']);
    jest.spyOn(require('fs'), 'readFileSync').mockReturnValue('CREATE TABLE test (id INT)');

    // 迁移 SQL 执行成功
    mockQuery.mockResolvedValueOnce({ rows: [] }); // 执行迁移 SQL
    // INSERT 到历史
    mockQuery.mockResolvedValueOnce({ rows: [] });

    await runMigrations(mockQuery);

    // 验证迁移 SQL 被执行
    expect(mockQuery).toHaveBeenCalledWith('CREATE TABLE test (id INT)');
    // 验证记录到历史
    expect(mockQuery).toHaveBeenCalledWith(
      'INSERT INTO migrations_history (filename) VALUES ($1)',
      ['001_test.sql']
    );

    jest.restoreAllMocks();
  });

  it('失败的迁移不应记录到 migrations_history', async () => {
    jest.spyOn(require('fs'), 'existsSync').mockReturnValue(true);
    jest.spyOn(require('fs'), 'readdirSync').mockReturnValue(['002_failing.sql']);
    jest.spyOn(require('fs'), 'readFileSync').mockReturnValue('INVALID SQL');

    // 迁移 SQL 执行失败
    mockQuery.mockRejectedValueOnce(new Error('syntax error'));

    await runMigrations(mockQuery);

    // 验证没有 INSERT 到 migrations_history（只有 CREATE TABLE 和 SELECT 两次调用）
    const insertCalls = mockQuery.mock.calls.filter(
      (call: any[]) => typeof call[0] === 'string' && call[0].includes('INSERT INTO migrations_history')
    );
    expect(insertCalls).toHaveLength(0);

    jest.restoreAllMocks();
  });

  it('失败的迁移应中止后续迁移（break 生效）', async () => {
    jest.spyOn(require('fs'), 'existsSync').mockReturnValue(true);
    jest.spyOn(require('fs'), 'readdirSync').mockReturnValue([
      '001_first.sql',
      '002_failing.sql',
      '003_should_not_run.sql',
    ]);
    jest.spyOn(require('fs'), 'readFileSync').mockImplementation(((path: string) => {
      if (path.includes('001_first')) return 'CREATE TABLE first (id INT)';
      if (path.includes('002_failing')) return 'INVALID SQL';
      if (path.includes('003_should_not_run')) return 'CREATE TABLE third (id INT)';
      return '';
    }) as any);

    // 001 成功
    mockQuery.mockResolvedValueOnce({ rows: [] }); // 001 SQL
    mockQuery.mockResolvedValueOnce({ rows: [] }); // 001 INSERT history
    // 002 失败
    mockQuery.mockRejectedValueOnce(new Error('syntax error'));

    await runMigrations(mockQuery);

    // 验证 003 的 SQL 没有被执行
    const sqlCalls = mockQuery.mock.calls.filter(
      (call: any[]) => typeof call[0] === 'string' && call[0] === 'CREATE TABLE third (id INT)'
    );
    expect(sqlCalls).toHaveLength(0);

    // 验证 001 被记录到历史，002 没有被记录
    const insertCalls = mockQuery.mock.calls.filter(
      (call: any[]) => typeof call[0] === 'string' && call[0].includes('INSERT INTO migrations_history')
    );
    expect(insertCalls).toHaveLength(1);
    expect(insertCalls[0][1]).toEqual(['001_first.sql']);

    jest.restoreAllMocks();
  });
});
