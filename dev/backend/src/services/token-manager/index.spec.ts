/**
 * Token 管理模块入口单元测试
 */

jest.mock('../../utils/logger', () => ({
  createLogger: () => ({ info: jest.fn(), error: jest.fn(), warn: jest.fn() }),
}));

jest.mock('./token-repository', () => ({
  getAllTokenRecords: jest.fn(),
  getLastLoginTimes: jest.fn(),
  getTokenRecord: jest.fn(),
  getTokenValue: jest.fn(),
}));

jest.mock('./b2b-exchange', () => ({
  performB2bExchangeAndSave: jest.fn(),
  verifyB2bToken: jest.fn(),
}));

jest.mock('./wms-login', () => ({
  performWmsLoginAndSave: jest.fn(),
  verifyWmsToken: jest.fn(),
}));

jest.mock('./erp-login', () => ({
  performErpLoginAndSave: jest.fn(),
  verifyErpToken: jest.fn(),
}));

import * as tokenRepo from './token-repository';
import { performErpLoginAndSave, verifyErpToken } from './erp-login';
import { performWmsLoginAndSave, verifyWmsToken } from './wms-login';
import { performB2bExchangeAndSave, verifyB2bToken } from './b2b-exchange';
import {
  getAllTokensStatus,
  getNativeToken,
  getNativeWmsSessionId,
  checkAndRefreshAllTokens,
} from './index';
import type { TokenRecord } from './token-types';

const mockGetAllRecords = tokenRepo.getAllTokenRecords as jest.MockedFunction<typeof tokenRepo.getAllTokenRecords>;
const mockGetLastLoginTimes = tokenRepo.getLastLoginTimes as jest.MockedFunction<typeof tokenRepo.getLastLoginTimes>;
const mockGetTokenRecord = tokenRepo.getTokenRecord as jest.MockedFunction<typeof tokenRepo.getTokenRecord>;
const mockGetTokenValue = tokenRepo.getTokenValue as jest.MockedFunction<typeof tokenRepo.getTokenValue>;
const mockErpLogin = performErpLoginAndSave as jest.MockedFunction<typeof performErpLoginAndSave>;
const mockVerifyErp = verifyErpToken as jest.MockedFunction<typeof verifyErpToken>;
const mockWmsLogin = performWmsLoginAndSave as jest.MockedFunction<typeof performWmsLoginAndSave>;
const mockVerifyWms = verifyWmsToken as jest.MockedFunction<typeof verifyWmsToken>;
const mockB2bExchange = performB2bExchangeAndSave as jest.MockedFunction<typeof performB2bExchangeAndSave>;
const mockVerifyB2b = verifyB2bToken as jest.MockedFunction<typeof verifyB2bToken>;

function createMockTokenRecord(overrides: Partial<TokenRecord> = {}): TokenRecord {
  return {
    id: 1,
    system: 'erp',
    token_value: 'test_token_value',
    token_secondary: null,
    token_meta: null,
    login_status: 'success',
    needs_sms: false,
    expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000), // 24h from now
    updated_at: new Date(),
    ...overrides,
  };
}

