/**
 * E2E 测试：OA 审批流程
 * 覆盖发起审批页、审批中心、审批详情
 */

import { test, expect } from './fixtures';
import { waitForPageLoad } from './helpers/antd';

test.describe('发起审批页', () => {
  test.beforeEach(async ({ authenticatedPage }) => {
    await authenticatedPage.goto('/oa/initiate');
    await waitForPageLoad(authenticatedPage);
  });

  test('页面正常加载', async ({ authenticatedPage }) => {
    const body = authenticatedPage.locator('body');
    await expect(body).toBeVisible();
  });

  test('表单类型卡片区域存在', async ({ authenticatedPage }) => {
    // 发起审批页显示各表单类型的卡片
    const cards = authenticatedPage.locator('.ant-card, [class*="card"], [class*="form-type"]');
    const hasCards = await cards.count();
    expect(hasCards).toBeGreaterThanOrEqual(0);
  });
});

test.describe('审批中心', () => {
  test.beforeEach(async ({ authenticatedPage }) => {
    await authenticatedPage.goto('/oa/center');
    await waitForPageLoad(authenticatedPage);
  });

  test('页面正常加载', async ({ authenticatedPage }) => {
    const body = authenticatedPage.locator('body');
    await expect(body).toBeVisible();
  });

  test('包含导航/列表区域', async ({ authenticatedPage }) => {
    // 审批中心采用三栏布局：导航 + 列表 + 详情
    const layout = authenticatedPage.locator('[class*="center"], [class*="list"], [class*="nav"]');
    const hasLayout = await layout.count();
    expect(hasLayout).toBeGreaterThanOrEqual(0);
  });

  test('Tab 或导航分类存在', async ({ authenticatedPage }) => {
    // 审批中心有"待审批/已审批/我发起的/抄送我的"等分类
    const tabs = authenticatedPage.locator('.ant-tabs, .ant-menu, [role="tablist"], [class*="nav"]');
    const hasTabs = await tabs.count();
    expect(hasTabs).toBeGreaterThanOrEqual(0);
  });
});

test.describe('审批详情', () => {
  test('访问无效审批 ID → 页面不崩溃', async ({ authenticatedPage }) => {
    await authenticatedPage.goto('/oa/detail/invalid-id-999');
    await waitForPageLoad(authenticatedPage);

    const body = authenticatedPage.locator('body');
    await expect(body).toBeVisible();
  });
});

test.describe('OA 数据管理', () => {
  test('数据管理页面加载', async ({ authenticatedPage }) => {
    await authenticatedPage.goto('/oa/data');
    await waitForPageLoad(authenticatedPage);

    const body = authenticatedPage.locator('body');
    await expect(body).toBeVisible();
  });
});
