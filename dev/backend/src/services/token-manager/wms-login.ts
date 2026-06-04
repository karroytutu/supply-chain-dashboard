/**
 * WMS 系统登录服务
 * HTTP + RSA 加密密码登录，支持短信验证码两阶段
 * @module services/token-manager/wms-login
 */
import { createLogger } from '../../utils/logger';
const log = createLogger('TokenManager');

import crypto from 'crypto';
import axios, { AxiosInstance } from 'axios';
import { config } from '../../config';
import * as tokenRepo from './token-repository';
import type { WmsLoginResult } from './token-types';
import { getErrorMessage } from '../../utils/errorUtils';

const tmConfig = (config as any).tokenManager;

/** WMS 登录 HTTP 会话（手动管理 cookies，因为 axios 不自动处理） */
let _session: AxiosInstance | null = null;
/** Cookie 坛子，手动维护跨请求 Cookie */
let _cookieJar: Record<string, string> = {};
/** WMS 登录流程中保存的 devicetoken，供 SMS 二次提交使用 */
let _pendingDeviceToken: string | null = null;

/** WMS 登录互斥锁，防止并发执行破坏 Cookie 状态 */
let _wmsLoginInProgress = false;

/** 从响应头提取并合并 Cookie */
function mergeCookies(headers: any): void {
  const setCookie = headers?.['set-cookie'];
  if (!setCookie || !Array.isArray(setCookie)) return;
  for (const raw of setCookie) {
    const match = raw.match(/^([^=]+)=([^;]*)/);
    if (match) {
      _cookieJar[match[1].trim()] = match[2].trim();
    }
  }
}

/** 将 Cookie 坛子转为字符串 */
function cookieString(): string {
  return Object.entries(_cookieJar)
    .map(([k, v]) => `${k}=${v}`)
    .join('; ');
}

function getSession(): AxiosInstance {
  if (!_session) {
    _session = axios.create({
      timeout: 30000,
      headers: {
        Accept: '*/*',
        'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
        Connection: 'keep-alive',
        'User-Agent':
          'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Safari/537.36 Edg/142.0.0.0',
        'X-Requested-With': 'XMLHttpRequest',
      },
    });

    // 请求拦截器：自动注入 Cookie
    _session.interceptors.request.use(config => {
      const cookies = cookieString();
      if (cookies) {
        config.headers['Cookie'] = cookies;
      }
      return config;
    });

    // 响应拦截器：自动提取 Set-Cookie
    _session.interceptors.response.use(response => {
      mergeCookies(response.headers);
      return response;
    });
  }
  return _session;
}

function getSsoBaseUrl(): string {
  return tmConfig?.wmsSsoBaseUrl || 'https://sso.zhoupudata.com';
}

function getWmsBaseUrl(): string {
  return 'https://wms.zhoupudata.com';
}

// ==================== RSA 加密 ====================

/**
 * 获取 RSA 公钥
 */
async function getPublicKey(): Promise<string> {
  const session = getSession();
  const ssoBaseUrl = getSsoBaseUrl();

  const response = await session.get(`${ssoBaseUrl}/getPublicKey`, {
    headers: {
      Referer: `${ssoBaseUrl}/login?redirect_url=http://wms.zhoupudata.com/wms`,
      'Sec-Fetch-Dest': 'empty',
      'Sec-Fetch-Mode': 'cors',
      'Sec-Fetch-Site': 'same-origin',
    },
  });

  const data = response.data;
  log.info('getPublicKey 响应:', JSON.stringify(data).substring(0, 200));

  if (!data?.success) {
    throw new Error(`获取公钥失败: ${data?.info || data?.msg || '未知错误'}`);
  }

  const publicKey = data.info;
  if (!publicKey || typeof publicKey !== 'string') {
    throw new Error('获取公钥失败: 响应中缺少公钥数据');
  }

  return publicKey;
}

/**
 * RSA PKCS1_v1_5 加密密码
 * 使用 Node.js 内置 crypto 模块，兼容 Python pycryptodome 的 PKCS1_v1_5
 */
function rsaEncrypt(publicKeyBase64: string, password: string): string {
  // 构造 PEM 格式公钥
  const pem = `-----BEGIN PUBLIC KEY-----\n${publicKeyBase64}\n-----END PUBLIC KEY-----`;

  // 使用 RSA_PKCS1_PADDING 对应 Python 的 PKCS1_v1_5
  const encrypted = crypto.publicEncrypt(
    { key: pem, padding: crypto.constants.RSA_PKCS1_PADDING },
    Buffer.from(password, 'utf8')
  );

  return encrypted.toString('base64');
}

// ==================== 设备标识 ====================

/**
 * 生成固定的设备标识（基于用户名 MD5）
 * 使用固定 devicetoken 最大化设备信任概率，减少 SMS 触发
 */
function generateDeviceToken(username: string): string {
  return crypto.createHash('md5').update(`wms_device_${username}`).digest('hex');
}

// ==================== 短信验证码 ====================

