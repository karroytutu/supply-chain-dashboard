/**
 * 舟谱 ERP 核心 HTTP 客户端
 * 自动注入认证、公共头部、重试、限流、日志
 * @module services/erp-client/erp-client
 */
import { createLogger } from '../../utils/logger';
const log = createLogger('ERP');

import axios, { AxiosRequestConfig } from 'axios';
import http from 'http';
import https from 'https';
import { getErpConfig, ERP_API_VERSION } from './erp-config';
import { getErpAccessToken } from './erp-auth';
import { createLogEntry, writeErpLog } from './erp-logger';
import { ErpApiError, type ErpRequestOptions, type ErpLogEntry } from './erp-client.types';
import { getErrorMessage } from '../../utils/errorUtils';
import { acquireRateSlot, defaultRateLimitGroup } from './erp-rate-limiter';
import { getErpCircuitBreaker, ErpCircuitOpenError } from './erp-circuit-breaker';

/** keepAlive 连接池：复用 TCP/TLS 连接，消除每次握手开销 */
const erpHttpAgent = new http.Agent({
  keepAlive: true,
  maxSockets: 50,
  maxFreeSockets: 10,
  timeout: 30000,
});
const erpHttpsAgent = new https.Agent({
  keepAlive: true,
  maxSockets: 50,
  maxFreeSockets: 10,
  timeout: 30000,
});

/** 共享 axios 实例（复用连接池） */
const erpAxios = axios.create({ httpAgent: erpHttpAgent, httpsAgent: erpHttpsAgent });

/**
 * 构造公共请求头
 */
async function buildCommonHeaders(
  customHeaders?: Record<string, string>
): Promise<Record<string, string>> {
  const config = getErpConfig();
  const token = await getErpAccessToken();

  return {
    authorization: `Bearer ${token}`,
    cid: config.cid,
    uid: config.uid,
    SaasCid: config.cid,
    apiversion: ERP_API_VERSION,
    'Content-Type': 'application/json;charset=UTF-8',
    ...customHeaders,
  };
}

/**
 * 核心 ERP 请求方法
 * 自动注入认证、重试、限流、日志
 */
