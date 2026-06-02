/**
 * ERP 认证管理单元测试
 * 测试 Token 获取、缓存、刷新、并发、JWT 解析等逻辑
 */

import axios from 'axios';

jest.mock('axios');
jest.mock('./erp-config', () => ({
  getErpConfig: jest.fn().mockReturnValue({
    tokenUrl: 'http://test.com/token',
    baseUrl: 'https://portal.zhoupudata.com',
    cid: '10008421',
    uid: '1',
    timeout: 10000,
    retryMax: 3,
    rateLimitMs: 200,
  }),
}));

const mockedAxios = axios as jest.Mocked<typeof axios>;

// Helper: 构造一个合法的 JWT token（带自定义 exp）
function makeJwt(payload: object): string {
  const header = Buffer.from(JSON.stringify({ alg: 'HS256' })).toString('base64url');
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  return `${header}.${body}.signature`;
}

describe('erp-auth', () => {
  let getErpAccessToken: typeof import('./erp-auth').getErpAccessToken;
  let refreshErpToken: typeof import('./erp-auth').refreshErpToken;
  let invalidateErpToken: typeof import('./erp-auth').invalidateErpToken;
  let getWmsSessionId: typeof import('./erp-auth').getWmsSessionId;

  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();

    // 重新 mock 依赖（resetModules 后需要重新设置）
    jest.mock('axios');
    jest.mock('./erp-config', () => ({
      getErpConfig: jest.fn().mockReturnValue({
        tokenUrl: 'http://test.com/token',
        baseUrl: 'https://portal.zhoupudata.com',
        cid: '10008421',
        uid: '1',
        timeout: 10000,
        retryMax: 3,
        rateLimitMs: 200,
      }),
    }));

    // 重新导入模块以获得干净的状态
    const authModule = require('./erp-auth');
    getErpAccessToken = authModule.getErpAccessToken;
    refreshErpToken = authModule.refreshErpToken;
    invalidateErpToken = authModule.invalidateErpToken;
    getWmsSessionId = authModule.getWmsSessionId;
  });

  it('Token 正常获取', async () => {
    const token = makeJwt({ exp: Math.floor(Date.now() / 1000) + 86400 * 14 });
    const axiosMod = require('axios') as jest.Mocked<typeof axios>;
    axiosMod.get = jest.fn().mockResolvedValue({
      data: {
        code: 0,
        output: [{ authorization: token, wms_session_id: 'sess123', wms_device_token: 'dev456' }],
      },
    });

    const result = await getErpAccessToken();
    expect(result).toBe(token);
    expect(axiosMod.get).toHaveBeenCalledTimes(1);
  });

  it('Token 缓存命中 — 第二次调用不再发起请求', async () => {
    const token = makeJwt({ exp: Math.floor(Date.now() / 1000) + 86400 * 14 });
    const axiosMod = require('axios') as jest.Mocked<typeof axios>;
    axiosMod.get = jest.fn().mockResolvedValue({
      data: {
        code: 0,
        output: [{ authorization: token }],
      },
    });

    const result1 = await getErpAccessToken();
    const result2 = await getErpAccessToken();

    expect(result1).toBe(token);
    expect(result2).toBe(token);
    expect(axiosMod.get).toHaveBeenCalledTimes(1);
  });

  it('Token 过期触发刷新', async () => {
    const axiosMod = require('axios') as jest.Mocked<typeof axios>;

    // 第一次：返回即将过期的 token（expiresAt 接近当前时间）
    const expiredExp = Math.floor(Date.now() / 1000) + 60; // 仅60秒后过期，小于 REFRESH_AHEAD_MS(1h)
    const expiredToken = makeJwt({ exp: expiredExp });
    axiosMod.get = jest.fn().mockResolvedValue({
      data: { code: 0, output: [{ authorization: expiredToken }] },
    });

    await getErpAccessToken();

    // 第二次调用应该触发刷新（因为 expiresAt < Date.now() + REFRESH_AHEAD_MS）
    const newToken = makeJwt({ exp: Math.floor(Date.now() / 1000) + 86400 * 14 });
    axiosMod.get = jest.fn().mockResolvedValue({
      data: { code: 0, output: [{ authorization: newToken }] },
    });

    const result = await getErpAccessToken();
    expect(result).toBe(newToken);
  });

  it('并发调用复用 Promise — 只调用一次 refreshErpToken', async () => {
    const token = makeJwt({ exp: Math.floor(Date.now() / 1000) + 86400 * 14 });
    const axiosMod = require('axios') as jest.Mocked<typeof axios>;
    axiosMod.get = jest.fn().mockResolvedValue({
      data: { code: 0, output: [{ authorization: token }] },
    });

    // 同时发起两次调用
    const [result1, result2] = await Promise.all([
      getErpAccessToken(),
      getErpAccessToken(),
    ]);

    expect(result1).toBe(token);
    expect(result2).toBe(token);
    // axios.get 应该只被调用一次（并发请求复用同一个 Promise）
    expect(axiosMod.get).toHaveBeenCalledTimes(1);
  });

  it('JWT exp 秒转毫秒 — exp < 1e12 时乘以 1000', async () => {
    const expInSeconds = 1700000000; // < 1e12，应被识别为秒
    const token = makeJwt({ exp: expInSeconds });
    const axiosMod = require('axios') as jest.Mocked<typeof axios>;
    axiosMod.get = jest.fn().mockResolvedValue({
      data: { code: 0, output: [{ authorization: token }] },
    });

    const result = await refreshErpToken();
    expect(result.expiresAt).toBe(expInSeconds * 1000);
  });

  it('JWT 解析失败 fallback — 默认 13 天过期', async () => {
    // 构造一个 payload 不是合法 base64/JSON 的 token
    const invalidToken = 'header.!!!invalid-base64!!!.signature';
    const axiosMod = require('axios') as jest.Mocked<typeof axios>;
    axiosMod.get = jest.fn().mockResolvedValue({
      data: { code: 0, output: [{ authorization: invalidToken }] },
    });

    const beforeMs = Date.now();
    const result = await refreshErpToken();
    const afterMs = Date.now();

    const thirteenDaysMs = 13 * 24 * 60 * 60 * 1000;
    // expiresAt 应约等于 Date.now() + 13天
    expect(result.expiresAt).toBeGreaterThanOrEqual(beforeMs + thirteenDaysMs);
    expect(result.expiresAt).toBeLessThanOrEqual(afterMs + thirteenDaysMs);
  });

  it('getWmsSessionId — 返回缓存的 sessionId', async () => {
    const token = makeJwt({ exp: Math.floor(Date.now() / 1000) + 86400 * 14 });
    const axiosMod = require('axios') as jest.Mocked<typeof axios>;
    axiosMod.get = jest.fn().mockResolvedValue({
      data: {
        code: 0,
        output: [{ authorization: token, wms_session_id: 'my-session-123', wms_device_token: 'dt' }],
      },
    });

    const sessionId = await getWmsSessionId();
    expect(sessionId).toBe('my-session-123');
  });

  it('invalidateErpToken — 调用后下次请求重新获取 token', async () => {
    const axiosMod = require('axios') as jest.Mocked<typeof axios>;

    const token1 = makeJwt({ exp: Math.floor(Date.now() / 1000) + 86400 * 14 });
    axiosMod.get = jest.fn().mockResolvedValue({
      data: { code: 0, output: [{ authorization: token1 }] },
    });

    await getErpAccessToken();
    expect(axiosMod.get).toHaveBeenCalledTimes(1);

    // 失效缓存
    invalidateErpToken();

    const token2 = makeJwt({ exp: Math.floor(Date.now() / 1000) + 86400 * 14 });
    axiosMod.get = jest.fn().mockResolvedValue({
      data: { code: 0, output: [{ authorization: token2 }] },
    });

    const result = await getErpAccessToken();
    expect(result).toBe(token2);
    expect(axiosMod.get).toHaveBeenCalledTimes(1);
  });
});
