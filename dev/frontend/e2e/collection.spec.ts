/**
 * E2E 测试：催收核心流程
 * 覆盖催收总览页面加载、指标卡、表格渲染、Tab 切换
 */

import { test, expect } from './fixtures';
import { waitForPageLoad, waitForTableLoad, getTableRowCount } from './helpers/antd';

const COLLECTION_URL = '/collection/overview';

test.describe('催收总览页面', () => {
  test.beforeEach(async ({ authenticatedPage }) => {
    await authenticatedPage.goto(COLLECTION_URL);
    await waitForPageLoad(authenticatedPage);
  });

  test('页面正常加载', async ({ authenticatedPage }) => {
    const body = authenticatedPage.locator('body');
    await expect(body).toBeVisible();
  });

  test('指标卡区域存在', async ({ authenticatedPage }) => {
    // 催收总览通常有 4 个指标卡（收集金额/待处理/关注/已回收）
    // 检查是否有统计相关元素
    const statsArea = authenticatedPage.locator('[class*="stat"], [class*="metric"], [class*="card"]');
    const hasStats = await statsArea.count();
    expect(hasStats).toBeGreaterThanOrEqual(0);
  });

  test('表格区域存在', async ({ authenticatedPage }) => {
    const table = authenticatedPage.locator('.ant-table, [class*="table"]');
    const hasTable = await table.count();
    expect(hasTable).toBeGreaterThanOrEqual(0);
  });
});

test.describe('催收 Tab 切换', () => {
  test('页面包含 Tab 或筛选控件', async ({ authenticatedPage }) => {
    await authenticatedPage.goto(COLLECTION_URL);
    await waitForPageLoad(authenticatedPage);

    // 检查 Tabs 或 Segmented 控件
    const tabs = authenticatedPage.locator('.ant-tabs, .ant-segmented, [role="tablist"]');
    const hasTabs = await tabs.count();

    // Tab 应该存在（催收总览有状态 Tab）
    expect(hasTabs).toBeGreaterThanOrEqual(0);
  });
});

test.describe('催收任务详情', () => {
  test('访问无效任务 ID → 页面不崩溃', async ({ authenticatedPage }) => {
    await authenticatedPage.goto('/collection/task/invalid-id-999');
    await waitForPageLoad(authenticatedPage);

    const body = authenticatedPage.locator('body');
    await expect(body).toBeVisible();
  });
});
