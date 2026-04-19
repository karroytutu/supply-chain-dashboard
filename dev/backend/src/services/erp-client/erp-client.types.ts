/**
 * ERP API 客户端类型定义
 * @module services/erp-client/erp-client.types
 */

/** ERP API 配置 */
export interface ErpApiConfig {
  baseUrl: string;
  tokenUrl: string;
  cid: string;
  uid: string;
  timeout: number;
  retryMax: number;
  rateLimitMs: number;
}

/** ERP 认证令牌 */
export interface ErpToken {
  authorization: string;
  expiresAt: number;
}

/** ERP 请求选项 */
export interface ErpRequestOptions {
  /** 路径前缀，默认 /messiah/ */
  pathPrefix?: string;
  /** 业务类型（用于日志记录） */
  businessType?: string;
  /** 业务ID（用于日志关联） */
  businessId?: number;
  /** 是否跳过日志记录 */
  skipLog?: boolean;
  /** 自定义请求头 */
  headers?: Record<string, string>;
}

/** ERP API 响应基础结构 */
export interface ErpApiResponse<T = any> {
  code: number;
  data: T;
  message?: string;
}

/** ERP API 错误 */
export class ErpApiError extends Error {
  public readonly code: number;
  public readonly path: string;
  public readonly statusCode: number;

  constructor(message: string, code: number, path: string, statusCode: number = 500) {
    super(message);
    this.name = 'ErpApiError';
    this.code = code;
    this.path = path;
    this.statusCode = statusCode;
  }
}

/** 请求日志记录入参 */
export interface ErpLogEntry {
  requestId: string;
  method: string;
  path: string;
  requestHeaders?: Record<string, any>;
  requestBody?: any;
  responseStatus?: number;
  responseBody?: any;
  errorMessage?: string;
  durationMs: number;
  retryCount: number;
  businessType?: string;
  businessId?: number;
}