export async function erpRequest<T = unknown>(
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
  let lastAxiosResponse: { status: number; data: unknown } | null = null;
  const startTime = Date.now();
  const upperMethod = method.toUpperCase();

  // 构造请求头
  const headers = await buildCommonHeaders(options?.headers);

  // 脱敏后的请求头（移除 authorization）
  const sanitizedHeaders = { ...headers };
  delete sanitizedHeaders.authorization;

  // 可变日志条目：各路径只更新差异字段，finally 中统一写入一次
  const logEntry: ErpLogEntry = {
    requestId,
    method: upperMethod,
    path: fullPath,
    requestHeaders: sanitizedHeaders,
    requestBody: upperMethod !== 'GET' ? data : undefined,
    durationMs: 0,
    retryCount: 0,
    businessType: options?.businessType,
    businessId: options?.businessId,
  };

  // 断路器检查：ERP 连续不可用时快速失败
  const cb = getErpCircuitBreaker();
  if (!cb.allowRequest()) {
    throw new ErpCircuitOpenError();
  }

  try {
    while (retryCount <= config.retryMax) {
      let releaseSlot: (() => void) | null = null;
      try {
        // 限流：按分组并发控制（仅持有 HTTP 期间的槽位，退避期间释放）
        const rateGroup = options?.rateLimitGroup ?? defaultRateLimitGroup(pathPrefix, path);
        releaseSlot = await acquireRateSlot(rateGroup);

        const axiosConfig: AxiosRequestConfig = {
          method: upperMethod as any,
          url,
          headers,
          timeout: options?.timeout ?? config.timeout,
          httpAgent: erpHttpAgent,
          httpsAgent: erpHttpsAgent,
        };

        if (upperMethod === 'GET') {
          axiosConfig.params = data;
        } else {
          axiosConfig.data = data;
        }

        const response = await erpAxios(axiosConfig);
        // HTTP 完成，立即释放限流槽位
        releaseSlot();
        releaseSlot = null;

        const responseData = response.data;

        // 更新日志条目的响应字段
        logEntry.responseStatus = response.status;
        logEntry.responseBody = responseData;

        // 舟谱 API 错误码检查
        if (
          responseData &&
          typeof responseData === 'object' &&
          responseData.code !== undefined &&
          responseData.code !== 0
        ) {
          throw new ErpApiError(
            responseData.message || `舟谱API错误(code=${responseData.code})`,
            responseData.code,
            fullPath,
            response.status
          );
        }

        return responseData as T;
      } catch (error: unknown) {
        // 确保 HTTP 失败后立即释放限流槽位
        releaseSlot?.();

        lastError = error instanceof Error ? error : new Error(String(error));

        // ErpApiError（舟谱业务错误）不重试，但视为 ERP 可达（记录成功）
        if (error instanceof ErpApiError) {
          logEntry.errorMessage = getErrorMessage(error);
          cb.recordSuccess();
          throw error;
        }

        // 网络/超时错误：记录失败到断路器
        cb.recordFailure();

        // HTTP 4xx/5xx 错误：保留 Axios 原始响应体用于日志（Axios 对非 2xx 抛 error，response 挂在 error.response 上）
        const axiosError = error as { response?: { status: number; data: unknown }; message: string };
        if (axiosError?.response) {
          lastAxiosResponse = { status: axiosError.response.status, data: axiosError.response.data };
          const respInfo = axiosError.response.data
            ? ` | response: ${typeof axiosError.response.data === 'object' ? JSON.stringify(axiosError.response.data) : axiosError.response.data}`
            : '';
          lastError = new Error(`${axiosError.message}${respInfo}`);
        }

        // 网络错误或超时，可重试
        retryCount++;
        if (retryCount <= config.retryMax) {
          const delay = Math.min(1000 * Math.pow(2, retryCount - 1), 10000);
          log.warn(
            `请求失败，${delay}ms 后第 ${retryCount} 次重试: ${fullPath}`,
            getErrorMessage(lastError)
          );
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
    }

    // 重试耗尽：更新日志条目的最终状态
    logEntry.responseStatus = lastAxiosResponse?.status;
    logEntry.responseBody = lastAxiosResponse?.data;
    logEntry.errorMessage = lastError?.message || '未知错误';

    throw new ErpApiError(
      `ERP API 请求失败(${retryCount}次重试后): ${lastError?.message || '未知错误'}`,
      -1,
      fullPath,
      500
    );
  } finally {
    // 请求成功时记录成功（业务错误已在 catch 中处理）
    if (!lastError) {
      cb.recordSuccess();
    }
    // 统一写入日志（fire-and-forget，不阻塞响应）
    logEntry.durationMs = Date.now() - startTime;
    logEntry.retryCount = retryCount;
    if (!options?.skipLog) {
      writeErpLog(logEntry).catch(err => log.warn('日志写入失败:', err?.message));
    }
  }
}

/**
 * GET 请求便捷方法
 */
export async function erpGet<T = unknown>(
  path: string,
  params?: Record<string, any>,
  options?: ErpRequestOptions
): Promise<T> {
  return erpRequest<T>('GET', path, params, options);
}

/**
 * POST 请求便捷方法
 */
export async function erpPost<T = unknown>(
  path: string,
  data?: any,
  options?: ErpRequestOptions
): Promise<T> {
  return erpRequest<T>('POST', path, data, options);
}

/**
 * PUT 请求便捷方法
 */
export async function erpPut<T = unknown>(
  path: string,
  data?: any,
  options?: ErpRequestOptions
): Promise<T> {
  return erpRequest<T>('PUT', path, data, options);
}

/**
 * 从 ERP 响应中安全提取 data 字段
 *
 * 舟谱 API 响应格式不统一：
 * - 有的返回 `{ code: 0, data: { records: [...], total: 100 } }`
 * - 有的直接返回 `{ records: [...], total: 100 }`
 *
 * 此函数统一处理两种格式，避免各服务文件中重复 `as any` 断言。
 *
 * @example
 * ```ts
 * const response = await erpPost<unknown>('/store-query/search', body, opts);
 * const data = extractErpData<{ records?: ErpCustomer[]; total?: number }>(response);
 * const records = data?.records ?? [];
 * ```
 */
export function extractErpData<T>(response: unknown): T {
  if (response && typeof response === 'object') {
    const r = response as Record<string, unknown>;
    // 优先取 response.data，若不存在则取 response 本身
    return (r.data !== undefined ? r.data : response) as T;
  }
  return response as T;
}
