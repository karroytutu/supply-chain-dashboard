/**
 * E2E 测试：催收OA操作型节点完整流程
 *
 * 策略：使用 Playwright page.route() 拦截 API 请求并返回 mock 数据，
 * 前端用真实组件代码渲染，但完全不读写数据库，对生产零影响。
 *
 * 验证链路：mock API 响应 → 可编辑表单渲染 → select 选项过滤 →
 *           条件字段联动 → 提交时 inputData 正确传递
 */
import { test, expect, type Page, type Route } from './fixtures';
import { waitForPageLoad } from './helpers/antd';

// =====================================================
// Mock 数据工厂
// =====================================================

const MOCK_INSTANCE_ID = 99999;
const MOCK_USER_ID = 8; // dev-login 的用户 ID

/** 催收 OA 实例的 mock 详情响应 */
function buildMockDetail(overrides: Record<string, any> = {}): Record<string, any> {
  return {
    id: MOCK_INSTANCE_ID,
    instanceNo: 'OA-TEST-001',
    formTypeCode: 'ar_collection',
    formTypeName: '逾期催收',
    formTypeIcon: 'AlertOutlined',
    title: 'E2E测试-催收实例(mock)',
    status: 'pending',
    applicantId: 92,
    applicantName: '鑫小财(AI员工)',
    applicantDept: null,
    applicantAvatar: null,
    currentNodeOrder: 1,
    currentNodeName: '营销师催收',
    submittedAt: '2026-06-01T10:00:00.000Z',
    completedAt: null,
    previewFields: [],
    formData: {
      consumerName: 'E2E测试客户(mock)',
      totalAmount: 50000,
      billCount: 3,
      maxOverdueDays: 45,
      managerName: 'E2E营销师(mock)',
      billDetails: [
        { billNo: 'BILL-001', billType: '销售单', totalAmount: 20000, leftAmount: 20000, overdueDays: 45 },
        { billNo: 'BILL-002', billType: '销售单', totalAmount: 15000, leftAmount: 15000, overdueDays: 30 },
        { billNo: 'BILL-003', billType: '销售单', totalAmount: 15000, leftAmount: 15000, overdueDays: 15 },
      ],
      _extensionCount: 0,
      action: null,
      verifyRemark: null,
      extensionDays: null,
      extensionReason: null,
      differenceRemark: null,
      escalateReason: null,
    },
    formSchema: {
      fields: [
        { key: 'consumerName', label: '客户名称', type: 'text', required: false, disabled: true },
        { key: 'totalAmount', label: '欠款总额', type: 'money', required: false, disabled: true, upper: true },
        { key: 'billCount', label: '账单数', type: 'number', required: false, disabled: true },
        { key: 'maxOverdueDays', label: '最大逾期天数', type: 'number', required: false, disabled: true, suffix: '天' },
        { key: 'managerName', label: '责任人', type: 'text', required: false, disabled: true },
        {
          key: 'billDetails', label: '账单明细', type: 'table', required: false, disabled: true,
          tableViewMode: 'table',
          children: [
            { key: 'billNo', label: '单据编号', type: 'text', required: false },
            { key: 'billType', label: '单据类型', type: 'text', required: false },
            { key: 'totalAmount', label: '单据金额', type: 'money', required: false },
            { key: 'leftAmount', label: '剩余未收', type: 'money', required: false },
            { key: 'overdueDays', label: '逾期天数', type: 'number', required: false, suffix: '天' },
          ],
        },
        { key: '_extensionCount', label: '延期次数', type: 'number', required: false },
        {
          key: 'action', label: '催收操作', type: 'select', required: true,
          options: [
            { value: 'verify', label: '核销标记' },
            { value: 'extension', label: '申请延期' },
            { value: 'difference', label: '存在差异' },
            { value: 'escalate', label: '升级处理' },
            { value: 'resolve_diff', label: '差异解决' },
            { value: 'send_letter', label: '发函' },
            { value: 'lawsuit', label: '起诉' },
          ],
        },
        {
          key: 'verifyRemark', label: '核销备注', type: 'text', required: false,
          visibleWhen: { field: 'action', operator: '==', value: 'verify' },
        },
        {
          key: 'extensionDays', label: '延期天数', type: 'number', required: true,
          min: 1, max: 30, suffix: '天',
          visibleWhen: { field: 'action', operator: '==', value: 'extension' },
          requiredWhen: { field: 'action', operator: '==', value: 'extension' },
        },
        {
          key: 'extensionReason', label: '延期原因', type: 'textarea', required: true,
          maxLength: 500,
          visibleWhen: { field: 'action', operator: '==', value: 'extension' },
          requiredWhen: { field: 'action', operator: '==', value: 'extension' },
        },
        {
          key: 'differenceRemark', label: '差异说明', type: 'textarea', required: true,
          maxLength: 1000,
          visibleWhen: { field: 'action', operator: '==', value: 'difference' },
          requiredWhen: { field: 'action', operator: '==', value: 'difference' },
        },
        {
          key: 'escalateReason', label: '升级原因', type: 'textarea', required: true,
          maxLength: 500,
          visibleWhen: { field: 'action', operator: '==', value: 'escalate' },
          requiredWhen: { field: 'action', operator: '==', value: 'escalate' },
        },
      ],
    },
    workflowDef: {
      nodes: [
        {
          order: 1, name: '营销师催收', type: 'role', roleCode: 'marketer',
          interactionType: 'operation',
          fieldPermissions: {
            consumerName: 'readonly', totalAmount: 'readonly', billCount: 'readonly',
            maxOverdueDays: 'readonly', managerName: 'readonly', billDetails: 'readonly',
            action: 'editable', verifyRemark: 'editable', extensionDays: 'editable',
            extensionReason: 'editable', differenceRemark: 'editable', escalateReason: 'editable',
          },
          fieldOptionFilter: { action: ['verify', 'extension', 'difference', 'escalate'] },
        },
        { order: 2, name: '更新催收状态', type: 'auto' },
      ],
    },
    erpMeta: null,
    nodes: [
      {
        id: 1, nodeOrder: 1, nodeName: '营销师催收', nodeType: 'role',
        roleCode: 'marketer', assignedUserId: MOCK_USER_ID,
        assignedUserName: '开发管理员', assignedUserAvatar: null,
        status: 'pending', comment: null, actedAt: null, isCountersign: false,
      },
      {
        id: 2, nodeOrder: 2, nodeName: '更新催收状态', nodeType: 'auto',
        roleCode: null, assignedUserId: null, assignedUserName: '系统',
        assignedUserAvatar: null, status: 'pending', comment: null,
        actedAt: null, isCountersign: false,
      },
    ],
    actions: [
      {
        id: 1, actionType: 'submit', operatorId: 92, operatorName: '鑫小财(AI员工)',
        nodeOrder: null, comment: '系统自动创建催收实例',
        details: null, actionAt: '2026-06-01T10:00:00.000Z',
      },
    ],
    ccUsers: [],
    ...overrides,
  };
}

