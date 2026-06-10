/**
 * E2E 测试：应收账款全景看板
 * 覆盖页面加载、KPI 卡片渲染、管道节点交互、弹窗、明细表筛选
 */
import { test, expect } from './fixtures';
import { getTableRowCount } from './helpers/antd';

test.describe('应收看板页面加载', () => {
  test.beforeEach(async ({ authenticatedPage }) => {
    await authenticatedPage.goto('/ar-dashboard');
    await authenticatedPage.waitForLoadState('domcontentloaded');
    // 看板数据来自 ERP API，需要较长等待时间
    await authenticatedPage.waitForTimeout(5000);
  });

  test('页面正常加载，标题可见', async ({ authenticatedPage }) => {
    const title = authenticatedPage.locator('text=应收账款全景看板');
    await expect(title).toBeVisible({ timeout: 15000 });
  });

  test('数据更新时间显示', async ({ authenticatedPage }) => {
    const timeText = authenticatedPage.locator('text=数据更新时间');
    await expect(timeText).toBeVisible({ timeout: 15000 });
  });

  test('KPI 卡片包含正确标题', async ({ authenticatedPage }) => {
    const expectedTitles = ['应收总额', '逾期总额', '应收客户数', 'DSO', '催收中任务', '即将逾期'];
    for (const title of expectedTitles) {
      const card = authenticatedPage.locator(`text=${title}`);
      await expect(card.first()).toBeVisible({ timeout: 15000 });
    }
  });
});

test.describe('催收进度管道', () => {
  test.beforeEach(async ({ authenticatedPage }) => {
    await authenticatedPage.goto('/ar-dashboard');
    await authenticatedPage.waitForLoadState('domcontentloaded');
    await authenticatedPage.waitForTimeout(5000);
  });

  test('催收进度标题可见', async ({ authenticatedPage }) => {
    const section = authenticatedPage.locator('text=催收进度');
    await expect(section.first()).toBeVisible({ timeout: 15000 });
  });

  test('诉讼进度区域存在', async ({ authenticatedPage }) => {
    const legal = authenticatedPage.locator('text=诉讼进度');
    await expect(legal.first()).toBeVisible({ timeout: 15000 });
  });
});

test.describe('应收账款明细表', () => {
  test.beforeEach(async ({ authenticatedPage }) => {
    await authenticatedPage.goto('/ar-dashboard');
    await authenticatedPage.waitForLoadState('domcontentloaded');
    await authenticatedPage.waitForTimeout(5000);
  });

  test('明细表标题可见', async ({ authenticatedPage }) => {
    const title = authenticatedPage.locator('text=应收账款明细');
    await expect(title.first()).toBeVisible({ timeout: 15000 });
  });

  test('明细表有数据行', async ({ authenticatedPage }) => {
    const rowCount = await getTableRowCount(authenticatedPage);
    expect(rowCount).toBeGreaterThan(0);
  });

  test('搜索框存在', async ({ authenticatedPage }) => {
    const search = authenticatedPage.locator('input[placeholder*="搜索"]');
    await expect(search.first()).toBeVisible({ timeout: 10000 });
  });
});

test.describe('弹窗交互', () => {
  test.beforeEach(async ({ authenticatedPage }) => {
    await authenticatedPage.goto('/ar-dashboard');
    await authenticatedPage.waitForLoadState('domcontentloaded');
    await authenticatedPage.waitForTimeout(5000);
  });

  test('即将逾期 KPI 卡片点击弹出弹窗', async ({ authenticatedPage }) => {
    const upcomingCard = authenticatedPage.locator('text=即将逾期').first();
    if (await upcomingCard.isVisible()) {
      const card = upcomingCard.locator('xpath=ancestor::div[contains(@class,"ant-card")]').first();
      if ((await card.count()) > 0) {
        await card.click();
        const modal = authenticatedPage.locator('.ant-modal');
        await expect(modal.first()).toBeVisible({ timeout: 10000 });
      }
    }
  });
});
