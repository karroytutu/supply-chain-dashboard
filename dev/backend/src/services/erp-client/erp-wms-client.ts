/**
 * WMS 仓储管理系统 HTTP 客户端
 * 使用 Cookie 认证（WMSJSESSIONID），从 Token 管理模块获取
 * @module services/erp-client/erp-wms-client
 */

import axios, { AxiosRequestConfig } from 'axios';
import { getErpConfig } from './erp-config';
import { getWmsSessionId } from './erp-auth';
import { ErpApiError } from './erp-client.types';

/** WMS 请求限流（与主 ERP 共享 200ms 限流） */
let _lastWmsRequestTime = 0;

async function waitForWmsRateLimit(): Promise<void> {
  const config = getErpConfig();
  const now = Date.now();
  const elapsed = now - _lastWmsRequestTime;
  if (elapsed < config.rateLimitMs) {
    const waitTime = config.rateLimitMs - elapsed;
    _lastWmsRequestTime = now + waitTime;
    await new Promise(resolve => setTimeout(resolve, waitTime));
  } else {
    _lastWmsRequestTime = now;
  }
}

/**
 * WMS GET 请求
 */
export async function wmsGet<T = any>(
  path: string,
  params?: Record<string, any>
): Promise<T> {
  return wmsRequest<T>('GET', path, params);
}

/**
 * WMS 核心请求方法
 */
export async function wmsRequest<T = any>(
  method: string,
  path: string,
  data?: any
): Promise<T> {
  const config = getErpConfig();
  const wmsBaseUrl = config.wmsBaseUrl || 'https://wms.zhoupudata.com';
  const url = `${wmsBaseUrl}${path}`;

  const sessionId = await getWmsSessionId();

  let retryCount = 0;
  let lastError: Error | null = null;

  while (retryCount <= config.retryMax) {
    try {
      await waitForWmsRateLimit();

      const axiosConfig: AxiosRequestConfig = {
        method: method.toUpperCase() as any,
        url,
        timeout: config.timeout,
        headers: {
          'Cookie': `WMSJSESSIONID=${sessionId}`,
          'Accept': 'application/json',
        },
      };

      if (method.toUpperCase() === 'GET') {
        axiosConfig.params = data;
      } else {
        axiosConfig.data = data;
      }

      const response = await axios(axiosConfig);
      return response.data as T;
    } catch (error: any) {
      lastError = error;
      retryCount++;
      if (retryCount <= config.retryMax) {
        const delay = Math.min(1000 * Math.pow(2, retryCount - 1), 10000);
        console.warn(`[WmsClient] 请求失败，${delay}ms 后第 ${retryCount} 次重试: ${path}`, error.message);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }

  throw new ErpApiError(
    `WMS API 请求失败(${retryCount}次重试后): ${lastError?.message || '未知错误'}`,
    -1,
    path,
    500
  );
}