// =====================================================
// 辅助函数：为页面设置 API 拦截
// =====================================================

/**
 * 拦截审批详情 API，返回 mock 数据
 * @returns capturedApproveBody - 用于捕获 approve POST 的请求体
 */
async function setupMockRoutes(page: Page, detailOverrides: Record<string, any> = {}) {
  const mockDetail = buildMockDetail(detailOverrides);

  // 拦截详情 API（独立详情页）
  await page.route(`**/api/oa/instances/${MOCK_INSTANCE_ID}`, (route: Route) => {
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ code: 200, data: mockDetail }),
    });
  });

  // 拦截详情 API（审批中心面板也调同一个接口）
  await page.route(`**/api/oa/instances/${MOCK_INSTANCE_ID}/**`, (route: Route) => {
    if (route.request().url().includes('/approve')) {
      // 不在此处拦截 approve，让具体测试自行处理
      route.continue();
    } else {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ code: 200, data: mockDetail }),
      });
    }
  });

  return mockDetail;
}

// =====================================================
// 测试用例
// =====================================================

test.describe('催收OA操作型节点 - Mock 数据驱动', () => {
  test('操作型节点显示完成/更新按钮', async ({ authenticatedPage }) => {
    await setupMockRoutes(authenticatedPage);

    await authenticatedPage.goto(`/oa/detail/${MOCK_INSTANCE_ID}`);
    await waitForPageLoad(authenticatedPage);

    // 验证操作型按钮存在
    const completeBtn = authenticatedPage.locator('button:has-text("完成")');
    const updateBtn = authenticatedPage.locator('button:has-text("更新")');
    await expect(completeBtn).toBeVisible();
    await expect(updateBtn).toBeVisible();

    // 验证审批型按钮不存在
    await expect(authenticatedPage.locator('button:has-text("同意")')).not.toBeVisible();
    await expect(authenticatedPage.locator('button:has-text("驳回")')).not.toBeVisible();
  });

  test('可编辑 select 渲染且选项被 fieldOptionFilter 过滤', async ({ authenticatedPage }) => {
    await setupMockRoutes(authenticatedPage);

    await authenticatedPage.goto(`/oa/detail/${MOCK_INSTANCE_ID}`);
    await waitForPageLoad(authenticatedPage);

    // select 控件应存在
    const selectControl = authenticatedPage.locator('.ant-select').first();
    await expect(selectControl).toBeVisible();

    // 打开下拉框
    await selectControl.click();
    await authenticatedPage.waitForTimeout(300);

    const options = authenticatedPage.locator('.ant-select-item-option-content');
    const optionTexts: string[] = [];
    for (let i = 0; i < (await options.count()); i++) {
      const text = await options.nth(i).textContent();
      if (text) optionTexts.push(text);
    }

    // L0 允许的选项（fieldOptionFilter: verify/extension/difference/escalate）
    expect(optionTexts).toContain('核销标记');
    expect(optionTexts).toContain('申请延期');
    expect(optionTexts).toContain('存在差异');
    expect(optionTexts).toContain('升级处理');

    // L0 不允许的选项（L2 才有）
    expect(optionTexts).not.toContain('差异解决');
    expect(optionTexts).not.toContain('发函');
    expect(optionTexts).not.toContain('起诉');
  });

  test('选择核销标记后条件字段联动显示', async ({ authenticatedPage }) => {
    await setupMockRoutes(authenticatedPage);

    await authenticatedPage.goto(`/oa/detail/${MOCK_INSTANCE_ID}`);
    await waitForPageLoad(authenticatedPage);

    // 初始状态：核销备注不显示
    await expect(authenticatedPage.locator('text=核销备注')).not.toBeVisible();

    // 选择"核销标记"
    const selectControl = authenticatedPage.locator('.ant-select').first();
    await selectControl.click();
    await authenticatedPage.waitForTimeout(300);

    const verifyOption = authenticatedPage.locator('.ant-select-item-option-content:has-text("核销标记")');
    await verifyOption.click();

    // 等待条件字段显示
    await authenticatedPage.waitForTimeout(500);
    await expect(authenticatedPage.locator('text=核销备注')).toBeVisible();
  });

  test('选择申请延期后显示延期相关字段', async ({ authenticatedPage }) => {
    await setupMockRoutes(authenticatedPage);

    await authenticatedPage.goto(`/oa/detail/${MOCK_INSTANCE_ID}`);
    await waitForPageLoad(authenticatedPage);

    // 选择"申请延期"
    const selectControl = authenticatedPage.locator('.ant-select').first();
    await selectControl.click();
    await authenticatedPage.waitForTimeout(300);

    await authenticatedPage.locator('.ant-select-item-option-content:has-text("申请延期")').click();
    await authenticatedPage.waitForTimeout(500);

    // 延期天数、延期原因应显示
    await expect(authenticatedPage.locator('text=延期天数')).toBeVisible();
    await expect(authenticatedPage.locator('text=延期原因')).toBeVisible();
  });

  test('点击完成后 approve 请求包含 inputData', async ({ authenticatedPage }) => {
    // 设置 mock 路由
    await setupMockRoutes(authenticatedPage);

    // 拦截 approve POST，捕获请求体
    let capturedBody: any = null;
    await authenticatedPage.route('**/api/oa/instances/*/approve', (route: Route) => {
      capturedBody = route.request().postDataJSON();
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ code: 200, data: { status: 'approved' }, message: '审批通过' }),
      });
    });

    await authenticatedPage.goto(`/oa/detail/${MOCK_INSTANCE_ID}`);
    await waitForPageLoad(authenticatedPage);

    // 选择"核销标记"
    const selectControl = authenticatedPage.locator('.ant-select').first();
    await selectControl.click();
    await authenticatedPage.waitForTimeout(300);
    await authenticatedPage.locator('.ant-select-item-option-content:has-text("核销标记")').click();
    await authenticatedPage.waitForTimeout(500);

    // 填写核销备注
    const remarkInput = authenticatedPage.locator('input.ant-input').first();
    await remarkInput.fill('E2E测试核销备注');

    // 点击"完成"按钮
    await authenticatedPage.locator('button:has-text("完成")').click();

    // 在弹窗中点击确认
    await authenticatedPage.waitForTimeout(300);
    const modalOk = authenticatedPage.locator('.ant-modal .ant-btn-primary');
    if (await modalOk.isVisible()) {
      await modalOk.click();
    }

    // 等待请求发出
    await authenticatedPage.waitForTimeout(1000);

    // 验证 approve 请求包含 inputData
    expect(capturedBody).toBeTruthy();
    expect(capturedBody.inputData).toBeTruthy();
    expect(capturedBody.inputData.action).toBe('verify');
  });

  test('只读字段使用 FormFieldRenderer 渲染', async ({ authenticatedPage }) => {
    await setupMockRoutes(authenticatedPage);

    await authenticatedPage.goto(`/oa/detail/${MOCK_INSTANCE_ID}`);
    await waitForPageLoad(authenticatedPage);

    // 客户名称应以只读文本形式显示
    await expect(authenticatedPage.locator('text=E2E测试客户(mock)')).toBeVisible();
    // 欠款总额应显示
    await expect(authenticatedPage.locator('text=欠款总额')).toBeVisible();
  });

  test('非当前审批人时不显示操作按钮', async ({ authenticatedPage }) => {
    // 使用一个不同的 assignedUserId，使当前用户不是审批人
    await setupMockRoutes(authenticatedPage, {
      nodes: [
        {
          id: 1, nodeOrder: 1, nodeName: '营销师催收', nodeType: 'role',
          roleCode: 'marketer', assignedUserId: 99999, // 不是当前用户
          assignedUserName: '其他用户', assignedUserAvatar: null,
          status: 'pending', comment: null, actedAt: null, isCountersign: false,
        },
        {
          id: 2, nodeOrder: 2, nodeName: '更新催收状态', nodeType: 'auto',
          roleCode: null, assignedUserId: null, assignedUserName: '系统',
          assignedUserAvatar: null, status: 'pending', comment: null,
          actedAt: null, isCountersign: false,
        },
      ],
    });

    await authenticatedPage.goto(`/oa/detail/${MOCK_INSTANCE_ID}`);
    await waitForPageLoad(authenticatedPage);

    // 操作型按钮不应显示
    await expect(authenticatedPage.locator('button:has-text("完成")')).not.toBeVisible();
    await expect(authenticatedPage.locator('button:has-text("更新")')).not.toBeVisible();
  });
});

