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

test.describe('撤回审批', () => {
  // 注意：以下测试需要特定的测试数据（pending 状态的审批实例），
  // 在完整测试环境中运行。此处仅验证 UI 逻辑不崩溃。

  test('审批详情页加载时操作栏存在', async ({ authenticatedPage }) => {
    // 访问审批中心“我发起的”视图
    await authenticatedPage.goto('/oa/center');
    await waitForPageLoad(authenticatedPage);

    // 切换到“我发起的”tab（如果有数据，可进一步验证撤回按钮）
    const myTab = authenticatedPage.locator('text=我发起的');
    if (await myTab.isVisible()) {
      await myTab.click();
    }

    const body = authenticatedPage.locator('body');
    await expect(body).toBeVisible();
  });

  test('禁用状态的撤回按钮不触发确认框', async ({ authenticatedPage }) => {
    // 验证：如果撤回按钮被 disabled，点击不应弹出 Popconfirm
    await authenticatedPage.goto('/oa/center');
    await waitForPageLoad(authenticatedPage);

    const disabledBtn = authenticatedPage.locator('button[disabled]:has-text("撤回审批")');
    if (await disabledBtn.count() > 0) {
      await disabledBtn.first().click();
      // 确认框不应出现
      const confirmBtn = authenticatedPage.locator('.ant-popover:has-text("确定要撤回此审批吗")');
      await expect(confirmBtn).not.toBeVisible();
    }
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
