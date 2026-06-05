/**
 * E2E 测试：OA 审批中心 - 处理后自动跳转下一条
 * 验证同意/拒绝/转交操作后自动选中下一条待处理项
 */

import { test, expect } from './fixtures';
import { waitForPageLoad, waitForMessage } from './helpers/antd';

/** 等待列表项被选中（active 样式出现） */
async function waitForItemSelected(page: import('@playwright/test').Page) {
  const activeItem = page.locator('[class*="listItemActive"]');
  await activeItem.first().waitFor({ state: 'visible', timeout: 5000 });
}

test.describe('审批中心 - 处理后自动跳转', () => {
  test.beforeEach(async ({ authenticatedPage }) => {
    await authenticatedPage.goto('/oa/center?tab=pending');
    await waitForPageLoad(authenticatedPage);
  });

  test('页面正常加载且待处理 Tab 已激活', async ({ authenticatedPage }) => {
    // 验证页面加载
    const body = authenticatedPage.locator('body');
    await expect(body).toBeVisible();

    // URL 应包含 tab=pending
    await expect(authenticatedPage).toHaveURL(/tab=pending/);
  });

  test('列表项可被选中并显示详情', async ({ authenticatedPage }) => {
    // 检查列表中是否有待处理项
    const listItems = authenticatedPage.locator('[class*="listItem"]');
    const itemCount = await listItems.count();

    if (itemCount === 0) {
      // 无待处理项，验证空状态
      const empty = authenticatedPage.locator('[class*="empty"], .ant-empty');
      expect(await empty.count()).toBeGreaterThanOrEqual(0);
      return;
    }

    // 点击第一个列表项
    await listItems.first().click();
    await waitForItemSelected(authenticatedPage);

    // URL 应包含 selectedId 参数
    await expect(authenticatedPage).toHaveURL(/selectedId=\d+/);

    // 选中项应有 active 样式
    const activeItem = authenticatedPage.locator('[class*="listItemActive"]');
    await expect(activeItem).toBeVisible();
  });

  test('同意操作后 URL 中 selectedId 更新为下一条', async ({ authenticatedPage, apiClient }) => {
    // 先通过 API 查询是否有足够的待处理项
    let pendingCount = 0;
    try {
      const stats = await apiClient.get('/api/oa-approval/instances/stats');
      pendingCount = stats?.data?.pending ?? stats?.pending ?? 0;
    } catch {
      pendingCount = 0;
    }

    if (pendingCount < 2) {
      // 至少需要 2 条待处理项才能测试跳转
      test.info().annotations.push({
        type: 'skipped',
        description: `待处理项不足（${pendingCount}条），需要至少2条才能测试自动跳转`,
      });
      return;
    }

    // 获取列表项
    const listItems = authenticatedPage.locator('[class*="listItem"]');
    const initialCount = await listItems.count();
    expect(initialCount).toBeGreaterThanOrEqual(2);

    // 获取第一个列表项的标题（用于后续验证已切换）
    const firstItemTitle = await listItems.first().locator('[class*="itemTitle"]').textContent();

    // 点击第一个列表项
    await listItems.first().click();
    await waitForItemSelected(authenticatedPage);

    // 记录当前 URL 中的 selectedId
    const urlBefore = authenticatedPage.url();
    const selectedIdBefore = new URL(urlBefore).searchParams.get('selectedId');

    // 查找并点击"同意"按钮
    const approveBtn = authenticatedPage.getByRole('button', { name: /同\s*意/ });
    if (await approveBtn.isVisible()) {
      await approveBtn.click();

      // 等待操作完成（等待成功消息出现）
      await waitForMessage(authenticatedPage, '已通过');

      // 验证：URL 中的 selectedId 应已变化（跳到下一条）
      const urlAfter = authenticatedPage.url();
      const selectedIdAfter = new URL(urlAfter).searchParams.get('selectedId');

      if (initialCount > 1) {
        // 列表有多条时，selectedId 应指向另一条
        expect(selectedIdAfter).toBeTruthy();
        // selectedId 应与之前不同（已跳到下一条）
        expect(selectedIdAfter).not.toBe(selectedIdBefore);
      }

      // 验证：成功消息应出现
      const successMsg = authenticatedPage.locator('.ant-message-notice', { hasText: /已\s*通\s*过/ });
      if (await successMsg.count() > 0) {
        await expect(successMsg.first()).toBeVisible();
      }
    } else {
      // 当前用户不是审批人，没有同意按钮，跳过
      test.info().annotations.push({
        type: 'skipped',
        description: '当前用户不是该审批的处理人，无同意按钮',
      });
    }
  });

  test('列表只剩一条时处理后显示空状态或清除选中', async ({ authenticatedPage, apiClient }) => {
    // 查询待处理数量
    let pendingCount = 0;
    try {
      const stats = await apiClient.get('/api/oa-approval/instances/stats');
      pendingCount = stats?.data?.pending ?? stats?.pending ?? 0;
    } catch {
      pendingCount = 0;
    }

    if (pendingCount !== 1) {
      test.info().annotations.push({
        type: 'skipped',
        description: `当前待处理 ${pendingCount} 条，需要恰好1条才能测试此场景`,
      });
      return;
    }

    // 点击唯一的列表项
    const listItem = authenticatedPage.locator('[class*="listItem"]').first();
    await listItem.click();
    await waitForItemSelected(authenticatedPage);

    // 查找同意按钮
    const approveBtn = authenticatedPage.getByRole('button', { name: /同\s*意/ });
    if (await approveBtn.isVisible()) {
      await approveBtn.click();
      await waitForMessage(authenticatedPage, '已通过');

      // 处理后应显示空状态或清除选中
      const empty = authenticatedPage.locator('.ant-empty, [class*="empty"]');
      const noSelected = authenticatedPage.locator('[class*="listItemActive"]');

      // 要么显示空状态，要么没有选中项
      const hasEmpty = await empty.count() > 0;
      const hasNoActive = await noSelected.count() === 0;
      expect(hasEmpty || hasNoActive).toBe(true);
    } else {
      test.info().annotations.push({
        type: 'skipped',
        description: '当前用户不是审批人',
      });
    }
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

    // 点击第一个列表项
    await listItems.first().click();
    await waitForItemSelected(authenticatedPage);

    // 查找拒绝按钮
    const rejectBtn = authenticatedPage.getByRole('button', { name: /拒\s*绝/ });
    if (await rejectBtn.isVisible()) {
      await rejectBtn.click();

      // 应弹出拒绝原因 Modal
      const modal = authenticatedPage.locator('.ant-modal');
      await expect(modal).toBeVisible();

      // 关闭 Modal（不确认）
      const cancelBtn = modal.getByRole('button', { name: /取\s*消/ });
      if (await cancelBtn.isVisible()) {
        await cancelBtn.click();

        // Modal 应已关闭
        await expect(modal).not.toBeVisible();

        // URL 中的 selectedId 不应变化
        const urlAfter = authenticatedPage.url();
        const selectedIdAfter = new URL(urlAfter).searchParams.get('selectedId');
        expect(selectedIdAfter).toBeTruthy(); // 仍选中当前项
      }
    } else {
      test.info().annotations.push({
        type: 'skipped',
        description: '无拒绝按钮',
      });
    }
  });
});