// =====================================================
// 真实实例测试：创建 → 测试 → 撤回清理
// =====================================================

const API_URL = process.env.API_URL ?? 'http://localhost:8100';

/**
 * 辅助函数：通过 API 创建催收测试实例
 * @returns { instanceId, marketerUserId } 或 null（创建失败）
 */
async function createTestCollectionInstance(
  apiClient: { post: (path: string, body?: any) => Promise<any>; get: (path: string) => Promise<any> }
): Promise<{ instanceId: number; marketerUserId: number } | null> {
  try {
    // 提交催收审批
    const submitResult = await apiClient.post('/api/oa/instances', {
      formTypeCode: 'ar_collection',
      title: '[E2E测试] 催收操作型节点验证',
      formData: {
        consumerName: 'E2E测试客户',
        totalAmount: 10000,
        billCount: 1,
        maxOverdueDays: 10,
        managerName: 'E2E营销师',
        billDetails: [
          { billNo: 'TEST-BILL-001', billType: '销售单', totalAmount: 10000, leftAmount: 10000, overdueDays: 10 },
        ],
        _extensionCount: 0,
        action: 'verify',
        verifyRemark: 'E2E测试创建',
      },
    });

    const instanceId = submitResult?.data?.instanceId ?? submitResult?.instanceId;
    if (!instanceId) return null;

    // 获取详情，找到被分配的营销师 userId
    const detail = await apiClient.get(`/api/oa/instances/${instanceId}`);
    const detailData = detail?.data ?? detail;
    const marketerNode = (detailData.nodes ?? []).find(
      (n: any) => n.nodeType === 'role' && n.roleCode === 'marketer'
    );
    const marketerUserId = marketerNode?.assignedUserId;

    return { instanceId, marketerUserId };
  } catch {
    return null;
  }
}

