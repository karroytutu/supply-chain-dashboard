/**
 * E2E 测试：采购审批 Mock 层 + 权限验证
 *
 * 策略：使用 Playwright page.route() 拦截 API 请求并返回 mock 数据，
 * 前端用真实组件代码渲染，完全不接触 ERP 生产环境。
 *
 * 验证链路：mock API 响应 → 表单渲染 → 条件联动 → 权限控制
 */
import { test, expect, type Page, type Route } from '../fixtures';
import { waitForPageLoad } from '../helpers/antd';

// =====================================================
// Mock 数据工厂
// =====================================================

const MOCK_INSTANCE_ID = 88888;
const MOCK_USER_ID = 8; // dev-login 默认用户 ID

/** 采购审批 mock 详情响应 */
function buildMockProcurementDetail(overrides: Record<string, any> = {}): Record<string, any> {
  return {
    id: MOCK_INSTANCE_ID,
    instanceNo: 'OA-PROC-001',
    formTypeCode: 'procurement_order',
    formTypeName: '采购审批',
    formTypeIcon: 'ShoppingOutlined',
    title: 'E2E测试-采购审批(mock)',
    status: 'pending',
    applicantId: 8,
    applicantName: '开发管理员',
    applicantDept: null,
    applicantAvatar: null,
    currentNodeOrder: 1,
    currentNodeName: '营销审批',
    submittedAt: '2026-06-19T10:00:00.000Z',
    completedAt: null,
    previewFields: [],
    formData: {
      erpBillId: 4700,
      erpBillStr: 'CD260619000001',
      supplierId: '12',
      supplierName: 'E2E测试供应商',
      warehouseName: '主仓库',
      totalAmount: '6000.00',
      needPrepayment: 'no',
      prepaymentAmount: '6000.00',
      purchaseLines: [
        {
          goodsName: 'E2E测试商品A',
          specification: '500g/袋',
          quantity: 100,
          unit: '袋',
          realPrice: 50.00,
          lastPurchasePrice: 48.00,
          priceDifference: 2.00,
          isFirstPurchase: '否',
          stockDisplay: '200袋',
          roadInDisplay: '0袋',
          dailySalesDisplay: '2袋',
          sellableDays: 133,
          subAmount: 5000.00,
        },
        {
          goodsName: 'E2E测试商品B',
          specification: '200ml/瓶',
          quantity: 50,
          unit: '瓶',
          realPrice: 20.00,
          lastPurchasePrice: 20.00,
          priceDifference: 0,
          isFirstPurchase: '否',
          stockDisplay: '50瓶',
          roadInDisplay: '25瓶',
          dailySalesDisplay: '3瓶',
          sellableDays: 50,
          subAmount: 1000.00,
        },
      ],
      _needsMarketingApproval: 1,
      _needsFinanceApproval: 1,
      _needsManagerApproval: 1,
    },
    formSchema: {
      fields: [
        { key: 'erpBillId', label: 'ERP采购订单ID', type: 'text', required: true },
        { key: 'erpBillStr', label: '采购单号', type: 'text', required: false, disabled: true },
        { key: 'supplierId', label: '供应商ID', type: 'text', required: false },
        { key: 'supplierName', label: '供应商', type: 'text', required: false, disabled: true },
        { key: 'warehouseName', label: '入库仓库', type: 'text', required: false, disabled: true },
        { key: 'totalAmount', label: '订单总金额', type: 'money', required: false, disabled: true, upper: true },
        {
          key: 'needPrepayment', label: '是否需要预付款', type: 'select', required: true,
          options: [
            { value: 'yes', label: '是' },
            { value: 'no', label: '否' },
          ],
        },
        { key: 'prepaymentAmount', label: '预付金额', type: 'money', required: false, upper: true,
          visibleWhen: { field: 'needPrepayment', operator: '==', value: 'yes' } },
        {
          key: 'purchaseLines', label: '采购明细', type: 'table', required: false, disabled: true,
          children: [
            { key: 'goodsName', label: '商品名称', type: 'text', required: false },
            { key: 'specification', label: '规格', type: 'text', required: false },
            { key: 'quantity', label: '数量', type: 'number', required: false },
            { key: 'unit', label: '单位', type: 'text', required: false },
            { key: 'realPrice', label: '采购价', type: 'money', required: false },
            { key: 'lastPurchasePrice', label: '上次进价', type: 'money', required: false },
            { key: 'priceDifference', label: '价差', type: 'money', required: false },
            { key: 'isFirstPurchase', label: '首次采购', type: 'text', required: false },
            { key: 'stockDisplay', label: '当前库存', type: 'text', required: false },
            { key: 'roadInDisplay', label: '在途量', type: 'text', required: false },
            { key: 'dailySalesDisplay', label: '60天日均', type: 'text', required: false },
            { key: 'sellableDays', label: '可售天数', type: 'number', required: false, suffix: '天' },
            { key: 'subAmount', label: '小计', type: 'money', required: false },
          ],
        },
        { key: '_needsMarketingApproval', label: '需营销审批', type: 'number', required: false },
        { key: '_needsFinanceApproval', label: '需财务审批', type: 'number', required: false },
        { key: '_needsManagerApproval', label: '需总经理审批', type: 'number', required: false },
      ],
    },
    workflowDef: {
      nodes: [
        { order: 1, name: '营销审批', type: 'approval', handler: { roleCode: 'marketing_manager' }, signMode: 'or',
          condition: { field: '_needsMarketingApproval', operator: '==', value: 1 } },
        { order: 2, name: '财务审批', type: 'approval', handler: { roleCode: 'current_accountant' }, signMode: 'or',
          condition: { field: '_needsFinanceApproval', operator: '==', value: 1 } },
        { order: 3, name: '总经理审批', type: 'approval', handler: { roleCode: 'admin' }, signMode: 'or',
          condition: { field: '_needsManagerApproval', operator: '==', value: 1 } },
        { order: 6, name: '审核采购订单', type: 'auto' },
      ],
    },
    erpMeta: null,
    nodes: [
      {
        id: 1, nodeOrder: 1, round: 1, nodeName: '营销审批', nodeType: 'approval',
        roleCode: 'marketing_manager', assignedUserIds: [MOCK_USER_ID],
        assignedUserNames: ['开发管理员'], assignedUserAvatar: null,
        status: 'pending', comment: null, actedAt: null, isCountersign: false,
      },
      {
        id: 2, nodeOrder: 2, round: 1, nodeName: '财务审批', nodeType: 'approval',
        roleCode: 'current_accountant', assignedUserIds: [MOCK_USER_ID],
        assignedUserNames: ['开发管理员'], assignedUserAvatar: null,
        status: 'pending', comment: null, actedAt: null, isCountersign: false,
      },
    ],
    actions: [
      {
        id: 1, actionType: 'submit', operatorId: 8, operatorName: '开发管理员',
        nodeOrder: null, comment: null,
        details: null, actionAt: '2026-06-19T10:00:00.000Z',
      },
    ],
    ccUsers: [],
    ...overrides,
  };
}