/**
 * 发送短信验证码
 */
async function sendSmsCode(username: string, deviceToken: string): Promise<boolean> {
  const session = getSession();
  const ssoBaseUrl = getSsoBaseUrl();

  try {
    const response = await session.post(
      `${ssoBaseUrl}/sendPhonecode`,
      `username=${encodeURIComponent(username)}&devicetoken=${encodeURIComponent(deviceToken)}`,
      {
        headers: {
          Accept: 'application/json, text/javascript, */*; q=0.01',
          'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
          Origin: ssoBaseUrl,
          Referer: `${ssoBaseUrl}/login?redirect_url=http://wms.zhoupudata.com/wms`,
        },
      }
    );

    return response.data?.success || false;
  } catch (error) {
    log.error('发送短信验证码失败:', error);
    return false;
  }
}

// ==================== 核心登录流程 ====================

/**
 * 执行 WMS 登录
 * @param smsCode 短信验证码（可选，首次登录不传）
 */
export async function performWmsLogin(smsCode?: string): Promise<WmsLoginResult> {
  // 互斥检查：防止并发登录破坏 Cookie 状态
  if (_wmsLoginInProgress) {
    return { success: false, needsSms: false, error: 'WMS 登录任务进行中，请稍后重试' };
  }
  _wmsLoginInProgress = true;

  const username = tmConfig?.wmsUsername || '';
  const password = tmConfig?.wmsPassword || '';

  if (!username || !password) {
    _wmsLoginInProgress = false;
    return { success: false, needsSms: false, error: 'WMS 登录凭据未配置' };
  }

  const session = getSession();
  const ssoBaseUrl = getSsoBaseUrl();

  // 清空 Cookie 坛子，重新开始登录流程
  _cookieJar = {};

  try {
    // 1. 访问登录页获取初始 Cookie
    await session.get(`${ssoBaseUrl}/login?redirect_url=http://wms.zhoupudata.com/wms`);

    // 2. 获取公钥并加密密码
    const publicKey = await getPublicKey();
    const encryptedPassword = rsaEncrypt(publicKey, password);

    // 3. 获取或使用已有的 devicetoken
    let deviceToken = _pendingDeviceToken;
    if (!deviceToken) {
      // 尝试从数据库读取之前保存的
      const savedDeviceToken = await tokenRepo.getWmsDeviceToken();
      deviceToken = savedDeviceToken || generateDeviceToken(username);
    }

    // 4. 发送登录请求
    const loginData = new URLSearchParams({
      redirect_url: 'http://wms.zhoupudata.com/wms',
      tologinneedPicCode: 'false',
      devicetoken: deviceToken,
      username,
      password: encryptedPassword,
      verifycode: '',
      smscode: smsCode || '',
      'remember-me': 'on',
    });

    const response = await session.post(`${ssoBaseUrl}/dologin`, loginData.toString(), {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
        Origin: ssoBaseUrl,
        Referer: `${ssoBaseUrl}/login?redirect_url=http://wms.zhoupudata.com/wms`,
      },
    });

    const result = response.data;

    if (result?.success) {
      // 登录成功，从 Cookie 坛子提取 WMSJSESSIONID（拦截器已自动合并）
      let wmsSessionId =
        _cookieJar['WMSJSESSIONID'] || extractCookie(response.headers, 'WMSJSESSIONID');

      if (!wmsSessionId) {
        // 尝试访问重定向 URL 获取 Cookie
        const redirectUrl = result.info || 'http://wms.zhoupudata.com/wms';
        const redirectResp = await session.get(redirectUrl, {
          maxRedirects: 5,
        });
        wmsSessionId = extractCookie(redirectResp.headers, 'WMSJSESSIONID');
      }

      if (!wmsSessionId) {
        return { success: false, needsSms: false, error: '登录成功但未获取到 WMSJSESSIONID' };
      }

      // 清除待处理状态
      _pendingDeviceToken = null;

      return { success: true, needsSms: false, sessionId: wmsSessionId, deviceToken };
    }

    // 检查是否需要短信验证码
    const infos = result?.infos || {};
    if (infos.showSmsCode) {
      // 保存 devicetoken 供 SMS 二次提交
      _pendingDeviceToken = deviceToken;

      // 发送短信验证码
      await sendSmsCode(username, deviceToken);

      return {
        success: false,
        needsSms: true,
        error: infos.msg || '需要短信验证码',
      };
    }

    // 其他登录失败
    const errorMsg = result?.info || infos?.msg || '登录失败';
    return { success: false, needsSms: false, error: errorMsg };
  } catch (error) {
    const errorMsg = error instanceof Error ? getErrorMessage(error) : String(error);
    return { success: false, needsSms: false, error: `登录异常: ${errorMsg}` };
  } finally {
    _wmsLoginInProgress = false;
  }
}

/**
 * 执行 WMS 登录并保存到数据库
 */
