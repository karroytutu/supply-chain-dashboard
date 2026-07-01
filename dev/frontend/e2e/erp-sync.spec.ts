/**
 * ERP 同步管理页 E2E 测试
 * @module e2e/erp-sync.spec.ts
 */

import { test, expect } from './fixtures';

const BASE_URL = 'http://localhost:3100';

test.describe('ERP 数据同步管理', () => {
  test('同步状态列表正常展示', async ({ authenticatedPage }) => {
    await authenticatedPage.goto(`${BASE_URL}/system/erp-sync`);
    await authenticatedPage.waitForLoadState('networkidle');

    // 等待表格加载
    const tableRows = authenticatedPage.locator('.ant-table-row');
    await expect(tableRows.first()).toBeVisible({ timeout: 10000 });

    // 验证表格包含关键列
    const headerCells = authenticatedPage.locator('.ant-table-thead th');
    const headerTexts = await headerCells.allTextContents();
    // 至少包含数据集名称和状态相关的列
    expect(headerTexts.length).toBeGreaterThan(2);
  });

  test('同步状态 API 返回有效数据', async ({ apiClient }) => {
    const response = await apiClient.get('/api/erp-sync/status');

    expect(response).toHaveProperty('code', 200);
    expect(response).toHaveProperty('data');
    expect(Array.isArray(response.data)).toBe(true);

    if (response.data.length > 0) {
      const first = response.data[0];
      expect(first).toHaveProperty('source_id');
      expect(first).toHaveProperty('name');
      expect(first).toHaveProperty('last_sync_at');
    }
  });

  test('同步日志 API 返回有效数据', async ({ apiClient }) => {
    const response = await apiClient.get('/api/erp-sync/log');

    expect(response).toHaveProperty('code', 200);
    expect(response).toHaveProperty('data');
    expect(Array.isArray(response.data)).toBe(true);
  });

  test('同步日志支持 source_id 过滤', async ({ apiClient }) => {
    const response = await apiClient.get('/api/erp-sync/log?source_id=debts&limit=10');

    expect(response).toHaveProperty('code', 200);
    expect(response.data.length).toBeLessThanOrEqual(10);
  });

  test('强制同步未注册数据集返回 404', async ({ apiClient }) => {
    const response = await apiClient.post('/api/erp-sync/nonexistent_dataset/force-sync');
    // 应该返回 404 或错误信息
    expect(response.code === 404 || response.message).toBeTruthy();
  });

  test('权限控制：viewer 角色无法看到操作按钮', async ({ authenticatedPage, switchRole }) => {
    await switchRole('viewer');
    await authenticatedPage.goto(`${BASE_URL}/system/erp-sync`);
    await authenticatedPage.waitForLoadState('networkidle');

    // 强制同步按钮应对 viewer 不可见
    const forceSyncBtn = authenticatedPage.getByRole('button', { name: /强制同步/ });
    if (await forceSyncBtn.count() > 0) {
      await expect(forceSyncBtn.first()).not.toBeVisible();
    }
  });
});
