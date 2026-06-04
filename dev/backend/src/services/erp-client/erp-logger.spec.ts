/**
 * ERP 请求日志单元测试
 */

jest.mock('../../db/appPool', () => ({
  appQuery: jest.fn(),
}));

import { appQuery } from '../../db/appPool';
import { mockQueryResult } from '../../__tests__/helpers/mockDb';
import { createLogEntry, writeErpLog } from './erp-logger';
import type { ErpLogEntry } from './erp-client.types';

const mockAppQuery = appQuery as jest.MockedFunction<typeof appQuery>;

beforeEach(() => {
  jest.resetAllMocks();
});

describe('createLogEntry', () => {
  it('返回 UUID 格式字符串', () => {
    const id = createLogEntry();
    expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
  });

  it('每次调用返回不同 ID', () => {
    const a = createLogEntry();
    const b = createLogEntry();
    expect(a).not.toBe(b);
  });
});

describe('writeErpLog', () => {
  it('写入完整日志条目', async () => {
    mockAppQuery.mockResolvedValueOnce(mockQueryResult([], 1));

    const entry: ErpLogEntry = {
      requestId: 'req-001',
      method: 'POST',
      path: '/api/test',
      requestHeaders: { Authorization: 'Bearer xxx' },
      requestBody: { data: 'test' },
      responseStatus: 200,
      responseBody: { success: true },
      errorMessage: undefined,
      durationMs: 150,
      retryCount: 0,
      businessType: 'test',
      businessId: 1,
    };

    await writeErpLog(entry);

    expect(mockAppQuery).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO erp_api_logs'),
      expect.arrayContaining(['req-001', 'POST', '/api/test', 200, 150, 0])
    );
  });

  it('可选字段为 null 时正确处理', async () => {
    mockAppQuery.mockResolvedValueOnce(mockQueryResult([], 1));

    const entry: ErpLogEntry = {
      requestId: 'req-002',
      method: 'GET',
      path: '/api/simple',
      durationMs: 50,
      retryCount: 0,
    };

    await writeErpLog(entry);
    expect(mockAppQuery).toHaveBeenCalled();
  });

  it('日志写入失败不影响业务', async () => {
    mockAppQuery.mockRejectedValueOnce(new Error('DB connection failed'));

    const entry: ErpLogEntry = {
      requestId: 'req-003',
      method: 'GET',
      path: '/test',
      durationMs: 10,
      retryCount: 0,
    };

    // 不应该抛出异常
    await expect(writeErpLog(entry)).resolves.not.toThrow();
  });

  it('大请求体被截断', async () => {
    mockAppQuery.mockResolvedValueOnce(mockQueryResult([], 1));

    const largeBody = { data: 'x'.repeat(20000) };
    const entry: ErpLogEntry = {
      requestId: 'req-004',
      method: 'POST',
      path: '/test',
      requestBody: largeBody,
      responseStatus: 200,
      durationMs: 100,
      retryCount: 0,
    };

    await writeErpLog(entry);
    // 验证序列化参数不包含完整大数据
    const params = mockAppQuery.mock.calls[0][1] as any[];
    const bodyStr = params[4] as string;
    expect(bodyStr.length).toBeLessThan(20000);
  });
});
