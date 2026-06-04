/**
 * B2B Token 兑换服务
 * 使用 ERP Token 兑换店管家 (B2B) 访问 Token
 * @module services/token-manager/b2b-exchange
 */
import { createLogger } from '../../utils/logger';
const log = createLogger('TokenManager');

import axios from 'axios';
import { config } from '../../config';
import * as tokenRepo from './token-repository';
import type { B2bExchangeResult } from './token-types';

const tmConfig = (config as any).tokenManager;

/**
 * 兑换 B2B Token
 * 使用 ERP Token 调用店管家兑换接口，获取 B2B accessToken + refreshToken
 */
export async function exchangeB2bToken(erpToken: string): Promise<B2bExchangeResult> {
  const baseUrl = tmConfig?.b2bBaseUrl || 'https://bluespace-plus.zhoupudata.com';
  const url = `${baseUrl}/admin/auth/mamba-change-token`;

  const response = await axios.get(url, {
    params: { token: erpToken },
    headers: {
      Accept: 'application/json, text/plain, */*',
      'Content-Type': 'application/json;charset=utf-8',
      'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
      Referer: `${baseUrl}/saas/bluespace/?domain=zhoupudata.com`,
    },
    timeout: 15000,
  });

  const data = response.data;
  if (!data || data.code !== 0) {
    throw new Error(`B2B Token 兑换失败: ${data?.message || '未知错误'}`);
  }

  const responseData = data.data || {};
  const accessToken = responseData.accessToken;
  const refreshToken = responseData.refreshToken;

  if (!accessToken) {
    throw new Error('B2B Token 兑换响应中缺少 accessToken');
  }

  const tokenInfo: Record<string, unknown> = {
    mid: responseData.mid,
    uid: responseData.uid,
    thirdTenantId: responseData.thirdTenantId,
    thirdId: responseData.thirdId,
    staffType: responseData.staffType,
    mallType: responseData.mallType,
    name: responseData.name,
    phone: responseData.phone,
  };

  return { accessToken, refreshToken, tokenInfo };
}

/**
 * 执行 B2B Token 兑换并保存到数据库
 * @returns true 成功, false 失败
 */
export async function performB2bExchangeAndSave(operatorId?: number): Promise<boolean> {
  const startTime = Date.now();

  try {
    // 1. 获取 ERP Token
    const erpToken = await tokenRepo.getTokenValue('erp');
    if (!erpToken) {
      log.error('ERP Token 不可用，无法兑换 B2B Token');
      await tokenRepo.logOperation({
        system: 'b2b',
        operation: 'exchange',
        status: 'failed',
        operatorId,
        detail: { error: 'ERP Token 不可用' },
        durationMs: Date.now() - startTime,
      });
      return false;
    }

    // 2. 兑换
    const result = await exchangeB2bToken(erpToken);

    // 3. 保存到数据库
    await tokenRepo.saveToken({
      system: 'b2b',
      tokenValue: result.accessToken,
      tokenSecondary: result.refreshToken,
      tokenMeta: result.tokenInfo,
      loginStatus: 'success',
    });

    const durationMs = Date.now() - startTime;
    log.info(`Token 兑换成功 (耗时 ${durationMs}ms)`);

    await tokenRepo.logOperation({
      system: 'b2b',
      operation: 'exchange',
      status: 'success',
      operatorId,
      durationMs,
      detail: { name: result.tokenInfo.name, mid: result.tokenInfo.mid },
    });

    return true;
  } catch (error) {
    const durationMs = Date.now() - startTime;
    const errorMsg = error instanceof Error ? error.message : String(error);
    log.error(`Token 兑换失败: ${errorMsg}`);

    await tokenRepo.updateLoginStatus('b2b', 'failed');
    await tokenRepo.logOperation({
      system: 'b2b',
      operation: 'exchange',
      status: 'failed',
      operatorId,
      durationMs,
      detail: { error: errorMsg },
    });

    return false;
  }
}

/**
 * 验证 B2B Token 有效性
 * 通过实际 API 请求检测 Token 是否仍可用
 */
export async function verifyB2bToken(accessToken: string): Promise<boolean> {
  try {
    const baseUrl = tmConfig?.b2bBaseUrl || 'https://bluespace-plus.zhoupudata.com';
    const url = `${baseUrl}/admin/sale-report/sale-analysis`;

    const response = await axios.post(
      url,
      {
        current: 1,
        size: 1,
        total: 0,
        startDate: new Date(new Date().getFullYear(), new Date().getMonth(), 1)
          .toISOString()
          .split('T')[0],
        endDate: new Date().toISOString().split('T')[0],
        dim: 'DAY',
      },
      {
        headers: {
          Accept: 'application/json, text/plain, */*',
          'Content-Type': 'application/json;charset=UTF-8',
          'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
          authorization: accessToken.startsWith('Bearer ') ? accessToken : `Bearer ${accessToken}`,
          Origin: baseUrl,
          Referer: `${baseUrl}/saas/bluespace/?domain=zhoupudata.com`,
        },
        timeout: 10000,
      }
    );

    if (response.status === 200) {
      const data = response.data;
      // 有效的业务响应（非登录页面内容）
      if (typeof data === 'object' && (!('code' in data) || data.code === 0)) {
        return true;
      }
    }

    return false;
  } catch (error) {
    if (
      axios.isAxiosError(error) &&
      (error.response?.status === 401 || error.response?.status === 403)
    ) {
      return false;
    }
    log.error('Token 验证请求失败:', error);
    return false;
  }
}
