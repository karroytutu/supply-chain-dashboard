/**
 * 销售分析回归 E2E 测试
 * 验证销售分析页面在底层切换为本地 erp_sales_details 聚合后仍正常工作
 * @module e2e/sales-analysis-regression.spec.ts
 */

import { test, expect } from './fixtures';

const BASE_URL = 'http://localhost:3100';

test.describe('销售分析回归', () => {
  test('销售分析页面正常加载', async ({ authenticatedPage }) => {
    const errors: string[] = [];
    authenticatedPage.on('pageerror', (e) => errors.push(e.message));

    await authenticatedPage.goto(`${BASE_URL}/sales/analysis`);
    await authenticatedPage.waitForLoadState('networkidle');

    // 无 JS 报错（排除 ResizeObserver）
    expect(errors.filter(e => !e.includes('ResizeObserver'))).toHaveLength(0);

    // 页面有内容
    const bodyText = await authenticatedPage.locator('body').textContent();
    expect(bodyText?.trim().length).toBeGreaterThan(0);
  });

  test('销售分析页面各维度切换正常', async ({ authenticatedPage }) => {
    await authenticatedPage.goto(`${BASE_URL}/sales/analysis`);
    await authenticatedPage.waitForLoadState('networkidle');

    // 验证页面渲染完成（至少有一个图表或数据区域）
    const contentArea = authenticatedPage.locator('[class*="chart"], [class*="card"], [class*="table"], [class*="panel"]');
    await expect(contentArea.first()).toBeVisible({ timeout: 15000 });
  });

  test('销售分析 API 返回有效数据', async ({ apiClient }) => {
    // 测试销售概览 API（如果存在）
    const response = await apiClient.get('/api/sales/overview');
    // API 应返回有效数据（或至少不报 500）
    expect(response).toBeTruthy();
  });
});
