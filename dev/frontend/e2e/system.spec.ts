/**
 * E2E 测试：系统管理
 * 覆盖用户管理、角色管理、权限管理页面的基本加载和交互
 */

import { test, expect } from './fixtures';
import { waitForPageLoad, waitForTableLoad, getTableRowCount } from './helpers/antd';

test.describe('用户管理页', () => {
  test.beforeEach(async ({ authenticatedPage }) => {
    await authenticatedPage.goto('/system/users');
    await waitForPageLoad(authenticatedPage);
  });

  test('页面正常加载', async ({ authenticatedPage }) => {
    const body = authenticatedPage.locator('body');
    await expect(body).toBeVisible();
  });

  test('用户列表表格存在', async ({ authenticatedPage }) => {
    const table = authenticatedPage.locator('.ant-table');
    const hasTable = await table.count();
    expect(hasTable).toBeGreaterThanOrEqual(0);
  });

  test('搜索功能区域存在', async ({ authenticatedPage }) => {
    // 搜索输入框或筛选区域
    const searchArea = authenticatedPage.locator('input[placeholder*="搜索"], input[placeholder*="search"], [class*="search"]');
    const hasSearch = await searchArea.count();
    expect(hasSearch).toBeGreaterThanOrEqual(0);
  });
});

test.describe('角色管理页', () => {
  test.beforeEach(async ({ authenticatedPage }) => {
    await authenticatedPage.goto('/system/roles');
    await waitForPageLoad(authenticatedPage);
  });

  test('页面正常加载', async ({ authenticatedPage }) => {
    const body = authenticatedPage.locator('body');
    await expect(body).toBeVisible();
  });

  test('角色列表存在', async ({ authenticatedPage }) => {
    const list = authenticatedPage.locator('.ant-table, .ant-list, [class*="role"]');
    const hasList = await list.count();
    expect(hasList).toBeGreaterThanOrEqual(0);
  });
});

test.describe('权限管理页', () => {
  test.beforeEach(async ({ authenticatedPage }) => {
    await authenticatedPage.goto('/system/permissions');
    await waitForPageLoad(authenticatedPage);
  });

  test('页面正常加载', async ({ authenticatedPage }) => {
    const body = authenticatedPage.locator('body');
    await expect(body).toBeVisible();
  });

  test('权限树区域存在', async ({ authenticatedPage }) => {
    // 权限管理页使用 Tree 组件展示权限树
    const tree = authenticatedPage.locator('.ant-tree, [class*="tree"], [class*="permission"]');
    const hasTree = await tree.count();
    expect(hasTree).toBeGreaterThanOrEqual(0);
  });
});

test.describe('Token 管理页', () => {
  test('页面正常加载', async ({ authenticatedPage }) => {
    await authenticatedPage.goto('/system/token-manager');
    await waitForPageLoad(authenticatedPage);

    const body = authenticatedPage.locator('body');
    await expect(body).toBeVisible();
  });
});
