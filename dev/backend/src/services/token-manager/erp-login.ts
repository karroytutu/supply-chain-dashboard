/**
 * ERP Playwright 浏览器自动登录服务
 * 从 zhouputoken/erp_login.py 移植
 * @module services/token-manager/erp-login
 */

import { chromium, Browser, BrowserContext, Page } from 'playwright';
import { config } from '../../config';
import * as tokenRepo from './token-repository';
import type { ErpLoginResult } from './token-types';

const tmConfig = (config as any).tokenManager;

/** 反检测脚本 */
const ANTI_DETECTION_SCRIPT = `
  Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
  Object.defineProperty(navigator, 'plugins', { get: () => [1, 2, 3, 4, 5] });
  Object.defineProperty(navigator, 'languages', { get: () => ['zh-CN', 'zh', 'en'] });
`;

/** 登录页配置 */
const LOGIN_CONFIG = {
  loginUrl: 'https://portal.zhoupudata.com/saas/tologin',
  successUrl: 'https://portal.zhoupudata.com/saas/main',
  selectors: {
    agreementButton: 'span.l-btn-text:has-text("同意并继续")',
    usernameInput: 'input[name="username"]',
    passwordInput: 'input[name="password"]',
    loginButton: 'input[type="button"][id="login"]',
    sliderContainer: '.nc_wrapper, #aliyunCaptcha-sliding-slider',
    sliderButtons: [
      '.nc_iconfont.btn_slide',
      '.slider-move',
      '#aliyunCaptcha-sliding-slider',
    ],
    successIndicators: [
      '.nc_iconfont.nc_iconfont_success',
      '.nc_wrapper.nc_ok',
    ],
  },
  maxSliderAttempts: 5,
  defaultSlideDistance: 330,
  loginTimeout: 120000, // 120 秒总超时
};

// ==================== 浏览器管理 ====================

let _browser: Browser | null = null;
let _context: BrowserContext | null = null;
let _page: Page | null = null;

/** ERP 登录互斥锁，防止并发执行 */
let _erpLoginInProgress = false;

/**
 * 启动浏览器
 */
async function startBrowser(): Promise<boolean> {
  try {
    // 确保之前的浏览器已关闭
    await closeBrowser();

    console.log('[ERP-Login] 启动 Chromium 浏览器...');

    _browser = await chromium.launch({
      headless: true,
      // 使用系统安装的 Chromium（apt 安装，比 Playwright 内置下载更快更稳定）
      channel: 'chromium',
      args: [
        '--disable-blink-features=AutomationControlled',
        '--disable-dev-shm-usage',
        '--no-sandbox',
        '--disable-gpu',
      ],
      timeout: 60000,
    });

    _context = await _browser.newContext({
      viewport: { width: 1280, height: 720 },
      userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      locale: 'zh-CN',
      timezoneId: 'Asia/Shanghai',
    });

    _page = await _context.newPage();
    await _page.addInitScript(ANTI_DETECTION_SCRIPT);

    console.log('[ERP-Login] 浏览器启动成功');
    return true;
  } catch (error) {
    console.error('[ERP-Login] 浏览器启动失败:', error);
    await closeBrowser();
    return false;
  }
}

/**
 * 关闭浏览器（确保资源释放）
 */
async function closeBrowser(): Promise<void> {
  try {
    if (_page) await _page.close().catch(() => {});
    if (_context) await _context.close().catch(() => {});
    if (_browser) await _browser.close().catch(() => {});
  } finally {
    _page = null;
    _context = null;
    _browser = null;
  }
}

// ==================== 登录流程步骤 ====================

/**
 * 导航到登录页
 */
async function navigateToLoginPage(): Promise<boolean> {
  if (!_page) return false;
  try {
    // 使用 'commit' 而非 'domcontentloaded'，避免页面重定向导致 ERR_ABORTED
    await _page.goto(LOGIN_CONFIG.loginUrl, { waitUntil: 'commit', timeout: 15000 });
  } catch (error: any) {
    // net::ERR_ABORTED 通常是因为页面重定向，不一定代表失败
    if (!error?.message?.includes('ERR_ABORTED')) {
      console.error('[ERP-Login] 导航到登录页失败:', error);
      return false;
    }
    console.log('[ERP-Login] 导航遇到 ERR_ABORTED（页面重定向），继续等待元素...');
  }

  try {
    // 等待用户名输入框出现（说明登录页已加载）
    await _page.waitForSelector(LOGIN_CONFIG.selectors.usernameInput, { timeout: 15000 });
    await randomDelay(500, 1000);
    return true;
  } catch (error) {
    console.error('[ERP-Login] 等待登录页元素失败:', error);
    return false;
  }
}

