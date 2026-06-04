/**
 * B2B Token 兑换服务单元测试
 */

jest.mock('../../utils/logger', () => ({
  createLogger: () => ({ info: jest.fn(), error: jest.fn(), warn: jest.fn() }),
}));

jest.mock('axios');

jest.mock('../../config', () => ({
  config: { tokenManager: { b2bBaseUrl: 'https://test.example.com' } },
}));

jest.mock('./token-repository', () => ({
  getTokenValue: jest.fn(),
  saveToken: jest.fn(),
  updateLoginStatus: jest.fn(),
  logOperation: jest.fn(),
}));

import axios from 'axios';
import * as tokenRepo from './token-repository';
import {
  exchangeB2bToken,
  performB2bExchangeAndSave,
  verifyB2bToken,
} from './b2b-exchange';

const mockAxios = axios as jest.Mocked<typeof axios>;
const mockGetTokenValue = tokenRepo.getTokenValue as jest.MockedFunction<typeof tokenRepo.getTokenValue>;
const mockSaveToken = tokenRepo.saveToken as jest.MockedFunction<typeof tokenRepo.saveToken>;
const mockUpdateLoginStatus = tokenRepo.updateLoginStatus as jest.MockedFunction<typeof tokenRepo.updateLoginStatus>;
const mockLogOperation = tokenRepo.logOperation as jest.MockedFunction<typeof tokenRepo.logOperation>;

describe('b2b-exchange', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('exchangeB2bToken', () => {
    it('成功兑换返回 accessToken 和 refreshToken', async () => {
      mockAxios.get.mockResolvedValueOnce({
        data: {
          code: 0,
          data: {
            accessToken: 'b2b_access_token_123',
            refreshToken: 'b2b_refresh_token_456',
            mid: 'M001',
            uid: 'U001',
            name: '测试用户',
          },
        },
      });

      const result = await exchangeB2bToken('erp_token_value');

      expect(result.accessToken).toBe('b2b_access_token_123');
      expect(result.refreshToken).toBe('b2b_refresh_token_456');
      expect(result.tokenInfo.mid).toBe('M001');
      expect(result.tokenInfo.name).toBe('测试用户');
    });

    it('API 返回非零 code 时抛出错误', async () => {
      mockAxios.get.mockResolvedValueOnce({
        data: { code: 1, message: 'Token 已过期' },
      });

      await expect(exchangeB2bToken('invalid_token')).rejects.toThrow('Token 已过期');
    });

    it('响应缺少 accessToken 时抛出错误', async () => {
      mockAxios.get.mockResolvedValueOnce({
        data: { code: 0, data: { refreshToken: 'rt' } },
      });

      await expect(exchangeB2bToken('erp_token')).rejects.toThrow('缺少 accessToken');
    });
  });

  describe('performB2bExchangeAndSave', () => {
    it('ERP Token 不可用时返回 false', async () => {
      mockGetTokenValue.mockResolvedValueOnce(null);

      const result = await performB2bExchangeAndSave();

      expect(result).toBe(false);
      expect(mockLogOperation).toHaveBeenCalledWith(
        expect.objectContaining({ system: 'b2b', status: 'failed' })
      );
    });

    it('兑换成功时保存 Token 并返回 true', async () => {
      mockGetTokenValue.mockResolvedValueOnce('erp_token_value');
      mockAxios.get.mockResolvedValueOnce({
        data: {
          code: 0,
          data: {
            accessToken: 'b2b_access',
            refreshToken: 'b2b_refresh',
            mid: 'M001',
            name: '用户A',
          },
        },
      });

      const result = await performB2bExchangeAndSave();

      expect(result).toBe(true);
      expect(mockSaveToken).toHaveBeenCalledWith(
        expect.objectContaining({
          system: 'b2b',
          tokenValue: 'b2b_access',
          loginStatus: 'success',
        })
      );
    });

    it('兑换失败时更新状态为 failed 并返回 false', async () => {
      mockGetTokenValue.mockResolvedValueOnce('erp_token_value');
      mockAxios.get.mockRejectedValueOnce(new Error('Network error'));

      const result = await performB2bExchangeAndSave();

      expect(result).toBe(false);
      expect(mockUpdateLoginStatus).toHaveBeenCalledWith('b2b', 'failed');
    });
  });

  describe('verifyB2bToken', () => {
    it('200 状态 + 有效业务响应返回 true', async () => {
      mockAxios.post.mockResolvedValueOnce({
        status: 200,
        data: { code: 0, data: {} },
      });

      const result = await verifyB2bToken('valid_token');

      expect(result).toBe(true);
    });

    it('200 状态但 code 非 0 返回 false', async () => {
      mockAxios.post.mockResolvedValueOnce({
        status: 200,
        data: { code: 401, message: 'Token expired' },
      });

      const result = await verifyB2bToken('expired_token');

      expect(result).toBe(false);
    });

    it('401 响应返回 false', async () => {
      const error = Object.assign(new Error('Unauthorized'), {
        response: { status: 401 },
        isAxiosError: true,
      });
      mockAxios.post.mockRejectedValueOnce(error);
      mockAxios.isAxiosError.mockReturnValueOnce(true);

      const result = await verifyB2bToken('invalid_token');

      expect(result).toBe(false);
    });

    it('Bearer 前缀处理', async () => {
      mockAxios.post.mockResolvedValueOnce({
        status: 200,
        data: { code: 0 },
      });

      await verifyB2bToken('Bearer existing_prefix_token');

      expect(mockAxios.post).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(Object),
        expect.objectContaining({
          headers: expect.objectContaining({
            authorization: 'Bearer existing_prefix_token',
          }),
        })
      );
    });

    it('非 401/403 错误记录日志并返回 false', async () => {
      const error = Object.assign(new Error('Server Error'), {
        response: { status: 500 },
        isAxiosError: true,
      });
      mockAxios.post.mockRejectedValueOnce(error);
      mockAxios.isAxiosError.mockReturnValueOnce(true);

      const result = await verifyB2bToken('some_token');

      expect(result).toBe(false);
    });
  });
});
