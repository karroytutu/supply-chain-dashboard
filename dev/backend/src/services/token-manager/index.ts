/**
 * Token 管理模块入口
 * 协调 ERP/WMS/B2B 三系统的 Token 获取、刷新、验证
 * @module services/token-manager
 */
import { createLogger } from '../../utils/logger';
const log = createLogger('TokenManager');

import * as tokenRepo from './token-repository';
import { performB2bExchangeAndSave, verifyB2bToken } from './b2b-exchange';
import { performWmsLoginAndSave, verifyWmsToken } from './wms-login';
import { performErpLoginAndSave, verifyErpToken } from './erp-login';
import type { AllTokensStatus, TokenStatusInfo, TokenRecord } from './token-types';

// 重导出子模块
export { performB2bExchangeAndSave, verifyB2bToken } from './b2b-exchange';
export { performWmsLoginAndSave, verifyWmsToken } from './wms-login';
export { performErpLoginAndSave, verifyErpToken } from './erp-login';
export * from './token-types';
export * as tokenRepository from './token-repository';

// ==================== Token 状态查询 ====================

/**
 * 构建单系统状态信息
 */
function buildStatusInfo(
  record: TokenRecord | undefined,
  lastLoginAt: string | null = null
): TokenStatusInfo {
  if (!record || !record.token_value) {
    return {
      status: 'none',
      hasToken: false,
      expiresAt: null,
      updatedAt: null,
      remainingHours: null,
      lastLoginAt: null,
      needsSms: false,
    };
  }

  let remainingHours: number | null = null;
  if (record.expires_at) {
    const expiresMs = new Date(record.expires_at).getTime();
    const remainingMs = expiresMs - Date.now();
    remainingHours = Math.max(0, Math.round((remainingMs / (1000 * 60 * 60)) * 10) / 10);
  }

  return {
    status: record.login_status,
    hasToken: true,
    expiresAt: record.expires_at ? new Date(record.expires_at).toISOString() : null,
    updatedAt: record.updated_at ? new Date(record.updated_at).toISOString() : null,
    remainingHours,
    lastLoginAt,
    needsSms: record.needs_sms || false,
  };
}

/**
 * 获取三系统 Token 状态汇总
 */
export async function getAllTokensStatus(): Promise<AllTokensStatus> {
  const [records, lastLoginTimes] = await Promise.all([
    tokenRepo.getAllTokenRecords(),
    tokenRepo.getLastLoginTimes(),
  ]);

  return {
    erp: buildStatusInfo(records.erp, lastLoginTimes.erp),
    wms: buildStatusInfo(records.wms, lastLoginTimes.wms),
    b2b: buildStatusInfo(records.b2b, lastLoginTimes.b2b),
  };
}

// ==================== Native Token 获取（供 erp-auth.ts 调用） ====================

/**
 * 从数据库读取 ERP Token（native 模式）
 * 当 erp-auth.ts 的 refreshErpToken() 检测到 tokenMode='native' 时调用此函数
 */
export async function getNativeToken(): Promise<{ authorization: string; expiresAt: number }> {
  const record = await tokenRepo.getTokenRecord('erp');

  if (!record || !record.token_value) {
    throw new Error('ERP Token 不可用，请通过管理后台执行 ERP 登录');
  }

  if (record.login_status === 'failed' || record.login_status === 'expired') {
    throw new Error(`ERP Token 状态异常 (${record.login_status})，请通过管理后台重新登录`);
  }

  const authorization = record.token_value;

  // 优先使用数据库记录的 expires_at，其次 JWT 解析
  let expiresAt: number;
  if (record.expires_at) {
    expiresAt = new Date(record.expires_at).getTime();
  } else {
    try {
      const payloadBase64 = authorization.split('.')[1];
      const payload = JSON.parse(Buffer.from(payloadBase64, 'base64').toString('utf8'));
      const exp = payload.u?.exp || payload.exp;
      expiresAt = exp > 1e12 ? exp : exp * 1000;
    } catch (parseError) {
      log.warn(
        'JWT 解析失败且数据库无 expires_at，使用默认 13 天过期。Token 可能无效:',
        parseError
      );
      expiresAt = Date.now() + 13 * 24 * 60 * 60 * 1000;
    }
  }

  return { authorization, expiresAt };
}

/**
 * 从数据库读取 WMS Session ID（native 模式）
 */
export async function getNativeWmsSessionId(): Promise<string | null> {
  return tokenRepo.getTokenValue('wms');
}

// ==================== 定时调度入口 ====================

/** ERP 连续失败计数，达到阈值后停止自动重试 Playwright 登录（避免 OOM） */
let _erpConsecutiveFailures = 0;
const ERP_MAX_CONSECUTIVE_FAILURES = 3;

/**
 * 检查并刷新所有 Token（供调度器调用）
 * 执行顺序：ERP → WMS → B2B（B2B 依赖 ERP Token，必须在 ERP 之后处理）
 */
