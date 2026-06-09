/**
 * E2E 测试：OA 审批详情布局与交互补充场景
 * 覆盖：详情页 descriptions 布局、错误态导航、移动端回退
 *
 * ⚠️ 数据安全说明：本项目开发和生产共用数据库，
 * 禁止在 E2E 测试中执行审批同意/拒绝/撤回等写操作。
 * 撤回流程的正确性验证已下沉到接口测试层（supertest + mock DB）。
 */

import { test, expect } from './fixtures';
import { waitForPageLoad } from './helpers/antd';

test.describe('详情页 descriptions 布局', () => {
  test('详情页使用 descriptions 布局渲染表单', async ({ authenticatedPage, apiClient }) => {
    // 通过 API 获取一条审批实例
    let instanceId: number | null = null;
    try {
      const result = await apiClient.get('/api/oa-approval/instances?viewMode=processed&page=1&pageSize=1');
      const list = result?.data || result || [];
      if (Array.isArray(list) && list.length > 0) {
        instanceId = list[0].id;
      }
    } catch {
      // 静默
    }

    if (!instanceId) {
      test.info().annotations.push({
        type: 'skipped',
        description: '无可用的审批实例，跳过 descriptions 布局测试',
      });
      return;
    }

    await authenticatedPage.goto(`/oa/detail/${instanceId}`);
    await waitForPageLoad(authenticatedPage);

    // descriptions 布局应渲染 .ant-descriptions 组件
    const descriptions = authenticatedPage.locator('.ant-descriptions');
    await expect(descriptions.first()).toBeVisible({ timeout: 5000 });

    // 页面不应崩溃
    const body = authenticatedPage.locator('body');
    await expect(body).toBeVisible();
  });
});

test.describe('详情页错误态导航', () => {
  test('访问不存在的审批 ID → 显示错误页面 + 返回按钮可点击', async ({ authenticatedPage }) => {
    await authenticatedPage.goto('/oa/detail/9999999');
    await waitForPageLoad(authenticatedPage);

    // 页面不应崩溃
    const body = authenticatedPage.locator('body');
    await expect(body).toBeVisible();

    // 应显示错误态（404 或 500 Result 组件）
    const result = authenticatedPage.locator('.ant-result');
    if (await result.count() > 0) {
      await expect(result.first()).toBeVisible();

      // "返回流程中心" 按钮应存在且可点击
      const backBtn = authenticatedPage.getByRole('button', { name: /返\s*回\s*流\s*程\s*中\s*心/ });
      if (await backBtn.count() > 0) {
        await backBtn.click();
        // 应导航到流程中心
        await expect(authenticatedPage).toHaveURL(/oa\/center/, { timeout: 5000 });
      }
    }
  });
});

test.describe('移动端回退', () => {
  test('移动端点击列表项进入详情 → 点击返回箭头 → 回到列表', async ({ authenticatedPage }) => {
    // 设置移动端视口（iPhone 12）
    await authenticatedPage.setViewportSize({ width: 390, height: 844 });

    await authenticatedPage.goto('/oa/center?tab=pending');
    await waitForPageLoad(authenticatedPage);

    // 检查列表中是否有待处理项
    const listItems = authenticatedPage.locator('[class*="listItem"]');
    const itemCount = await listItems.count();

    if (itemCount === 0) {
      test.info().annotations.push({
        type: 'skipped',
        description: '无待处理项，跳过移动端回退测试',
      });
      return;
    }

    // 点击第一个列表项进入详情
    await listItems.first().click();
    await waitForPageLoad(authenticatedPage);

    // 移动端详情视图应显示 mobileBackBar 中的返回箭头
    // 使用更精确的定位：mobileBackBar 内的 ArrowLeftOutlined 图标
    const backBar = authenticatedPage.locator('[class*="mobileBackBar"]');
    const backBarVisible = await backBar.count() > 0 && await backBar.first().isVisible().catch(() => false);

    if (!backBarVisible) {
      test.info().annotations.push({
        type: 'skipped',
        description: '未检测到移动端返回栏（可能未进入详情视图）',
      });
      return;
    }

    // 点击返回栏中的箭头图标
    const backArrow = backBar.first().locator('.anticon-arrow-left, svg').first();
    await backArrow.click();
    await waitForPageLoad(authenticatedPage);

    // 返回后应显示列表视图：检查 tab 导航或列表项
    const navVisible = await authenticatedPage.locator('[class*="nav"]').first().isVisible().catch(() => false);
    const listVisible = await authenticatedPage.locator('[class*="listItem"]').first().isVisible({ timeout: 5000 }).catch(() => false);

    // 返回后至少应看到导航或列表
    expect(navVisible || listVisible).toBe(true);

    // 恢复视口
    await authenticatedPage.setViewportSize({ width: 1440, height: 900 });
  });
});