/**
 * 处理同意协议弹窗
 */
async function handleAgreementPopup(): Promise<boolean> {
  if (!_page) return false;
  try {
    const btn = await _page.waitForSelector(LOGIN_CONFIG.selectors.agreementButton, { timeout: 10000 });
    if (btn) {
      await randomDelay(500, 1500);
      await btn.click();
      await randomDelay(1000, 2000);
    }
    return true;
  } catch {
    // 弹窗可能不出现，视为成功
    return true;
  }
}

/**
 * 填写登录凭据
 */
async function fillCredentials(): Promise<boolean> {
  if (!_page) return false;

  const username = tmConfig?.erpUsername || '';
  const password = tmConfig?.erpPassword || '';

  if (!username || !password) {
    console.error('[ERP-Login] ERP 登录凭据未配置');
    return false;
  }

  try {
    const usernameInput = await _page.waitForSelector(LOGIN_CONFIG.selectors.usernameInput, { timeout: 10000 });
    await usernameInput.fill('');
    await randomDelay(300, 800);
    await typeLikeHuman(usernameInput, username);

    const passwordInput = await _page.waitForSelector(LOGIN_CONFIG.selectors.passwordInput, { timeout: 10000 });
    await passwordInput.fill('');
    await randomDelay(300, 800);
    await typeLikeHuman(passwordInput, password);

    return true;
  } catch (error) {
    console.error('[ERP-Login] 填写凭据失败:', error);
    return false;
  }
}

/**
 * 点击登录按钮
 */
async function clickLoginButton(): Promise<boolean> {
  if (!_page) return false;
  try {
    const loginBtn = await _page.waitForSelector(LOGIN_CONFIG.selectors.loginButton, { timeout: 10000 });
    await randomDelay(500, 1500);
    await loginBtn.click();
    await randomDelay(1000, 2000);
    return true;
  } catch (error) {
    console.error('[ERP-Login] 点击登录按钮失败:', error);
    return false;
  }
}

// ==================== 滑块验证 ====================

/**
 * 处理滑块验证
 */
async function handleSliderVerification(): Promise<boolean> {
  if (!_page) return false;

  try {
    // 检测是否出现滑块
    let sliderContainer = await _page.$(LOGIN_CONFIG.selectors.sliderContainer);
    if (!sliderContainer) {
      console.log('[ERP-Login] 未检测到滑块验证');
      return true;
    }

    console.log('[ERP-Login] 检测到滑块验证');

    for (let attempt = 0; attempt < LOGIN_CONFIG.maxSliderAttempts; attempt++) {
      console.log(`[ERP-Login] 滑块验证尝试 ${attempt + 1}/${LOGIN_CONFIG.maxSliderAttempts}`);

      // 尝试多个滑块按钮选择器
      let sliderButton = null;
      for (const selector of LOGIN_CONFIG.selectors.sliderButtons) {
        sliderButton = await _page.$(selector);
        if (sliderButton) break;
      }

      if (!sliderButton) {
        // 在容器内查找
        sliderButton = await sliderContainer.$('span, div, button');
      }

      if (!sliderButton) {
        console.log('[ERP-Login] 未找到滑块按钮');
        await sleep(2000);
        continue;
      }

      const buttonBox = await sliderButton.boundingBox();
      if (!buttonBox) continue;

      // 计算滑动距离
      let slideDistance = LOGIN_CONFIG.defaultSlideDistance;
      try {
        const containerBox = await sliderContainer.boundingBox();
        if (containerBox && containerBox.width > buttonBox.width + 50) {
          slideDistance = containerBox.width - buttonBox.width - 5;
        }
      } catch { /* use default */ }

      const startX = buttonBox.x + buttonBox.width / 2;
      const startY = buttonBox.y + buttonBox.height / 2;
      const endX = startX + slideDistance;

      await randomDelay(500, 1500);

      // 执行模拟拖动
      await _page.mouse.move(startX, startY);
      await sleep(randomInt(100, 300));
      await _page.mouse.down();
      await sleep(randomInt(100, 200));
      await simulateHumanDrag(startX, startY, endX, startY);
      await _page.mouse.up();

      // 等待验证结果
      await randomDelay(1500, 2500);

      // 检查是否成功
      const success = await checkVerificationSuccess();
      if (success) {
        console.log('[ERP-Login] 滑块验证成功');
        return true;
      }

      // 尝试点击刷新
      try {
        const refreshBtn = await _page.$('.nc_refresh, .errloading');
        if (refreshBtn) await refreshBtn.click();
      } catch { /* ignore */ }

      await sleep(2000);
    }

    console.error('[ERP-Login] 滑块验证多次尝试后失败');
    return false;
  } catch (error) {
    console.error('[ERP-Login] 滑块验证处理出错:', error);
    return false;
  }
}

