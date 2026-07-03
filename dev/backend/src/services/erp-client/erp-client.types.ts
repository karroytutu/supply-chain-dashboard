/**
 * ERP API 客户端类型定义
 * @module services/erp-client/erp-client.types
 */

/** ERP API 配置 */
export interface ErpApiConfig {
  baseUrl: string;
  cid: string;
  uid: string;
  timeout: number;
  retryMax: number;
  /** 【弃用】最小请求间隔(ms)，已被分组并发模型取代，保留仅为向后兼容 */
  rateLimitMs: number;
  /** 单个 API 端点最大并发数，默认 4 */
  maxGroupConcurrency?: number;
  /** 全局(跨所有端点)最大并发数，默认 12，作为 ERP 服务器保护阀 */
  maxGlobalConcurrency?: number;
  /** 默认付款科目 ID */
  defaultPaymentSubjectId: number;
  /** 默认业务员 ID */
  defaultSalesmanId: number;
  /** 默认部门 ID */
  defaultDeptId: number;
  /** 资产 API 路径前缀 */
  assetPathPrefix: string;
  /** 客户 API 路径前缀 */
  customerPathPrefix: string;
  /** 支出单 API 路径 */
  expenditureBillPath: string;
  /** 供应商费用单 API 路径（trade-expenditure） */
  supplierExpenditureBillPath?: string;
  /** 资产创建 API 路径 */
  assetCreatePath: string;
  /** 资产更新 API 路径 */
  assetUpdatePath: string;
  /** 资产清理 API 路径 */
  assetClearPath: string;
  /** 收入单 API 路径（现金收入单） */
  incomeBillPath: string;
  /** 供应商收入单 API 路径（贸易类收入单） */
  supplierIncomeBillPath?: string;
  /** 费用单反审 API 路径 */
  expenditureBillReApprovePath: string;
  /** 费用单取消 API 路径 */
  expenditureBillCancelPath: string;
  /** 收入单反审 API 路径 */
  incomeReApprovePath: string;
  /** 收入单取消 API 路径 */
  incomeCancelPath: string;
  // ==================== 数据源 API 路径（ERP 数据库迁移） ====================
  /** 客户欠款明细 API 路径前缀 */
  debtPathPrefix: string;
  /** 实时库存表 API 路径前缀 */
  inventoryPathPrefix: string;
  /** 销售结算明细 API 路径前缀 */
  salesDetailPathPrefix: string;
  /** 批次库存 API 路径前缀 */
  batchInventoryPathPrefix: string;
  /** WMS 系统 Base URL */
  wmsBaseUrl: string;
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
  /** 限流分组键；不传时按完整端点路径自动分组 */
  rateLimitGroup?: string;
  /** 自定义超时时间（ms）；不传时使用全局 config.erpApi.timeout */
  timeout?: number;
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

  constructor(message: string, code: number, path: string, statusCode = 500) {
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