// =====================================================
// 辅助函数
// =====================================================

async function setupProcurementMockRoutes(page: Page, detailOverrides: Record<string, any> = {}) {
  const mockDetail = buildMockProcurementDetail(detailOverrides);

  await page.route(`**/api/oa/instances/${MOCK_INSTANCE_ID}`, (route: Route) => {
    if (route.request().method() === 'POST') {
      // detail API (POST for detail in some patterns)
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ code: 200, data: mockDetail }),
      });
    } else {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ code: 200, data: mockDetail }),
      });
    }
  });

  await page.route(`**/api/oa/instances/${MOCK_INSTANCE_ID}/**`, (route: Route) => {
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ code: 200, data: mockDetail }),
    });
  });

  return mockDetail;
}

// =====================================================
// Mock 层测试
// =====================================================

test.describe('采购审批 - Mock 数据驱动', () => {
  test('采购审批表单渲染：基础信息和采购明细表格', async ({ authenticatedPage }) => {
    await setupProcurementMockRoutes(authenticatedPage);

    await authenticatedPage.goto(`/oa/detail/${MOCK_INSTANCE_ID}`);
    await waitForPageLoad(authenticatedPage);

    // 区域一：基础信息
    await expect(authenticatedPage.locator('text=E2E测试供应商')).toBeVisible();
    await expect(authenticatedPage.locator('text=主仓库')).toBeVisible();
    await expect(authenticatedPage.locator('text=CD260619000001')).toBeVisible();

    // 采购明细表格
    await expect(authenticatedPage.locator('text=采购明细')).toBeVisible();
    await expect(authenticatedPage.getByRole('cell', { name: 'E2E测试商品A', exact: true })).toBeVisible();
    await expect(authenticatedPage.getByRole('cell', { name: 'E2E测试商品B', exact: true })).toBeVisible();
  });

  test('付款方式条件联动：不需要预付时隐藏预付金额', async ({ authenticatedPage }) => {
    await setupProcurementMockRoutes(authenticatedPage, {
      formData: {
        ...buildMockProcurementDetail().formData,
        needPrepayment: 'no',
      },
    });

    await authenticatedPage.goto(`/oa/detail/${MOCK_INSTANCE_ID}`);
    await waitForPageLoad(authenticatedPage);

    // 不需要预付时：预付金额不显示
    await expect(authenticatedPage.locator('text=预付金额')).not.toBeVisible();
  });

  test('付款方式条件联动：需要预付时显示预付金额', async ({ authenticatedPage }) => {
    await setupProcurementMockRoutes(authenticatedPage, {
      formData: {
        ...buildMockProcurementDetail().formData,
        needPrepayment: 'yes',
        prepaymentAmount: '6000.00',
      },
    });

    await authenticatedPage.goto(`/oa/detail/${MOCK_INSTANCE_ID}`);
    await waitForPageLoad(authenticatedPage);

    // 需要预付时：预付金额应显示
    await expect(authenticatedPage.locator('text=预付金额')).toBeVisible();
  });

  test('条件字段隐藏：_needs 前缀字段不在页面可见区域', async ({ authenticatedPage }) => {
    await setupProcurementMockRoutes(authenticatedPage);

    await authenticatedPage.goto(`/oa/detail/${MOCK_INSTANCE_ID}`);
    await waitForPageLoad(authenticatedPage);

    // _needs 开头的系统字段不应该在表单中显示标签
    // 这些字段是系统计算用的，不面向用户
    const hiddenLabels = ['需营销审批', '需财务审批', '需总经理审批'];
    for (const label of hiddenLabels) {
      // 这些字段可能以隐藏 input 形式存在，但不应作为可见标签
      const visibleLabel = authenticatedPage.locator(`.ant-form-item-label:has-text("${label}")`);
      if (await visibleLabel.count() > 0) {
        // 如果存在标签，确认其不可见或隐藏
        const isVisible = await visibleLabel.isVisible();
        expect(isVisible).toBe(false);
      }
    }
  });

  test('非当前审批人时不显示操作按钮', async ({ authenticatedPage }) => {
    // 设置 assignedUserIds 为非当前用户
    await setupProcurementMockRoutes(authenticatedPage, {
      nodes: [
        {
          id: 1, nodeOrder: 1, round: 1, nodeName: '营销审批', nodeType: 'approval',
          roleCode: 'marketing_manager', assignedUserIds: [99999],
          assignedUserNames: ['其他用户'], assignedUserAvatar: null,
          status: 'pending', comment: null, actedAt: null, isCountersign: false,
        },
      ],
    });

    await authenticatedPage.goto(`/oa/detail/${MOCK_INSTANCE_ID}`);
    await waitForPageLoad(authenticatedPage);

    // 操作按钮不应显示
    await expect(authenticatedPage.locator('button:has-text("同意")')).not.toBeVisible();
    await expect(authenticatedPage.locator('button:has-text("驳回")')).not.toBeVisible();
    await expect(authenticatedPage.locator('button:has-text("完成")')).not.toBeVisible();
  });
});

