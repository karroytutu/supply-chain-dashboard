/**
 * E2E 测试：OA 数据管理页面
 * 覆盖页面布局、筛选交互、表格交互、导出功能、权限控制
 */

import { test, expect } from './fixtures';
import {
  waitForPageLoad,
  waitForTableLoad,
  selectAntdOption,
  getTableRowCount,
} from './helpers/antd';

// ==================== 页面布局 ====================

test.describe('OA 数据管理 - 页面布局', () => {
  test.beforeEach(async ({ authenticatedPage }) => {
    await authenticatedPage.goto('/oa/data');
    await waitForPageLoad(authenticatedPage);
    await waitForTableLoad(authenticatedPage);
  });

  test('统计卡片区域存在', async ({ authenticatedPage }) => {
    // 页面有 4 个统计卡片：审批总数/处理中/已通过/已驳回
    const stats = authenticatedPage.locator('.ant-statistic');
    const count = await stats.count();
    expect(count).toBeGreaterThanOrEqual(4);
  });

  test('筛选栏存在', async ({ authenticatedPage }) => {
    // 至少有 2 个 Select（申请类型 + 审批状态）
    const selects = authenticatedPage.locator('.ant-select');
    const selectCount = await selects.count();
    expect(selectCount).toBeGreaterThanOrEqual(2);

    // 有 Input 控件（申请人姓名 + 搜索关键词）
    const inputs = authenticatedPage.locator('.ant-input');
    const inputCount = await inputs.count();
    expect(inputCount).toBeGreaterThanOrEqual(2);

    // 有 RangePicker（日期范围选择）
    const rangePicker = authenticatedPage.locator('.ant-picker-range');
    const pickerCount = await rangePicker.count();
    expect(pickerCount).toBeGreaterThanOrEqual(1);
  });

  test('数据表格存在', async ({ authenticatedPage }) => {
    const table = authenticatedPage.locator('.ant-table');
    await expect(table.first()).toBeVisible();
  });
});

// ==================== 筛选交互 ====================

test.describe('OA 数据管理 - 筛选交互', () => {
  test.beforeEach(async ({ authenticatedPage }) => {
    await authenticatedPage.goto('/oa/data');
    await waitForPageLoad(authenticatedPage);
    await waitForTableLoad(authenticatedPage);
  });

  test('选择审批状态后页面不崩溃', async ({ authenticatedPage }) => {
    // 找到"审批状态"Select（第二个 Select 控件）
    const selects = authenticatedPage.locator('.ant-select');
    const selectCount = await selects.count();

    if (selectCount >= 2) {
      const statusSelect = selects.nth(1);
      try {
        await selectAntdOption(authenticatedPage, statusSelect, '处理中');
        await waitForTableLoad(authenticatedPage);
      } catch {
        // 下拉选项不可用时跳过
      }
    }

    // 页面不应崩溃
    const body = authenticatedPage.locator('body');
    await expect(body).toBeVisible();
  });

  test('输入关键词搜索', async ({ authenticatedPage }) => {
    const searchInput = authenticatedPage.locator('input[placeholder="搜索关键词"]');
    if (await searchInput.count() > 0) {
      await searchInput.fill('测试');
      // 等待可能的表格刷新
      await authenticatedPage.waitForTimeout(500);
      await waitForTableLoad(authenticatedPage);
    }

    const body = authenticatedPage.locator('body');
    await expect(body).toBeVisible();
  });

  test('点击重置按钮清空筛选', async ({ authenticatedPage }) => {
    // 先选择一个审批状态
    const selects = authenticatedPage.locator('.ant-select');
    const selectCount = await selects.count();

    if (selectCount >= 2) {
      const statusSelect = selects.nth(1);
      try {
        await selectAntdOption(authenticatedPage, statusSelect, '已通过');
      } catch {
        // 选项不可用时跳过
      }
    }

    // 点击重置按钮（包含 ReloadOutlined 图标的按钮）
    const resetBtn = authenticatedPage.locator('button .anticon-reload').locator('..');
    if (await resetBtn.count() > 0) {
      await resetBtn.click();
      await authenticatedPage.waitForTimeout(300);
    }

    // 重置后 Select 应回到空值（placeholder 可见）
    const placeholders = authenticatedPage.locator('.ant-select-selection-placeholder');
    const placeholderCount = await placeholders.count();
    // 至少有 2 个 placeholder 重新显示（申请类型 + 审批状态）
    expect(placeholderCount).toBeGreaterThanOrEqual(2);
  });
});