describe('token-manager/index', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('getAllTokensStatus', () => {
    it('返回三系统状态汇总', async () => {
      const erpRecord = createMockTokenRecord({ system: 'erp' });
      const wmsRecord = createMockTokenRecord({ system: 'wms', token_value: 'wms_session' });
      mockGetAllRecords.mockResolvedValueOnce({
        erp: erpRecord,
        wms: wmsRecord,
        b2b: undefined as any,
      });
      mockGetLastLoginTimes.mockResolvedValueOnce({
        erp: '2026-06-01',
        wms: null,
        b2b: null,
      });

      const result = await getAllTokensStatus();

      expect(result.erp.hasToken).toBe(true);
      expect(result.erp.status).toBe('success');
      expect(result.erp.lastLoginAt).toBe('2026-06-01');
      expect(result.wms.hasToken).toBe(true);
      expect(result.b2b.hasToken).toBe(false);
      expect(result.b2b.status).toBe('none');
    });
  });

  describe('getNativeToken', () => {
    it('返回有效 Token 和过期时间', async () => {
      const futureDate = new Date(Date.now() + 24 * 60 * 60 * 1000);
      const record = createMockTokenRecord({
        token_value: 'jwt_token_here',
        expires_at: futureDate,
      });
      mockGetTokenRecord.mockResolvedValueOnce(record);

      const result = await getNativeToken();

      expect(result.authorization).toBe('jwt_token_here');
      expect(result.expiresAt).toBe(futureDate.getTime());
    });

    it('Token 不存在时抛出错误', async () => {
      mockGetTokenRecord.mockResolvedValueOnce(null as any);

      await expect(getNativeToken()).rejects.toThrow('不可用');
    });

    it('Token 状态为 failed 时抛出错误', async () => {
      mockGetTokenRecord.mockResolvedValueOnce(
        createMockTokenRecord({ login_status: 'failed' })
      );

      await expect(getNativeToken()).rejects.toThrow('状态异常');
    });

    it('无 expires_at 时尝试 JWT 解析', async () => {
      // 构造一个简单的 JWT mock
      const payload = { exp: Math.floor(Date.now() / 1000) + 3600 };
      const base64Payload = Buffer.from(JSON.stringify(payload)).toString('base64');
      const fakeJwt = `header.${base64Payload}.signature`;

      mockGetTokenRecord.mockResolvedValueOnce(
        createMockTokenRecord({ token_value: fakeJwt, expires_at: null })
      );

      const result = await getNativeToken();

      expect(result.authorization).toBe(fakeJwt);
      expect(result.expiresAt).toBeGreaterThan(Date.now());
    });
  });

  describe('getNativeWmsSessionId', () => {
    it('委托 tokenRepo.getTokenValue', async () => {
      mockGetTokenValue.mockResolvedValueOnce('wms_session_id');

      const result = await getNativeWmsSessionId();

      expect(result).toBe('wms_session_id');
      expect(mockGetTokenValue).toHaveBeenCalledWith('wms');
    });
  });

  describe('checkAndRefreshAllTokens', () => {
    it('ERP Token 有效时跳过登录', async () => {
      const recentRecord = createMockTokenRecord({
        updated_at: new Date(), // 刚更新，不需要重新登录
      });
      mockGetTokenRecord.mockResolvedValueOnce(recentRecord);
      mockVerifyErp.mockResolvedValueOnce(true); // Token 有效

      // WMS
      mockGetTokenRecord.mockResolvedValueOnce(
        createMockTokenRecord({ system: 'wms', updated_at: new Date() })
      );
      mockVerifyWms.mockResolvedValueOnce(true);

      // B2B（ERP 有效所以会检查）
      mockGetTokenRecord.mockResolvedValueOnce(
        createMockTokenRecord({ system: 'b2b', updated_at: new Date() })
      );
      mockVerifyB2b.mockResolvedValueOnce(true);

      await checkAndRefreshAllTokens();

      expect(mockErpLogin).not.toHaveBeenCalled();
    });

    it('ERP Token 不存在时尝试登录', async () => {
      mockGetTokenRecord.mockResolvedValueOnce(null as any); // ERP 不存在
      mockErpLogin.mockResolvedValueOnce(true); // 登录成功

      // WMS
      mockGetTokenRecord.mockResolvedValueOnce(null as any);
      mockWmsLogin.mockResolvedValueOnce(true);

      await checkAndRefreshAllTokens();

      expect(mockErpLogin).toHaveBeenCalled();
    });

    it('ERP 不可用时跳过 B2B 检查', async () => {
      mockGetTokenRecord.mockResolvedValueOnce(null as any); // ERP 不存在
      mockErpLogin.mockResolvedValueOnce(false); // 登录失败

      // WMS
      mockGetTokenRecord.mockResolvedValueOnce(null as any);
      mockWmsLogin.mockResolvedValueOnce(true);

      await checkAndRefreshAllTokens();

      expect(mockB2bExchange).not.toHaveBeenCalled();
    });
  });
});
