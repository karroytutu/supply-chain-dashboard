/* eslint-disable @typescript-eslint/no-require-imports */
/**
 * ERP HTTP 客户端单元测试
 * 测试请求封装、业务错误、网络重试、限流等逻辑
 */

describe('erp-client', () => {
  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
    jest.useRealTimers();

    // 每次测试前重新设置 mocks（因为 resetModules 会清除）
    jest.mock('axios');
    jest.mock('./erp-auth', () => ({
      getErpAccessToken: jest.fn().mockResolvedValue('test-token'),
    }));
    jest.mock('./erp-logger', () => ({
      createLogEntry: jest.fn().mockReturnValue('req-001'),
      writeErpLog: jest.fn().mockResolvedValue(undefined),
    }));
    jest.mock('./erp-config', () => ({
      getErpConfig: jest.fn().mockReturnValue({
        baseUrl: 'https://portal.zhoupudata.com',
        cid: '10008421',
        uid: '1',
        timeout: 10000,
        retryMax: 2,
        rateLimitMs: 50,
      }),
      ERP_API_VERSION: '51',
    }));
    jest.mock('../../utils/logger', () => ({
      default: { warn: jest.fn(), error: jest.fn(), info: jest.fn() },
      createLogger: () => ({
        debug: jest.fn(),
        info: jest.fn(),
        http: jest.fn(),
        warn: jest.fn(),
        error: jest.fn(),
      }),
    }));
  });

  it('正常请求 — 返回响应数据', async () => {
    const axios = require('axios') as jest.MockedFunction<any>;
    const { erpGet } = require('./erp-client');

    axios.mockResolvedValueOnce({
      data: { code: 0, data: { id: 1 } },
      status: 200,
    });

    const result = await erpGet('test/path', { page: 1 });

    expect(result).toEqual({ code: 0, data: { id: 1 } });
    expect(axios).toHaveBeenCalledTimes(1);
    expect(axios).toHaveBeenCalledWith(
      expect.objectContaining({
        method: 'GET',
        url: 'https://portal.zhoupudata.com/messiah/test/path',
        headers: expect.objectContaining({
          authorization: 'Bearer test-token',
          cid: '10008421',
          uid: '1',
        }),
        params: { page: 1 },
      })
    );
  });

  it('业务错误不重试 — 抛出 ErpApiError，axios 只调用一次', async () => {
    const axios = require('axios') as jest.MockedFunction<any>;
    const { erpGet } = require('./erp-client');
    const { ErpApiError } = require('./erp-client.types');

    axios.mockResolvedValueOnce({
      data: { code: 1, message: '业务错误' },
      status: 200,
    });

    try {
      await erpGet('test/path');
      fail('should have thrown');
    } catch (err: any) {
      expect(err).toBeInstanceOf(ErpApiError);
      expect(err.message).toContain('业务错误');
      expect(err.code).toBe(1);
    }

    // 业务错误不应触发重试
    expect(axios).toHaveBeenCalledTimes(1);
  });

  it('网络错误重试到失败 — 重试 retryMax 次后抛出 ErpApiError', async () => {
    jest.useFakeTimers();
    const axios = require('axios') as jest.MockedFunction<any>;
    const { erpRequest } = require('./erp-client');
    const { ErpApiError } = require('./erp-client.types');

    const networkError = new Error('Network Error');
    axios.mockRejectedValue(networkError);

    const promise = erpRequest('GET', 'test/path', undefined, { skipLog: true });
    // 立即 catch 避免 unhandled rejection
    const resultPromise = promise.catch((e: any) => e);

    // 推进所有定时器（重试延迟等）
    await jest.runAllTimersAsync();

    const error = await resultPromise;
    expect(error).toBeInstanceOf(ErpApiError);
    expect(error.message).toContain('Network Error');
    // 初始调用(1) + 2次重试 = 3次
    expect(axios).toHaveBeenCalledTimes(3);
  });

  it('网络错误重试后成功 — 第一次失败第二次返回成功数据', async () => {
    jest.useFakeTimers();
    const axios = require('axios') as jest.MockedFunction<any>;
    const { erpRequest } = require('./erp-client');

    const networkError = new Error('ECONNRESET');
    axios.mockRejectedValueOnce(networkError).mockResolvedValueOnce({
      data: { code: 0, data: { success: true } },
      status: 200,
    });

    const promise = erpRequest('GET', 'retry/path', undefined, { skipLog: true });

    // 推进所有定时器
    await jest.runAllTimersAsync();

    const result = await promise;
    expect(result).toEqual({ code: 0, data: { success: true } });
    expect(axios).toHaveBeenCalledTimes(2);
  });

  it('限流间隔 — 两次快速调用之间有延迟', async () => {
    const axios = require('axios') as jest.MockedFunction<any>;
    const { erpRequest } = require('./erp-client');

    axios.mockResolvedValue({
      data: { code: 0, data: {} },
      status: 200,
    });

    const start = Date.now();

    // 两次连续请求
    await erpRequest('GET', 'rate/1', undefined, { skipLog: true });
    await erpRequest('GET', 'rate/2', undefined, { skipLog: true });

    const elapsed = Date.now() - start;

    // 两次请求都成功
    expect(axios).toHaveBeenCalledTimes(2);
    // 第二次请求应该等待了 rateLimitMs（50ms），总耗时应 >= 50ms
    // 给一些误差容忍
    expect(elapsed).toBeGreaterThanOrEqual(40);
  });
});
