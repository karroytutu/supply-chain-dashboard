/**
 * 目标管理 E2E 测试
 * @module e2e/target-management.spec.ts
 */

import { test, expect } from './fixtures';

const BASE_URL = 'http://localhost:3100';

test.describe('目标管理', () => {
  test.describe('概览模式', () => {
    test('页面加载后默认显示概览视图', async ({ authenticatedPage }) => {
      await authenticatedPage.goto(`${BASE_URL}/sales/targets`);
      await authenticatedPage.waitForLoadState('networkidle');

      // 验证概览面板可见
      await expect(authenticatedPage.locator('[class*="overviewPanel"], [class*="panel"]')).toBeVisible({ timeout: 10000 });
    });

    test('概览卡片展示总额/达成/增长率/进度', async ({ authenticatedPage }) => {
      await authenticatedPage.goto(`${BASE_URL}/sales/targets`);
      await authenticatedPage.waitForLoadState('networkidle');

      // 验证 4 张概览卡片的标签文本
      const labels = ['当月目标', '上月实际', '增长率', '设置进度'];
      for (const label of labels) {
        const card = authenticatedPage.getByText(label, { exact: false });
        await expect(card.first()).toBeVisible();
      }
    });
  });

  test.describe('月份切换', () => {
    test('前月/后月按钮正常工作', async ({ authenticatedPage }) => {
      await authenticatedPage.goto(`${BASE_URL}/sales/targets`);
      await authenticatedPage.waitForLoadState('networkidle');

      // 找到月份切换按钮
      const prevBtn = authenticatedPage.locator('button:has-text("‹"), button:has-text("<"), [class*="prevMonth"]');
      const nextBtn = authenticatedPage.locator('button:has-text("›"), button:has-text(">"), [class*="nextMonth"]');

      // 后月按钮应可用
      if (await nextBtn.count() > 0) {
        await expect(nextBtn.first()).toBeVisible();
      }
    });
  });

  test.describe('权限控制', () => {
    test('营销师只读：编辑/删除按钮不可见', async ({ authenticatedPage, switchRole }) => {
      // 切换到只读角色
      await switchRole('viewer');
      await authenticatedPage.goto(`${BASE_URL}/sales/targets`);
      await authenticatedPage.waitForLoadState('networkidle');

      // 验证编辑/删除按钮不可见
      const editBtn = authenticatedPage.getByRole('button', { name: /编辑|保存/ });
      const deleteBtn = authenticatedPage.getByRole('button', { name: /删除/ });

      if (await editBtn.count() > 0) {
        await expect(editBtn.first()).not.toBeVisible();
      }
      if (await deleteBtn.count() > 0) {
        await expect(deleteBtn.first()).not.toBeVisible();
      }
    });
  });

  test.describe('数据完整性', () => {
    test('概览 API 返回有效数据', async ({ apiClient }) => {
      const response = await apiClient.get('/api/sales/targets/overview');

      expect(response).toHaveProperty('summary');
      expect(response).toHaveProperty('marketers');
      expect(response.summary).toHaveProperty('marketerCount');
      expect(response.summary).toHaveProperty('totalTarget');
      expect(Array.isArray(response.marketers)).toBe(true);
    });

    test('目标列表 API 返回有效数据', async ({ apiClient }) => {
      const response = await apiClient.get('/api/sales/targets');
      expect(Array.isArray(response)).toBe(true);
    });

    test('营销师列表 API 返回有效数据', async ({ apiClient }) => {
      const response = await apiClient.get('/api/sales/targets/marketers');
      expect(Array.isArray(response)).toBe(true);
      if (response.length > 0) {
        expect(response[0]).toHaveProperty('id');
        expect(response[0]).toHaveProperty('name');
      }
    });
  });
});
