/**
 * Token 管理数据访问层单元测试
 */

jest.mock('../../utils/logger', () => ({
  createLogger: () => ({ warn: jest.fn(), info: jest.fn(), error: jest.fn() }),
}));

jest.mock('../../db/appPool', () => ({
  appQuery: jest.fn(),
}));

import { appQuery } from '../../db/appPool';
import { mockQueryResult } from '../../__tests__/helpers/mockDb';
import {
  getTokenRecord,
  getAllTokenRecords,
  saveToken,
  updateLoginStatus,
  logOperation,
  getOperationLogs,
} from './token-repository';

const mockAppQuery = appQuery as jest.MockedFunction<typeof appQuery>;

beforeEach(() => {
  jest.resetAllMocks();
});

describe('getTokenRecord', () => {
  it('存在时返回记录', async () => {
    const row = { system: 'erp', token_value: 'abc123', login_status: 'success' };
    mockAppQuery.mockResolvedValueOnce(mockQueryResult([row]));

    const result = await getTokenRecord('erp');
    expect(result).toEqual(row);
    expect(mockAppQuery).toHaveBeenCalledWith(
      expect.stringContaining('WHERE system = $1'),
      ['erp']
    );
  });

  it('不存在时返回 null', async () => {
    mockAppQuery.mockResolvedValueOnce(mockQueryResult([]));
    const result = await getTokenRecord('erp');
    expect(result).toBeNull();
  });
});

describe('getAllTokenRecords', () => {
  it('返回按 system 索引的记录', async () => {
    const rows = [
      { system: 'erp', token_value: 'a' },
      { system: 'wms', token_value: 'b' },
    ];
    mockAppQuery.mockResolvedValueOnce(mockQueryResult(rows));

    const result = await getAllTokenRecords();
    expect(result.erp).toEqual(rows[0]);
    expect(result.wms).toEqual(rows[1]);
  });
});

describe('saveToken', () => {
  it('调用 UPSERT SQL', async () => {
    mockAppQuery.mockResolvedValueOnce(mockQueryResult([], 1));

    await saveToken({
      system: 'erp',
      tokenValue: 'new-token',
      loginStatus: 'success',
    });

    expect(mockAppQuery).toHaveBeenCalledWith(
      expect.stringContaining('ON CONFLICT (system) DO UPDATE'),
      expect.arrayContaining(['erp', 'new-token'])
    );
  });

  it('tokenMeta 序列化为 JSON', async () => {
    mockAppQuery.mockResolvedValueOnce(mockQueryResult([], 1));

    await saveToken({
      system: 'erp',
      tokenValue: 'tok',
      tokenMeta: { key: 'value' },
    });

    const params = mockAppQuery.mock.calls[0][1] as any[];
    expect(params[3]).toBe('{"key":"value"}');
  });
});

describe('updateLoginStatus', () => {
  it('更新状态', async () => {
    mockAppQuery.mockResolvedValueOnce(mockQueryResult([], 1));

    await updateLoginStatus('erp', 'pending_sms', true);
    expect(mockAppQuery).toHaveBeenCalledWith(
      expect.stringContaining('UPDATE erp_tokens SET login_status'),
      ['pending_sms', true, 'erp']
    );
  });
});

describe('logOperation', () => {
  it('插入操作日志', async () => {
    mockAppQuery.mockResolvedValueOnce(mockQueryResult([], 1));

    await logOperation({
      system: 'erp',
      operation: 'login',
      status: 'success',
      operatorId: 1,
      detail: { msg: '登录成功' },
    });

    expect(mockAppQuery).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO token_operation_logs'),
      expect.any(Array)
    );
  });
});

describe('getOperationLogs', () => {
  it('查询操作日志', async () => {
    const logs = [{ id: 1, system: 'erp', operation: 'login' }];
    mockAppQuery.mockResolvedValueOnce(mockQueryResult(logs));
    mockAppQuery.mockResolvedValueOnce(mockQueryResult([{ count: '1' }]));

    const result = await getOperationLogs({ page: 1, pageSize: 10, system: 'erp' });
    expect(result.rows).toHaveLength(1);
  });
});