export async function performWmsLoginAndSave(
  smsCode?: string,
  operatorId?: number
): Promise<boolean> {
  const startTime = Date.now();

  try {
    const result = await performWmsLogin(smsCode);

    if (result.success && result.sessionId) {
      // 保存到数据库
      await tokenRepo.saveToken({
        system: 'wms',
        tokenValue: result.sessionId,
        tokenSecondary: result.deviceToken || null,
        loginStatus: 'success',
        needsSms: false,
      });

      const durationMs = Date.now() - startTime;
      log.info(`登录成功 (耗时 ${durationMs}ms)`);

      await tokenRepo.logOperation({
        system: 'wms',
        operation: 'login',
        status: 'success',
        operatorId,
        durationMs,
      });

      return true;
    }

    if (result.needsSms) {
      // 标记需要短信验证码
      await tokenRepo.updateLoginStatus('wms', 'pending_sms', true);

      await tokenRepo.logOperation({
        system: 'wms',
        operation: 'login',
        status: 'pending',
        operatorId,
        durationMs: Date.now() - startTime,
        detail: { message: result.error },
      });

      log.info('需要短信验证码，已发送验证码');
      return false;
    }

    // 登录失败
    await tokenRepo.updateLoginStatus('wms', 'failed');
    await tokenRepo.logOperation({
      system: 'wms',
      operation: 'login',
      status: 'failed',
      operatorId,
      durationMs: Date.now() - startTime,
      detail: { error: result.error },
    });

    log.error(`登录失败: ${result.error}`);
    return false;
  } catch (error) {
    const errorMsg = error instanceof Error ? getErrorMessage(error) : String(error);
    log.error(`登录过程出错: ${errorMsg}`);

    await tokenRepo.updateLoginStatus('wms', 'failed');
    await tokenRepo.logOperation({
      system: 'wms',
      operation: 'login',
      status: 'failed',
      operatorId,
      durationMs: Date.now() - startTime,
      detail: { error: errorMsg },
    });

    return false;
  }
}

// ==================== Token 验证 ====================

/**
 * 验证 WMS Session 有效性
 * 通过实际 API 请求检测 WMSJSESSIONID 是否仍可用
 */
export async function verifyWmsToken(sessionId: string): Promise<boolean> {
  try {
    const wmsUrl = getWmsBaseUrl();

    const response = await axios.get(`${wmsUrl}/wms/stockin/backbill/commonQueryListData`, {
      params: { page: '1', rows: '5' },
      headers: {
        Accept: 'application/json, text/javascript, */*; q=0.01',
        Cookie: `WMSJSESSIONID=${sessionId}`,
        Referer: `${wmsUrl}/wms/stockin/backbill/commonQueryList`,
        'X-Requested-With': 'XMLHttpRequest',
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
      },
      timeout: 10000,
      maxRedirects: 0,
      validateStatus: s => s < 400 || s === 302, // 接受 200 和 302
    });

    // 302 重定向通常意味着 Session 已失效（跳转到登录页）
    if (response.status === 302) {
      const location = response.headers?.['location'] || '';
      if (location.toLowerCase().includes('login') || location.toLowerCase().includes('sso')) {
        log.info('Token 验证: 302 重定向到登录页，Session 已失效');
        return false;
      }
    }

    if (response.status === 200) {
      const data = response.data;

      // 检查是否返回了登录页 HTML（而非 API JSON 数据）
      if (typeof data === 'string') {
        const lower = data.toLowerCase();
        if (
          lower.includes('<html') &&
          (lower.includes('login') || lower.includes('sso.zhoupudata'))
        ) {
          log.info('Token 验证: 返回登录页 HTML，Session 已失效');
          return false;
        }
        // 非 HTML 响应（可能是有效数据）
        return true;
      }

      // JSON 响应 — 检查是否是业务数据
      if (typeof data === 'object' && data !== null) {
        // WMS API 返回 { rows: [...], total: N } 格式的数据视为有效
        if ('rows' in data || 'total' in data || Array.isArray(data)) {
          return true;
        }
        // 检查是否包含错误信息
        const jsonStr = JSON.stringify(data).toLowerCase();
        if (jsonStr.includes('unauthorized') || jsonStr.includes('session expired')) {
          return false;
        }
        return true;
      }
    }

    if (response.status === 401 || response.status === 403) {
      return false;
    }

    // 其他状态码，假设 Session 仍然有效（可能是服务器临时问题）
    return true;
  } catch (error: any) {
    // 网络错误或超时，不能确定 Session 是否有效
    log.error('Token 验证请求失败:', error?.message || error);
    return false;
  }
}

// ==================== 辅助函数 ====================

/**
 * 从响应头中提取指定 Cookie 值
 */
function extractCookie(headers: any, name: string): string | null {
  const setCookie = headers?.['set-cookie'];
  if (!setCookie || !Array.isArray(setCookie)) return null;

  for (const cookie of setCookie) {
    const match = cookie.match(new RegExp(`${name}=([^;]+)`));
    if (match) return match[1];
  }
  return null;
}
