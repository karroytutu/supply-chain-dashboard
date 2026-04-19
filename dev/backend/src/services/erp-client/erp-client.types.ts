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
  /** 默认付款科目 ID */
  defaultPaymentSubjectId: number;
  /** 默认业务员 ID */
  defaultSalesmanId: number;
  /** 默认部门 ID */
  defaultDeptId: number;
  /** 资产 API 路径前缀 */
  assetPathPrefix: string;
  /** 支出单 API 路径 */
  expenditureBillPath: string;
  /** 资产创建 API 路径 */
  assetCreatePath: string;
  /** 资产更新 API 路径 */
  assetUpdatePath: string;
  /** 资产清理 API 路径 */
  assetClearPath: string;
  /** 收入单 API 路径 */
  incomeBillPath: string;
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
export interface ErpApiResponse<T = unknown> {
  code: number;
  data: T;
  message?: string;
}

/** ERP 单据创建响应（费用单/收入单等） */
export interface ErpBillResponse {
  id: number;
  billStr: string;
  code?: string;
  [key: string]: unknown;
}

/** ERP 分页响应 */
export interface ErpPageResponse<T> {
  records: T[];
  total: number;
  current: number;
  size: number;
  [key: string]: unknown;
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
  requestHeaders?: Record<string, unknown>;
  requestBody?: unknown;
  responseStatus?: number;
  responseBody?: unknown;
  errorMessage?: string;
  durationMs: number;
  retryCount: number;
  businessType?: string;
  businessId?: number;
}