/**
 * 辅助函数：撤回并清理测试实例
 */
async function cleanupTestInstance(
  apiClient: { post: (path: string, body?: any) => Promise<any> },
  instanceId: number
): Promise<void> {
  try {
    await apiClient.post(`/api/oa/instances/${instanceId}/withdraw`);
  } catch {
    // 清理失败不阻断（可能已被自动处理）
  }
}

/**
 * 辅助函数：切换到指定用户并返回新 token
 */
async function switchToUser(page: any, userId: number): Promise<string | null> {
  const token = await page.evaluate(async ({ apiUrl, uid }: { apiUrl: string; uid: number }) => {
    const response = await fetch(`${apiUrl}/api/auth/dev-switch`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: uid }),
    });
    const data = await response.json();
    const newToken = data.token ?? data.data?.token;
    if (newToken) {
      localStorage.setItem('auth_token', newToken);
    }
    return newToken ?? null;
  }, { apiUrl: API_URL, uid: userId });
  return token;
}

test.describe('催收OA操作型节点 - 真实实例测试', () => {
  let testInstanceId: number | null = null;
  let testMarketerUserId: number | null = null;

  /**
   * 在页面上下文中执行 API 调用（绕过 Playwright fixture 生命周期限制）
   */
  async function apiCall(page: any, method: string, path: string, body?: any): Promise<any> {
    return page.evaluate(async ({ apiUrl, m, p, b }: any) => {
      const token = localStorage.getItem('auth_token') || '';
      const response = await fetch(`${apiUrl}${p}`, {
        method: m,
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: b ? JSON.stringify(b) : undefined,
      });
      return response.json();
    }, { apiUrl: API_URL, m: method, p: path, b: body });
  }

  test.beforeAll(async ({ browser }) => {
    const context = await browser.newContext();
    const page = await context.newPage();
    try {
      // 先导航到应用域名，确保 localStorage 可用
      await page.goto('http://localhost:3100');
      await page.waitForLoadState('domcontentloaded');

      // 登录
      const loginResult = await page.evaluate(async (apiUrl: string) => {
        const response = await fetch(`${apiUrl}/api/auth/dev-login`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: '{}',
        });
        const data = await response.json();
        const token = data.token ?? data.data?.token;
        if (token) localStorage.setItem('auth_token', token);
        return token;
      }, API_URL);

      if (!loginResult) return;

      // 创建催收实例
      const submitResult = await apiCall(page, 'POST', '/api/oa/instances', {
        formTypeCode: 'ar_collection',
        title: '[E2E测试] 催收操作型节点验证',
        formData: {
          consumerName: 'E2E测试客户',
          totalAmount: 10000,
          billCount: 1,
          maxOverdueDays: 10,
          managerName: 'E2E营销师',
          billDetails: [
            { billNo: 'TEST-BILL-001', billType: '销售单', totalAmount: 10000, leftAmount: 10000, overdueDays: 10 },
          ],
          _extensionCount: 0,
          action: 'verify',
          verifyRemark: 'E2E测试创建',
        },
      });

      const instanceId = submitResult?.data?.instanceId ?? submitResult?.instanceId;
      if (instanceId) {
        testInstanceId = instanceId;

        // 获取详情找到营销师 userId
        const detail = await apiCall(page, 'GET', `/api/oa/instances/${instanceId}`);
        const detailData = detail?.data ?? detail;
        const marketerNode = (detailData.nodes ?? []).find(
          (n: any) => n.nodeType === 'role' && n.roleCode === 'marketer'
        );
        testMarketerUserId = marketerNode?.assignedUserId ?? null;
      }
    } finally {
      await context.close();
    }
  });

  test.afterAll(async ({ browser }) => {
    if (!testInstanceId) return;
    const context = await browser.newContext();
    const page = await context.newPage();
    try {
      // 导航到应用域名
      await page.goto('http://localhost:3100');
      await page.waitForLoadState('domcontentloaded');

      // 登录
      await page.evaluate(async (apiUrl: string) => {
        const response = await fetch(`${apiUrl}/api/auth/dev-login`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: '{}',
        });
        const data = await response.json();
        const token = data.token ?? data.data?.token;
        if (token) localStorage.setItem('auth_token', token);
      }, API_URL);
      // 撤回
      await apiCall(page, 'POST', `/api/oa/instances/${testInstanceId}/withdraw`);
    } finally {
      await context.close();
    }
  });

  test('创建的测试实例在详情页渲染可编辑表单', async ({ authenticatedPage }) => {
    if (!testInstanceId) {
      test.skip();
      return;
    }

    await authenticatedPage.goto(`/oa/detail/${testInstanceId}`);
    await waitForPageLoad(authenticatedPage);

    // 申请人能看到表单数据
    await expect(authenticatedPage.locator('text=E2E测试客户')).toBeVisible();
    await expect(authenticatedPage.locator('text=逾期催收')).toBeVisible();

    // 申请人不是当前审批人 → 操作按钮不显示
    await expect(authenticatedPage.locator('button:has-text("完成")')).not.toBeVisible();
  });

  test('切换到营销师后显示操作型按钮和可编辑表单', async ({ authenticatedPage }) => {
    if (!testInstanceId || !testMarketerUserId) {
      test.skip();
      return;
    }

    // 切换到营销师身份
    await switchToUser(authenticatedPage, testMarketerUserId);
    await authenticatedPage.goto(`/oa/detail/${testInstanceId}`);
    await waitForPageLoad(authenticatedPage);

    // 验证操作型按钮显示
    await expect(authenticatedPage.locator('button:has-text("完成")')).toBeVisible();
    await expect(authenticatedPage.locator('button:has-text("更新")')).toBeVisible();

    // 验证可编辑 select 控件
    const selectControl = authenticatedPage.locator('.ant-select').first();
    await expect(selectControl).toBeVisible();

    // 打开下拉框验证选项过滤
    await selectControl.click();
    await authenticatedPage.waitForTimeout(300);

    const options = authenticatedPage.locator('.ant-select-item-option-content');
    const optionTexts: string[] = [];
    for (let i = 0; i < (await options.count()); i++) {
      const text = await options.nth(i).textContent();
      if (text) optionTexts.push(text);
    }

    expect(optionTexts).toContain('核销标记');
    expect(optionTexts).toContain('申请延期');
    expect(optionTexts).not.toContain('发函');
    expect(optionTexts).not.toContain('起诉');

    // 切回管理员
    await switchToUser(authenticatedPage, 8);
  });

  test('营销师选择操作并提交后 inputData 被正确传递', async ({ authenticatedPage }) => {
    if (!testInstanceId || !testMarketerUserId) {
      test.skip();
      return;
    }

    // 切换到营销师
    await switchToUser(authenticatedPage, testMarketerUserId);
    await authenticatedPage.goto(`/oa/detail/${testInstanceId}`);
    await waitForPageLoad(authenticatedPage);

    // 拦截 approve 请求
    let capturedBody: any = null;
    await authenticatedPage.route('**/api/oa/instances/*/approve', (route: any) => {
      capturedBody = route.request().postDataJSON();
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ code: 200, data: { status: 'processing' }, message: '审批已通过，系统处理中' }),
      });
    });

    // 选择"核销标记"
    const selectControl = authenticatedPage.locator('.ant-select').first();
    await selectControl.click();
    await authenticatedPage.waitForTimeout(300);
    await authenticatedPage.locator('.ant-select-item-option-content:has-text("核销标记")').click();
    await authenticatedPage.waitForTimeout(500);

    // 点击"完成"
    await authenticatedPage.locator('button:has-text("完成")').click();
    await authenticatedPage.waitForTimeout(300);

    // 弹窗确认
    const modalOk = authenticatedPage.locator('.ant-modal .ant-btn-primary');
    if (await modalOk.isVisible()) {
      await modalOk.click();
    }
    await authenticatedPage.waitForTimeout(1000);

    // 验证 approve 请求包含 inputData
    expect(capturedBody).toBeTruthy();
    expect(capturedBody.inputData).toBeTruthy();
    expect(capturedBody.inputData.action).toBe('verify');

    // 切回管理员
    await switchToUser(authenticatedPage, 8);
  });
});
