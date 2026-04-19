/**
 * 舟谱 ERP 核心 HTTP 客户端
 * 自动注入认证、公共头部、重试、限流、日志
 * @module services/erp-client/erp-client
 */

import axios, { AxiosRequestConfig } from 'axios';
import { getErpConfig, ERP_API_VERSION } from './erp-config';
import { getErpAccessToken } from './erp-auth';
import { createLogEntry, writeErpLog } from './erp-logger';
import { ErpApiError } from './erp-client.types';
import type { ErpRequestOptions, ErpApiResponse } from './erp-client.types';

/** 请求限流队列 */
let _lastRequestTime = 0;

/**
 * 请求限流 — 保证两次请求间至少间隔 rateLimitMs
 * 先标记时间戳再延迟，避免并发请求绕过限速
 */
async function waitForRateLimit(): Promise<void> {
  const config = getErpConfig();
  const now = Date.now();
  const elapsed = now - _lastRequestTime;
  if (elapsed < config.rateLimitMs) {
    const waitTime = config.rateLimitMs - elapsed;
    _lastRequestTime = now + waitTime; // 先标记预期完成时间
    await new Promise(resolve => setTimeout(resolve, waitTime));
  } else {
    _lastRequestTime = now;
  }
}

/**
 * 构造公共请求头
 */
async function buildCommonHeaders(customHeaders?: Record<string, string>): Promise<Record<string, string>> {
  const config = getErpConfig();
  const token = await getErpAccessToken();

  return {
    'authorization': `Bearer ${token}`,
    'cid': config.cid,
    'uid': config.uid,
    'SaasCid': config.cid,
    'apiversion': ERP_API_VERSION,
    'Content-Type': 'application/json;charset=UTF-8',
    ...customHeaders,
  };
}

/**
 * 核心 ERP 请求方法
 * 自动注入认证、重试、限流、日志
 */
export async function erpRequest<T = any>(
  method: string,
  path: string,
  data?: any,
  options?: ErpRequestOptions
): Promise<T> {
  const config = getErpConfig();
  const pathPrefix = options?.pathPrefix ?? '/messiah/';
  const fullPath = `${pathPrefix}${path}`.replace(/\/+/g, '/');
  const url = `${config.baseUrl}${fullPath}`;

  const requestId = createLogEntry();
  let retryCount = 0;
  let lastError: Error | null = null;
  const startTime = Date.now();

  // 构造请求头
  const headers = await buildCommonHeaders(options?.headers);

  // 脱敏后的请求头（移除 authorization）
  const sanitizedHeaders = { ...headers };
  delete sanitizedHeaders.authorization;

  while (retryCount <= config.retryMax) {
    try {
      // 请求限流
      await waitForRateLimit();

      const axiosConfig: AxiosRequestConfig = {
        method: method.toUpperCase() as any,
        url,
        headers,
        timeout: config.timeout,
      };

      if (method.toUpperCase() === 'GET') {
        axiosConfig.params = data;
      } else {
        axiosConfig.data = data;
      }

      const response = await axios(axiosConfig);
      const responseData = response.data;

      // 写入日志
      if (!options?.skipLog) {
        writeErpLog({
          requestId,
          method: method.toUpperCase(),
          path: fullPath,
          requestHeaders: sanitizedHeaders,
          requestBody: method.toUpperCase() !== 'GET' ? data : undefined,
          responseStatus: response.status,
          responseBody: responseData,
          durationMs: Date.now() - startTime,
          retryCount,
          businessType: options?.businessType,
          businessId: options?.businessId,
        });
      }

      // 舟谱 API 错误码检查
      if (responseData && typeof responseData === 'object' && responseData.code !== undefined && responseData.code !== 0) {
        throw new ErpApiError(
          responseData.message || `舟谱API错误(code=${responseData.code})`,
          responseData.code,
          fullPath,
          response.status
        );
      }

      return responseData as T;
    } catch (error: any) {
      lastError = error;

      // ErpApiError（舟谱业务错误）不重试
      if (error instanceof ErpApiError) {
        if (!options?.skipLog) {
          writeErpLog({
            requestId,
            method: method.toUpperCase(),
            path: fullPath,
            requestHeaders: sanitizedHeaders,
            requestBody: method.toUpperCase() !== 'GET' ? data : undefined,
            errorMessage: error.message,
            durationMs: Date.now() - startTime,
            retryCount,
            businessType: options?.businessType,
            businessId: options?.businessId,
          });
        }
        throw error;
      }

      // 网络错误或超时，可重试
      retryCount++;
      if (retryCount <= config.retryMax) {
        const delay = Math.min(1000 * Math.pow(2, retryCount - 1), 10000);
        console.warn(`[ErpClient] 请求失败，${delay}ms 后第 ${retryCount} 次重试: ${fullPath}`, error.message);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }

  // 重试耗尽
  if (!options?.skipLog) {
    writeErpLog({
      requestId,
      method: method.toUpperCase(),
      path: fullPath,
      requestHeaders: sanitizedHeaders,
      requestBody: method.toUpperCase() !== 'GET' ? data : undefined,
      errorMessage: lastError?.message || '未知错误',
      durationMs: Date.now() - startTime,
      retryCount,
      businessType: options?.businessType,
      businessId: options?.businessId,
    });
  }

  throw new ErpApiError(
    `ERP API 请求失败(${retryCount}次重试后): ${lastError?.message || '未知错误'}`,
    -1,
    fullPath,
    500
  );
}

/**
 * GET 请求便捷方法
 */
export async function erpGet<T = any>(
  path: string,
  params?: Record<string, any>,
  options?: ErpRequestOptions
): Promise<T> {
  return erpRequest<T>('GET', path, params, options);
}

/**
 * POST 请求便捷方法
 */
export async function erpPost<T = any>(
  path: string,
  data?: any,
  options?: ErpRequestOptions
): Promise<T> {
  return erpRequest<T>('POST', path, data, options);
}

/**
 * PUT 请求便捷方法
 */
export async function erpPut<T = any>(
  path: string,
  data?: any,
  options?: ErpRequestOptions
): Promise<T> {
  return erpRequest<T>('PUT', path, data, options);
}