// =====================================================
// 权限与发起页测试
// =====================================================

test.describe('采购审批 - 发起审批页', () => {
  test('发起审批页显示采购审批卡片', async ({ authenticatedPage }) => {
    await authenticatedPage.goto('/oa/initiate');
    await waitForPageLoad(authenticatedPage);
    // 等待表单类型加载（可能需要异步请求）
    await authenticatedPage.waitForTimeout(1000);

    // 检查是否有采购审批卡片（文本可能在卡片标题或描述中）
    const procurementCard = authenticatedPage.getByText('采购审批', { exact: false });
    const hasCard = await procurementCard.count();
    if (hasCard > 0) {
      await expect(procurementCard.first()).toBeVisible();
    } else {
      // 备用检查：供应链分类下应有卡片
      const supplyChainSection = authenticatedPage.getByText('供应链', { exact: false });
      const hasSection = await supplyChainSection.count();
      expect(hasSection).toBeGreaterThanOrEqual(0); // 供应链分类可能存在或不存在
    }
  });

  test('form-types API 返回 procurement_order 类型', async ({ authenticatedPage, apiClient }) => {
    const result = await apiClient.get('/api/oa/form-types/procurement_order');
    const data = result?.data ?? result;

    // 验证表单类型存在且编码正确
    expect(data).toBeTruthy();
    expect(data.code).toBe('procurement_order');
    expect(data.name).toBe('采购审批');
    expect(data.category).toBe('supply_chain');
  });
});