/**
 * 检查滑块验证是否成功
 */
async function checkVerificationSuccess(): Promise<boolean> {
  if (!_page) return false;

  // 检查页面是否跳转
  const currentUrl = _page.url();
  if (currentUrl !== LOGIN_CONFIG.loginUrl) {
    const successKeywords = ['main', 'index', 'dashboard', 'home', 'portal'];
    if (successKeywords.some(k => currentUrl.toLowerCase().includes(k))) {
      return true;
    }
  }

  // 检查成功指示器
  for (const selector of LOGIN_CONFIG.selectors.successIndicators) {
    try {
      const el = await _page.$(selector);
      if (el) return true;
    } catch { /* continue */ }
  }

  return false;
}

/**
 * 模拟人工拖动轨迹（贝塞尔曲线）
 */
async function simulateHumanDrag(
  startX: number, startY: number,
  endX: number, endY: number
): Promise<void> {
  if (!_page) return;

  const totalDistance = endX - startX;
  const steps = Math.max(30, Math.floor(totalDistance / 8));

  // 贝塞尔曲线控制点
  const ctrl1X = startX + totalDistance * 0.25 + randomFloat(-20, 20);
  const ctrl1Y = startY + randomFloat(-15, 15);
  const ctrl2X = startX + totalDistance * 0.75 + randomFloat(-20, 20);
  const ctrl2Y = startY + randomFloat(-15, 15);

  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const x = cubicBezier(t, startX, ctrl1X, ctrl2X, endX) + randomFloat(-1, 1);
    const y = cubicBezier(t, startY, ctrl1Y, ctrl2Y, endY) + randomFloat(-1, 1);

    await _page.mouse.move(x, y);

    // 变速：开始慢，中间快，结束慢
    let delay: number;
    if (t < 0.2) delay = randomFloat(20, 50);
    else if (t > 0.8) delay = randomFloat(20, 40);
    else delay = randomFloat(10, 20);

    await sleep(delay);
  }
}

/** 三次贝塞尔曲线 */
function cubicBezier(t: number, p0: number, p1: number, p2: number, p3: number): number {
  return (1 - t) ** 3 * p0 + 3 * (1 - t) ** 2 * t * p1 + 3 * (1 - t) * t ** 2 * p2 + t ** 3 * p3;
}

// ==================== Cookie 提取 ====================

/**
 * 等待并提取认证凭据
 */
async function waitForAndExtractCredentials(): Promise<ErpLoginResult | null> {
  if (!_page || !_context) return null;

  for (let attempt = 0; attempt < 10; attempt++) {
    const credentials = await extractCredentials();
    if (credentials?.authorization) {
      return credentials;
    }

    // 检查页面是否已跳转
    const currentUrl = _page.url();
    if (['index', 'dashboard', 'main', 'home'].some(k => currentUrl.toLowerCase().includes(k))) {
      await sleep(1000);
      const retryCreds = await extractCredentials();
      if (retryCreds?.authorization) return retryCreds;
    }

    await sleep(1000);
  }

  return null;
}

/**
 * 从浏览器 Cookie 中提取认证凭据
 */
