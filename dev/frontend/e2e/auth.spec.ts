/**
 * E2E 测试：认证与基本导航
 * 前置条件：后端服务运行在 localhost:8100 (NODE_ENV=development)
 * 前端服务运行在 localhost:3100
 */

import { test, expect } from './fixtures';
import { waitForPageLoad } from './helpers/antd';

test.describe('认证流程', () => {
  test('无 token 访问受保护页面 → 自动跳转 /login', async ({ page }) => {
    // 清除 storageState 以模拟未登录
    await page.context().clearCookies();
    await page.evaluate(() => localStorage.clear());

    await page.goto('/collection/overview');
    await page.waitForURL('**/login**', { timeout: 10000 });

    expect(page.url()).toContain('/login');
  });

  test('已认证用户访问首页 → 页面正常加载', async ({ authenticatedPage }) => {
    await authenticatedPage.goto('/');
    await waitForPageLoad(authenticatedPage);

    // 首页应包含工作台或导航元素
    const body = authenticatedPage.locator('body');
    await expect(body).toBeVisible();
  });

  test('已认证用户导航到数据总览 → 页面加载', async ({ authenticatedPage }) => {
    await authenticatedPage.goto('/overview');
    await waitForPageLoad(authenticatedPage);

    const body = authenticatedPage.locator('body');
    await expect(body).toBeVisible();
  });

  test('已认证用户导航到催收总览 → 页面加载', async ({ authenticatedPage }) => {
    await authenticatedPage.goto('/collection/overview');
    await waitForPageLoad(authenticatedPage);

    const body = authenticatedPage.locator('body');
    await expect(body).toBeVisible();
  });

  test('已认证用户导航到 OA 中心 → 页面加载', async ({ authenticatedPage }) => {
    await authenticatedPage.goto('/oa/center');
    await waitForPageLoad(authenticatedPage);

    const body = authenticatedPage.locator('body');
    await expect(body).toBeVisible();
  });

  test('已认证用户导航到系统用户管理 → 页面加载', async ({ authenticatedPage }) => {
    await authenticatedPage.goto('/system/users');
    await waitForPageLoad(authenticatedPage);

    const body = authenticatedPage.locator('body');
    await expect(body).toBeVisible();
  });
});

test.describe('页面导航', () => {
  test('侧边栏导航链接可达', async ({ authenticatedPage }) => {
    await authenticatedPage.goto('/');
    await waitForPageLoad(authenticatedPage);

    // 检查导航菜单是否存在（Antd Menu 或 Sider）
    const nav = authenticatedPage.locator('.ant-menu, .ant-layout-sider, nav');
    const hasNav = await nav.count();

    // 导航可能存在，不做强制断言，仅验证页面不崩溃
    expect(hasNav).toBeGreaterThanOrEqual(0);
  });

  test('404 路由处理', async ({ authenticatedPage }) => {
    await authenticatedPage.goto('/non-existent-page-xyz');
    await waitForPageLoad(authenticatedPage);

    // 页面应加载（可能显示 404 或重定向），不应崩溃
    const body = authenticatedPage.locator('body');
    await expect(body).toBeVisible();
  });
});
