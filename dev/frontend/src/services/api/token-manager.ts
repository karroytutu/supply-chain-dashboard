/**
 * Token 管理 API 服务
 */

import request from './request';

/** 单系统 Token 状态 */
export interface TokenStatusInfo {
  status: 'none' | 'success' | 'failed' | 'expired' | 'pending_sms';
  hasToken: boolean;
  expiresAt: string | null;
  updatedAt: string | null;
  remainingHours: number | null;
  lastLoginAt: string | null;
  needsSms: boolean;
}

/** 三系统 Token 状态 */
export interface AllTokensStatus {
  erp: TokenStatusInfo;
  wms: TokenStatusInfo;
  b2b: TokenStatusInfo;
}

/** 操作日志记录 */
export interface TokenOperationLog {
  id: number;
  system: string;
  operation: string;
  status: string;
  operator_id: number | null;
  detail: Record<string, unknown> | null;
  duration_ms: number | null;
  created_at: string;
}

/** 获取三系统 Token 状态 */
export async function getTokenStatus(): Promise<AllTokensStatus> {
  return request.get('/token-admin/status');
}

/** 获取操作日志 */
export async function getTokenLogs(params: {
  page?: number;
  pageSize?: number;
  system?: string;
}): Promise<{ data: TokenOperationLog[]; total: number }> {
  return request.get('/token-admin/logs', { params });
}

/** 触发 ERP 登录 */
export async function triggerErpLogin(): Promise<void> {
  return request.post('/token-admin/erp/login');
}

/** 触发 WMS 登录 */
export async function triggerWmsLogin(smsCode?: string): Promise<{ needsSms?: boolean; message?: string }> {
  return request.post('/token-admin/wms/login', { smsCode });
}

/** 提交 WMS 短信验证码 */
export async function submitWmsSmsCode(code: string): Promise<void> {
  return request.post('/token-admin/wms/sms-code', { code });
}

/** 触发 B2B Token 兑换 */
export async function triggerB2bExchange(): Promise<void> {
  return request.post('/token-admin/b2b/exchange');
}

/** 验证 Token 有效性 */
export async function verifyToken(system: 'erp' | 'wms' | 'b2b'): Promise<{ valid: boolean }> {
  return request.post(`/token-admin/${system}/verify`);
}