export async function checkAndRefreshAllTokens(): Promise<void> {
  log.info('开始检查所有 Token 状态...');

  // 1. 检查 ERP Token（B2B 依赖它，必须优先确保可用）
  let erpTokenAvailable = false;
  try {
    const erpRecord = await tokenRepo.getTokenRecord('erp');
    if (!erpRecord || !erpRecord.token_value) {
      log.info('ERP Token 不存在，尝试登录...');
      if (_erpConsecutiveFailures >= ERP_MAX_CONSECUTIVE_FAILURES) {
        log.warn(`ERP 登录已连续失败 ${_erpConsecutiveFailures} 次，跳过自动重试，请检查凭据配置`);
      } else {
        const loginOk = await performErpLoginAndSave();
        if (loginOk) {
          _erpConsecutiveFailures = 0;
          erpTokenAvailable = true;
        } else {
          _erpConsecutiveFailures++;
          log.warn(`ERP 登录失败 (${_erpConsecutiveFailures}/${ERP_MAX_CONSECUTIVE_FAILURES})`);
        }
      }
    } else {
      // 检查是否超过强制重登间隔（1小时）
      const updatedAt = erpRecord.updated_at ? new Date(erpRecord.updated_at).getTime() : 0;
      const ageMs = Date.now() - updatedAt;
      if (ageMs > 60 * 60 * 1000) {
        log.info('ERP Token 已超过1小时，强制重新登录...');
        if (_erpConsecutiveFailures >= ERP_MAX_CONSECUTIVE_FAILURES) {
          log.warn(`ERP 登录已连续失败 ${_erpConsecutiveFailures} 次，跳过自动重试`);
        } else {
          const loginOk = await performErpLoginAndSave();
          if (loginOk) {
            _erpConsecutiveFailures = 0;
            erpTokenAvailable = true;
          } else {
            _erpConsecutiveFailures++;
          }
        }
      } else {
        // 验证有效性
        const isValid = await verifyErpToken(erpRecord.token_value);
        if (!isValid) {
          log.info('ERP Token 已失效，重新登录...');
          await tokenRepo.updateLoginStatus('erp', 'expired');
          if (_erpConsecutiveFailures >= ERP_MAX_CONSECUTIVE_FAILURES) {
            log.warn(`ERP 登录已连续失败 ${_erpConsecutiveFailures} 次，跳过自动重试`);
          } else {
            const loginOk = await performErpLoginAndSave();
            if (loginOk) {
              _erpConsecutiveFailures = 0;
              erpTokenAvailable = true;
            } else {
              _erpConsecutiveFailures++;
            }
          }
        } else {
          erpTokenAvailable = true;
        }
      }
    }
  } catch (error) {
    log.error('ERP Token 检查失败:', error);
  }

  // 2. 检查 WMS Token
  try {
    const wmsRecord = await tokenRepo.getTokenRecord('wms');
    if (!wmsRecord || !wmsRecord.token_value) {
      log.info('WMS Session 不存在，尝试登录...');
      await performWmsLoginAndSave();
    } else {
      const updatedAt = wmsRecord.updated_at ? new Date(wmsRecord.updated_at).getTime() : 0;
      const ageMs = Date.now() - updatedAt;
      if (ageMs > 60 * 60 * 1000) {
        log.info('WMS Session 已超过1小时，重新登录...');
        await performWmsLoginAndSave();
      } else {
        const isValid = await verifyWmsToken(wmsRecord.token_value);
        if (!isValid) {
          log.info('WMS Session 已失效，重新登录...');
          await performWmsLoginAndSave();
        }
      }
    }
  } catch (error) {
    log.error('WMS Token 检查失败:', error);
  }

  // 3. 检查 B2B Token（依赖 ERP Token，必须在 ERP 确认有效后才处理）
  if (!erpTokenAvailable) {
    log.info('ERP Token 不可用，跳过 B2B Token 检查');
  } else {
    try {
      const b2bRecord = await tokenRepo.getTokenRecord('b2b');
      if (!b2bRecord || !b2bRecord.token_value) {
        log.info('B2B Token 不存在，尝试兑换...');
        await performB2bExchangeAndSave();
      } else {
        const updatedAt = b2bRecord.updated_at ? new Date(b2bRecord.updated_at).getTime() : 0;
        const ageMs = Date.now() - updatedAt;
        if (ageMs > 60 * 60 * 1000) {
          log.info('B2B Token 已超过1小时，重新兑换...');
          await performB2bExchangeAndSave();
        } else {
          const isValid = await verifyB2bToken(b2bRecord.token_value);
          if (!isValid) {
            log.info('B2B Token 已失效，重新兑换...');
            await performB2bExchangeAndSave();
          }
        }
      }
    } catch (error) {
      log.error('B2B Token 检查失败:', error);
    }
  }

  log.info('Token 检查完成');
}
