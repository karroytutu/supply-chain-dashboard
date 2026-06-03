/**
 * ERP 认证管理单元测试
 * 测试 Token 获取、缓存、刷新、并发等逻辑
 * Token 来源：内置 token-manager 模块（从 PostgreSQL 读取）
 */

// Mock token-manager 模块
const mockGetNativeToken = jest.fn();
const mockGetNativeWmsSessionId = jest.fn();
jest.mock('../token-manager', () => ({
  getNativeToken: mockGetNativeToken,
  getNativeWmsSessionId: mockGetNativeWmsSessionId,
}));

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

    // 重新 mock token-manager（resetModules 后需要重新设置）
    jest.mock('../token-manager', () => ({
      getNativeToken: mockGetNativeToken,
      getNativeWmsSessionId: mockGetNativeWmsSessionId,
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
    mockGetNativeToken.mockResolvedValue({ authorization: token, expiresAt: Date.now() + 86400 * 14 * 1000 });

    const result = await getErpAccessToken();
    expect(result).toBe(token);
    expect(mockGetNativeToken).toHaveBeenCalledTimes(1);
  });

  it('Token 缓存命中 — 第二次调用不再发起请求', async () => {
    const token = makeJwt({ exp: Math.floor(Date.now() / 1000) + 86400 * 14 });
    const expiresAt = Date.now() + 86400 * 14 * 1000;
    mockGetNativeToken.mockResolvedValue({ authorization: token, expiresAt });

    const result1 = await getErpAccessToken();
    const result2 = await getErpAccessToken();

    expect(result1).toBe(token);
    expect(result2).toBe(token);
    expect(mockGetNativeToken).toHaveBeenCalledTimes(1);
  });

  it('Token 过期触发刷新', async () => {
    // 第一次：返回即将过期的 token（expiresAt 接近当前时间）
    const expiredExp = Date.now() + 60 * 1000; // 仅60秒后过期，小于 REFRESH_AHEAD_MS(1h)
    const expiredToken = makeJwt({ exp: Math.floor(Date.now() / 1000) + 60 });
    mockGetNativeToken.mockResolvedValueOnce({ authorization: expiredToken, expiresAt: expiredExp });

    await getErpAccessToken();

    // 第二次调用应该触发刷新（因为 expiresAt < Date.now() + REFRESH_AHEAD_MS）
    const newToken = makeJwt({ exp: Math.floor(Date.now() / 1000) + 86400 * 14 });
    const newExpiresAt = Date.now() + 86400 * 14 * 1000;
    mockGetNativeToken.mockResolvedValueOnce({ authorization: newToken, expiresAt: newExpiresAt });

    const result = await getErpAccessToken();
    expect(result).toBe(newToken);
    expect(mockGetNativeToken).toHaveBeenCalledTimes(2);
  });

  it('并发调用复用 Promise — 只调用一次 refreshErpToken', async () => {
    const token = makeJwt({ exp: Math.floor(Date.now() / 1000) + 86400 * 14 });
    const expiresAt = Date.now() + 86400 * 14 * 1000;
    mockGetNativeToken.mockResolvedValue({ authorization: token, expiresAt });

    // 同时发起两次调用
    const [result1, result2] = await Promise.all([
      getErpAccessToken(),
      getErpAccessToken(),
    ]);

    expect(result1).toBe(token);
    expect(result2).toBe(token);
    // getNativeToken 应该只被调用一次（并发请求复用同一个 Promise）
    expect(mockGetNativeToken).toHaveBeenCalledTimes(1);
  });

  it('refreshErpToken — 从 token-manager 获取并解析过期时间', async () => {
    const expInSeconds = 1700000000;
    const token = makeJwt({ exp: expInSeconds });
    mockGetNativeToken.mockResolvedValue({ authorization: token, expiresAt: expInSeconds * 1000 });

    const result = await refreshErpToken();
    expect(result.authorization).toBe(token);
    expect(result.expiresAt).toBe(expInSeconds * 1000);
  });

  it('getWmsSessionId — 从 token-manager 读取', async () => {
    mockGetNativeWmsSessionId.mockResolvedValue('wms-session-abc');

    const sessionId = await getWmsSessionId();
    expect(sessionId).toBe('wms-session-abc');
    expect(mockGetNativeWmsSessionId).toHaveBeenCalledTimes(1);
  });

  it('getWmsSessionId — 无 session 时抛出错误', async () => {
    mockGetNativeWmsSessionId.mockResolvedValue(null);

    await expect(getWmsSessionId()).rejects.toThrow('WMS Session 不可用');
  });

  it('invalidateErpToken — 调用后下次请求重新获取 token', async () => {
    const token1 = makeJwt({ exp: Math.floor(Date.now() / 1000) + 86400 * 14 });
    const expiresAt1 = Date.now() + 86400 * 14 * 1000;
    mockGetNativeToken.mockResolvedValueOnce({ authorization: token1, expiresAt: expiresAt1 });

    await getErpAccessToken();
    expect(mockGetNativeToken).toHaveBeenCalledTimes(1);

    // 失效缓存
    invalidateErpToken();

    const token2 = makeJwt({ exp: Math.floor(Date.now() / 1000) + 86400 * 14 });
    const expiresAt2 = Date.now() + 86400 * 14 * 1000;
    mockGetNativeToken.mockResolvedValueOnce({ authorization: token2, expiresAt: expiresAt2 });

    const result = await getErpAccessToken();
    expect(result).toBe(token2);
    expect(mockGetNativeToken).toHaveBeenCalledTimes(2);
  });
});
