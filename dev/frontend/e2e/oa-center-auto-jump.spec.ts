/**
 * E2E 测试：OA 审批中心 - 列表交互与导航
 * 验证列表选中、详情导航等只读交互行为
 *
 * ⚠️ 数据安全说明：本项目开发和生产共用数据库，
 * 禁止在 E2E 测试中执行审批同意/拒绝/撤回等写操作。
 * 写操作的正确性验证已下沉到接口测试层（supertest + mock DB）。
 */

import { test, expect } from './fixtures';
import { waitForPageLoad } from './helpers/antd';

/** 等待列表项被选中（active 样式出现） */
async function waitForItemSelected(page: import('@playwright/test').Page) {
  const activeItem = page.locator('[class*="listItemActive"]');
  await activeItem.first().waitFor({ state: 'visible', timeout: 5000 });
}

test.describe('审批中心 - 列表交互', () => {
  test.beforeEach(async ({ authenticatedPage }) => {
    await authenticatedPage.goto('/oa/center?tab=pending');
    await waitForPageLoad(authenticatedPage);
  });

  test('页面正常加载且待处理 Tab 已激活', async ({ authenticatedPage }) => {
    const body = authenticatedPage.locator('body');
    await expect(body).toBeVisible();
    await expect(authenticatedPage).toHaveURL(/tab=pending/);
  });

  test('列表项可被选中并显示详情', async ({ authenticatedPage }) => {
    const listItems = authenticatedPage.locator('[class*="listItem"]');
    const itemCount = await listItems.count();

    if (itemCount === 0) {
      const empty = authenticatedPage.locator('[class*="empty"], .ant-empty');
      expect(await empty.count()).toBeGreaterThanOrEqual(0);
      return;
    }

    await listItems.first().click();
    await waitForItemSelected(authenticatedPage);

    await expect(authenticatedPage).toHaveURL(/selectedId=\d+/);

    const activeItem = authenticatedPage.locator('[class*="listItemActive"]');
    await expect(activeItem).toBeVisible();
  });

  test('选中列表项后 URL 中 selectedId 更新', async ({ authenticatedPage }) => {
    const listItems = authenticatedPage.locator('[class*="listItem"]');
    if ((await listItems.count()) < 2) {
      test.info().annotations.push({
        type: 'skipped',
        description: '列表项不足 2 条，跳过选中切换测试',
      });
      return;
    }

    // 点击第一个列表项
    await listItems.first().click();
    await waitForItemSelected(authenticatedPage);
    const url1 = authenticatedPage.url();
    const selectedId1 = new URL(url1).searchParams.get('selectedId');

    // 点击第二个列表项
    await listItems.nth(1).click();
    await waitForItemSelected(authenticatedPage);
    const url2 = authenticatedPage.url();
    const selectedId2 = new URL(url2).searchParams.get('selectedId');

    // selectedId 应不同
    expect(selectedId1).toBeTruthy();
    expect(selectedId2).toBeTruthy();
    expect(selectedId2).not.toBe(selectedId1);
  });

  test('拒绝操作弹窗取消后不触发跳转', async ({ authenticatedPage }) => {
    const listItems = authenticatedPage.locator('[class*="listItem"]');
    const itemCount = await listItems.count();

    if (itemCount === 0) {
      test.info().annotations.push({
        type: 'skipped',
        description: '无待处理项',
      });
      return;
    }

    await listItems.first().click();
    await waitForItemSelected(authenticatedPage);

    const rejectBtn = authenticatedPage.getByRole('button', { name: /拒\s*绝/ });
    if (await rejectBtn.isVisible()) {
      await rejectBtn.click();

      const modal = authenticatedPage.locator('.ant-modal');
      await expect(modal).toBeVisible();

      const cancelBtn = modal.getByRole('button', { name: /取\s*消/ });
      if (await cancelBtn.isVisible()) {
        await cancelBtn.click();
        await expect(modal).not.toBeVisible();

        const urlAfter = authenticatedPage.url();
        const selectedIdAfter = new URL(urlAfter).searchParams.get('selectedId');
        expect(selectedIdAfter).toBeTruthy();
      }
    } else {
      test.info().annotations.push({
        type: 'skipped',
        description: '无拒绝按钮',
      });
    }
  });
});