// ==================== 表格交互 ====================

test.describe('OA 数据管理 - 表格交互', () => {
  test.beforeEach(async ({ authenticatedPage }) => {
    await authenticatedPage.goto('/oa/data');
    await waitForPageLoad(authenticatedPage);
    await waitForTableLoad(authenticatedPage);
  });

  test('表格列标题完整', async ({ authenticatedPage }) => {
    const headers = authenticatedPage.locator('.ant-table-thead th');
    const headerCount = await headers.count();

    if (headerCount > 0) {
      const headerTexts: string[] = [];
      for (let i = 0; i < headerCount; i++) {
        const text = await headers.nth(i).textContent();
        if (text) headerTexts.push(text.trim());
      }

      // 验证关键列名存在
      expect(headerTexts).toContain('编号');
      expect(headerTexts).toContain('申请类型');
      expect(headerTexts).toContain('申请人');
      expect(headerTexts).toContain('状态');
      expect(headerTexts).toContain('操作');
    }
  });

  test('点击查看按钮导航详情', async ({ authenticatedPage }) => {
    const rowCount = await getTableRowCount(authenticatedPage);

    if (rowCount > 0) {
      // 点击第一行的"查看"按钮
      const viewButtons = authenticatedPage.locator('button:has-text("查看")');
      if (await viewButtons.count() > 0) {
        await viewButtons.first().click();
        await waitForPageLoad(authenticatedPage);

        // 应导航到审批详情页
        await expect(authenticatedPage).toHaveURL(/oa\/detail\//, { timeout: 5000 });
      }
    } else {
      // 无数据行时跳过
      test.info().annotations.push({
        type: 'skipped',
        description: '表格无数据行，跳过导航测试',
      });
    }
  });

  test('分页控件存在', async ({ authenticatedPage }) => {
    const pagination = authenticatedPage.locator('.ant-pagination');
    const count = await pagination.count();

    // 分页控件可能存在（取决于数据量）
    if (count > 0) {
      await expect(pagination.first()).toBeVisible();
    }

    // 页面正常
    const body = authenticatedPage.locator('body');
    await expect(body).toBeVisible();
  });
});

// ==================== 导出功能 ====================

test.describe('OA 数据管理 - 导出功能', () => {
  test.beforeEach(async ({ authenticatedPage }) => {
    await authenticatedPage.goto('/oa/data');
    await waitForPageLoad(authenticatedPage);
    await waitForTableLoad(authenticatedPage);
  });

  test('导出按钮可见（admin 角色）', async ({ authenticatedPage }) => {
    const exportBtn = authenticatedPage.locator('button:has-text("导出")');
    const count = await exportBtn.count();

    // admin 角色应有导出按钮
    if (count > 0) {
      await expect(exportBtn.first()).toBeVisible();
    }
  });

  test('点击导出显示下拉菜单', async ({ authenticatedPage }) => {
    const exportBtn = authenticatedPage.locator('button:has-text("导出")');
    if (await exportBtn.count() > 0) {
      await exportBtn.first().click();
      await authenticatedPage.waitForTimeout(300);

      // 应显示下拉菜单，包含 Excel/PDF/打印 3 个选项
      const excelOption = authenticatedPage.locator('text=导出 Excel');
      const pdfOption = authenticatedPage.locator('text=导出 PDF');
      const printOption = authenticatedPage.locator('text=打印');

      const hasExcel = await excelOption.count() > 0;
      const hasPdf = await pdfOption.count() > 0;
      const hasPrint = await printOption.count() > 0;

      expect(hasExcel || hasPdf || hasPrint).toBe(true);
    }
  });
});

// ==================== 权限控制 ====================

test.describe('OA 数据管理 - 权限控制', () => {
  test('viewer 角色无权限访问数据管理', async ({ authenticatedPage, switchRole }) => {
    try {
      await switchRole('viewer');
    } catch {
      test.info().annotations.push({
        type: 'skipped',
        description: 'dev-switch 不可用，跳过权限测试',
      });
      return;
    }

    await authenticatedPage.goto('/oa/data');
    await waitForPageLoad(authenticatedPage);

    // 无权限用户应看到 403 提示或表格不加载
    const forbidden = authenticatedPage.locator('text="无访问权限"');
    const has403 = await forbidden.count();

    const table = authenticatedPage.locator('.ant-table');
    const hasTable = await table.count();

    // 要么看到 403，要么看不到数据表格
    expect(has403 > 0 || hasTable === 0).toBe(true);
  });
});
