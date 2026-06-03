/**
 * Token 管理模块类型定义
 * @module services/token-manager/token-types
 */

/** Token 系统标识 */
export type TokenSystem = 'erp' | 'wms' | 'b2b';

/** Token 登录状态 */
export type TokenLoginStatus = 'none' | 'success' | 'failed' | 'expired' | 'pending_sms';

/** Token 操作类型 */
export type TokenOperation = 'login' | 'exchange' | 'verify' | 'refresh' | 'invalidate';

/** Token 操作状态 */
export type TokenOperationStatus = 'success' | 'failed' | 'pending';

/** erp_tokens 表行记录 */
export interface TokenRecord {
  id: number;
  system: TokenSystem;
  token_value: string;
  token_secondary: string | null;
  token_meta: Record<string, unknown> | null;
  login_status: TokenLoginStatus;
  needs_sms: boolean;
  expires_at: Date | null;
  updated_at: Date;
}

/** Token 操作日志行记录 */
export interface TokenOperationLog {
  id: number;
  system: TokenSystem;
  operation: TokenOperation;
  status: TokenOperationStatus;
  operator_id: number | null;
  detail: Record<string, unknown> | null;
  duration_ms: number | null;
  created_at: Date;
}

/** 单系统 Token 状态（API 响应用） */
export interface TokenStatusInfo {
  status: TokenLoginStatus;
  hasToken: boolean;
  expiresAt: string | null;
  updatedAt: string | null;
  remainingHours: number | null;
  lastLoginAt: string | null;
  needsSms: boolean;
}

/** 三系统 Token 状态汇总（API 响应用） */
export interface AllTokensStatus {
  erp: TokenStatusInfo;
  wms: TokenStatusInfo;
  b2b: TokenStatusInfo;
}

/** B2B Token 兑换结果 */
export interface B2bExchangeResult {
  accessToken: string;
  refreshToken: string;
  tokenInfo: Record<string, unknown>;
}

/** WMS 登录结果 */
export interface WmsLoginResult {
  success: boolean;
  needsSms: boolean;
  sessionId?: string;
  deviceToken?: string;
  error?: string;
}

/** ERP 登录结果 */
export interface ErpLoginResult {
  success: boolean;
  authorization?: string;
  sessionId?: string;
  error?: string;
}

/** 操作日志写入参数 */
export interface LogOperationParams {
  system: TokenSystem;
  operation: TokenOperation;
  status: TokenOperationStatus;
  operatorId?: number;
  detail?: Record<string, unknown>;
  durationMs?: number;
}