async function extractCredentials(): Promise<ErpLoginResult | null> {
  if (!_context) return null;

  try {
    const cookies = await _context.cookies();
    let authorization: string | undefined;
    let sessionId: string | undefined;

    for (const cookie of cookies) {
      if (cookie.name === 'authorization') authorization = cookie.value;
      if (['JSESSIONID', 'PHPSESSID', 'SESSIONID', 'SESSION'].includes(cookie.name)) {
        sessionId = cookie.value;
      }
    }

    if (authorization) {
      return { success: true, authorization, sessionId };
    }
    return null;
  } catch (error) {
    console.error('[ERP-Login] 提取凭据失败:', error);
    return null;
  }
}

// ==================== 主入口 ====================

/**
 * 执行 ERP 登录并保存到数据库
 */
export async function performErpLoginAndSave(operatorId?: number): Promise<boolean> {
  // 互斥检查
  if (_erpLoginInProgress) {
    console.log('[ERP-Login] 已有登录任务进行中，跳过');
    return false;
  }
  _erpLoginInProgress = true;
  const startTime = Date.now();
  let loginResult: ErpLoginResult | null = null;

  try {
    console.log('[ERP-Login] 开始 ERP 登录流程...');

    // 1. 启动浏览器
    if (!await startBrowser()) {
      throw new Error('浏览器启动失败');
    }

    // 2. 导航到登录页
    if (!await navigateToLoginPage()) {
      throw new Error('导航到登录页失败');
    }

    // 3. 处理同意弹窗
    await handleAgreementPopup();

    // 4. 填写凭据
    if (!await fillCredentials()) {
      throw new Error('填写凭据失败');
    }

    // 5. 点击登录
    if (!await clickLoginButton()) {
      throw new Error('点击登录按钮失败');
    }

    // 6. 处理滑块验证
    await handleSliderVerification();

    // 7. 等待并提取凭据
    loginResult = await waitForAndExtractCredentials();

    if (!loginResult?.authorization) {
      throw new Error('未能获取到有效的 authorization token');
    }

    // 8. 保存到数据库
    await tokenRepo.saveToken({
      system: 'erp',
      tokenValue: loginResult.authorization,
      tokenSecondary: loginResult.sessionId || null,
      loginStatus: 'success',
    });

    const durationMs = Date.now() - startTime;
    console.log(`[ERP-Login] 登录成功 (耗时 ${durationMs}ms)`);

    await tokenRepo.logOperation({
      system: 'erp', operation: 'login', status: 'success',
      operatorId, durationMs,
    });

    return true;
  } catch (error) {
    const durationMs = Date.now() - startTime;
    const errorMsg = error instanceof Error ? error.message : String(error);
    console.error(`[ERP-Login] 登录失败: ${errorMsg}`);

    await tokenRepo.updateLoginStatus('erp', 'failed');
    await tokenRepo.logOperation({
      system: 'erp', operation: 'login', status: 'failed',
      operatorId, durationMs, detail: { error: errorMsg },
    });

    return false;
  } finally {
    // 确保浏览器始终关闭 + 释放锁
    await closeBrowser();
    _erpLoginInProgress = false;
  }
}

/**
 * 验证 ERP Token 有效性
 */
export async function verifyErpToken(authorization: string): Promise<boolean> {
  try {
    const axios = (await import('axios')).default;
    const authHeader = authorization.startsWith('Bearer ') ? authorization : `Bearer ${authorization}`;

    const response = await axios.post(
      'https://portal.zhoupudata.com/redcoast/store-query/search',
      { current: 1, size: 1, docState: 1, cid: '10008421', uid: '97' },
      {
        headers: {
          'Authorization': authHeader,
          'Content-Type': 'application/json',
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        },
        timeout: 10000,
      }
    );

    if (response.status === 200) {
      const text = response.data?.toString?.() || '';
      const invalidKeywords = ['登录', 'login', '验证码', '重新登录'];
      if (invalidKeywords.some(k => text.includes(k))) return false;
      return true;
    }

    if (response.status === 401) return false;
    return false;
  } catch (error) {
    console.error('[ERP-Login] Token 验证请求失败:', error);
    return false;
  }
}

// ==================== 辅助函数 ====================

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function randomDelay(minMs: number, maxMs: number): Promise<void> {
  return sleep(randomInt(minMs, maxMs));
}

function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function randomFloat(min: number, max: number): number {
  return Math.random() * (max - min) + min;
}

async function typeLikeHuman(element: any, text: string): Promise<void> {
  for (const char of text) {
    await element.type(char, { delay: randomInt(50, 150) });
  }
}
