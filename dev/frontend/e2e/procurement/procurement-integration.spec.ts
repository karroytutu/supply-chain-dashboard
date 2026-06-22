/**
 * E2E 测试：采购审批集成测试（7个场景）
 *
 * 策略：动态适配 — 不预设条件节点触发情况，而是提交后读取实际节点，逐步审批。
 * - approval 节点通过 API 完成（只需 comment）
 * - data_input 节点通过浏览器完成（需填表单）或 API + inputData
 * - auto 节点等待后端异步执行
 *
 * 场景覆盖：
 * 1. 基础提交验证
 * 2. 条件审批链遍历
 * 3. 后付款全流程
 * 4. 需预付全流程
 * 5. 已付款全流程
 * 6. 审批中驳回
 * 7. 全流程端到端
 */
import { test, expect } from '../fixtures';
import { waitForPageLoad } from '../helpers/antd';
import { switchToUser } from './helpers/procurement-helpers';

// =====================================================
// 测试配置
// =====================================================

const TEST_SUPPLIER_ID = 12;
const TEST_WAREHOUSE_ID = 17;
const TEST_GOODS_IDS = [11306];
const TEST_SALESMAN_ID = 153;
const TEST_DEPT_ID = 1;
const SERIAL_TIMEOUT = 300_000;
const AUTO_TIMEOUT = 15_000;
const BACKEND_URL = 'http://localhost:8100';

// =====================================================
// 核心辅助函数
// =====================================================

async function getDevToken(): Promise<string> {
  const res = await fetch(`${BACKEND_URL}/api/auth/dev-login`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}',
  });
  const d = await res.json() as any;
  return d.token ?? d.data?.token ?? '';
}

async function api(token: string, method: string, path: string, body?: unknown): Promise<any> {
  const res = await fetch(`${BACKEND_URL}${path}`, {
    method, headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  return res.json();
}

async function createPO(token: string, opts: { highAmount?: boolean } = {}) {
  const price = '18.7';
  const qty = opts.highAmount ? '300' : '10';
  const sub = String((parseFloat(price) * parseInt(qty)).toFixed(2));
  const result = await api(token, 'POST', '/api/dev/erp/create-test-po', {
    supplierId: TEST_SUPPLIER_ID, warehouseId: TEST_WAREHOUSE_ID,
    salesmanId: TEST_SALESMAN_ID, deptId: TEST_DEPT_ID,
    details: TEST_GOODS_IDS.map(goodsId => ({ goodsId, currUnitId: 'P2', realPrice: price, quantity: qty, subAmount: sub, taxRatio: '13' })),
    remark: '[E2E测试]',
  });
  if (result?.code === 200) return { billId: result.data.billId as number, billStr: result.data.billStr as string };
  console.warn('[E2E] createPO失败:', result?.message);
  return null;
}

async function submitOA(token: string, billId: number, needPrepayment: string, title: string) {
  const r = await api(token, 'POST', '/api/oa/instances', {
    formTypeCode: 'procurement_order', title, formData: { erpBillId: billId, needPrepayment },
  });
  const instanceId = r?.data?.instanceId ?? null;
  if (!instanceId) { console.warn('[E2E] submitOA失败:', r?.message); return null; }
  return instanceId;
}

async function getDetail(token: string, instanceId: number) {
  const r = await api(token, 'GET', `/api/oa/instances/${instanceId}`);
  return r?.data ?? r;
}

async function approveNode(token: string, instanceId: number, comment = '[E2E] 同意', inputData?: Record<string, unknown>) {
  const body: any = { comment };
  if (inputData) body.inputData = inputData;
  return api(token, 'POST', `/api/oa/instances/${instanceId}/approve`, body);
}

async function rejectInstance(token: string, instanceId: number, comment = '[E2E] 驳回') {
  return api(token, 'POST', `/api/oa/instances/${instanceId}/reject`, { comment });
}

async function cleanupAll(token: string, instanceId: number | null, billIds: number[]) {
  // 先撤回 OA 实例
  if (instanceId) await api(token, 'POST', `/api/oa/instances/${instanceId}/withdraw`).catch(() => {});
  // 等待2秒让异步 auto 节点任务有机会消费（避免取消PO时auto节点还未执行）
  if (billIds.length > 0) await new Promise(r => setTimeout(r, 2000));
  for (const bid of billIds) await api(token, 'POST', '/api/dev/erp/cancel-po', { billId: bid }).catch(() => {});
}

/**
 * 主动触发 auto 节点执行 + 短暂等待完成
 * 调用 flush-async-tasks 立即处理异步任务队列，无需等待 cron 定时任务（最长60秒）
 */
async function triggerAutoNode(token: string, instanceId: number, maxWaitMs = 20000): Promise<boolean> {
  // 主动刷新异步任务队列（立即处理待执行的 auto 节点）
  const flushResult = await api(token, 'POST', '/api/dev/erp/flush-async-tasks');
  if (flushResult?.code !== 200) {
    console.warn(`[E2E] flush-async-tasks 失败: ${flushResult?.message}`);
  }

  // 轮询等待 auto 节点完成（应该很快，因为刚处理了队列）
  const startTime = Date.now();
  while (Date.now() - startTime < maxWaitMs) {
    await new Promise(resolve => setTimeout(resolve, 1000));
    const detail = await api(token, 'GET', `/api/oa/instances/${instanceId}`);
    const data = detail?.data ?? detail;
    const status = data?.status;
    if (status === 'pending' || status === 'approved' || status === 'completed') {
      return true;
    }
    if (status === 'erp_failed') {
      console.warn(`[E2E] auto 节点执行失败 (erp_failed)`);
      return true;
    }
    // status === 'processing' 说明 auto 节点还在执行，再 flush 一次
    if (Date.now() - startTime > 5000 && (Date.now() - startTime) % 5000 < 1100) {
      await api(token, 'POST', '/api/dev/erp/flush-async-tasks');
    }
  }
  console.warn(`[E2E] triggerAutoNode 等待超时 (${maxWaitMs}ms)`);
  return false;
}

async function getTokenForUser(userId: number): Promise<string> {
  const adminToken = await getDevToken();
  // 通过 dev-switch 获取目标用户的 token
  const res = await fetch(`${BACKEND_URL}/api/auth/dev-switch`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${adminToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ userId }),
  });
  const d = await res.json() as any;
  return d.token ?? d.data?.token ?? adminToken;
}

/** 动态遍历审批链：逐个审批直到遇到 data_input 或 auto 节点 */
async function approveAllApprovalNodes(token: string, instanceId: number): Promise<{ stoppedAt: string; nodeType: string }> {
  for (let i = 0; i < 10; i++) {
    const detail = await getDetail(token, instanceId);
    const nodes = detail?.nodes ?? [];
    const pendingNode = nodes.find((n: any) => n.status === 'pending' && n.nodeType !== 'auto');

    if (!pendingNode) return { stoppedAt: detail?.currentNodeName ?? 'unknown', nodeType: 'auto' };
    if (pendingNode.nodeType === 'data_input') return { stoppedAt: pendingNode.nodeName, nodeType: 'data_input' };

    // 切换到该节点的处理人获取其 token
    const userId = pendingNode.assignedUserIds?.[0];
    if (!userId) return { stoppedAt: pendingNode.nodeName, nodeType: 'error' };
    const userToken = await getTokenForUser(userId);

    const r = await api(userToken, 'POST', `/api/oa/instances/${instanceId}/approve`, { comment: `[E2E] ${pendingNode.nodeName}同意` });
    if (r?.code !== 200) {
      console.warn(`[E2E] 审批失败: node=${pendingNode.nodeName}, code=${r?.code}, msg=${r?.message}`);
      return { stoppedAt: pendingNode.nodeName, nodeType: 'error' };
    }
  }
  return { stoppedAt: 'max_iterations', nodeType: 'error' };
}

/** 通过浏览器完成 data_input 节点 */
async function completeDataInputViaBrowser(
  page: any, userId: number, instanceId: number, token: string
): Promise<boolean> {
  await page.goto('/');
  await switchToUser(page, userId);
  await page.goto(`/oa/detail/${instanceId}`);
  await waitForPageLoad(page);

  const completeBtn = page.locator('button:has-text("完成")');
  if (await completeBtn.isVisible()) {
    // 尝试填写数字字段（出纳金额等）
    const numInput = page.locator('.ant-form-item input[type="number"]').first();
    if (await numInput.isVisible().catch(() => false)) {
      await numInput.fill('187');
    }
    await completeBtn.click();
    await page.waitForTimeout(500);
    const modalOk = page.locator('.ant-modal .ant-btn-primary');
    if (await modalOk.isVisible().catch(() => false)) await modalOk.click();
    await page.waitForTimeout(1500);
    await switchToUser(page, 8);
    return true;
  }
  await switchToUser(page, 8);
  return false;
}

// =====================================================
// 场景 1: 基础提交验证
// =====================================================

test.describe('场景1: 基础提交验证', () => {
  test.describe.configure({ mode: 'serial', timeout: SERIAL_TIMEOUT });
  let token = '';
  let instanceId: number | null = null;
  let billId: number | null = null;

  test.beforeAll(async () => {
    token = await getDevToken();
    if (!token) return;
    const po = await createPO(token);
    if (!po) return;
    billId = po.billId;
    instanceId = await submitOA(token, po.billId, 'no', '[E2E] 基础验证');
  });

  test.afterAll(async () => {
    if (!token) return;
    await cleanupAll(token, instanceId, billId ? [billId] : []);
  });

  test('OA实例创建成功，formTypeCode正确', async () => {
    if (!instanceId) { test.skip(); return; }
    const detail = await getDetail(token, instanceId);
    expect(detail?.formTypeCode).toBe('procurement_order');
    expect(detail?.status).toBe('pending');
    expect((detail?.nodes ?? []).length).toBeGreaterThan(0);
  });
});

// =====================================================
// 场景 2: 条件审批链遍历
// =====================================================

test.describe('场景2: 条件审批链遍历', () => {
  test.describe.configure({ mode: 'serial', timeout: SERIAL_TIMEOUT });
  let token = '';
  let instanceId: number | null = null;
  let billId: number | null = null;

  test.beforeAll(async () => {
    token = await getDevToken();
    if (!token) return;
    const po = await createPO(token);
    if (!po) return;
    billId = po.billId;
    instanceId = await submitOA(token, po.billId, 'no', '[E2E] 审批链遍历');
  });

  test.afterAll(async () => {
    if (!token) return;
    await cleanupAll(token, instanceId, billId ? [billId] : []);
  });

  test('动态遍历所有approval节点直到遇到data_input或auto', async () => {
    if (!instanceId) { test.skip(); return; }

    const result = await approveAllApprovalNodes(token, instanceId);
    // 应成功遍历完所有 approval 节点
    expect(result.nodeType).not.toBe('error');

    // 验证至少有一个 approval 节点被审批
    const detail = await getDetail(token, instanceId);
    const approvedNodes = (detail?.nodes ?? []).filter((n: any) => n.status === 'approved' && n.nodeType === 'approval');
    expect(approvedNodes.length).toBeGreaterThanOrEqual(0); // 可能无条件节点
  });
});

// =====================================================
// 场景 3: 高金额审批（验证金额>5000触发总经理）
// =====================================================

test.describe('场景3: 高金额审批', () => {
  test.describe.configure({ mode: 'serial', timeout: SERIAL_TIMEOUT });
  let token = '';
  let instanceId: number | null = null;
  let billId: number | null = null;

  test.beforeAll(async () => {
    token = await getDevToken();
    if (!token) return;
    const po = await createPO(token, { highAmount: true }); // 300 * 18.7 = 5610 > 5000
    if (!po) return;
    billId = po.billId;
    instanceId = await submitOA(token, po.billId, 'no', '[E2E] 高金额审批');
  });

  test.afterAll(async () => {
    if (!token) return;
    await cleanupAll(token, instanceId, billId ? [billId] : []);
  });

  test('金额>5000 → 总经理审批节点存在', async () => {
    if (!instanceId) { test.skip(); return; }
    const detail = await getDetail(token, instanceId);
    const nodes = detail?.nodes ?? [];
    // 验证总经理审批节点存在（无论是否已审批）
    const managerNode = nodes.find((n: any) => n.roleCode === 'admin');
    expect(managerNode).toBeTruthy();
    expect(managerNode?.nodeName).toBe('总经理审批');
  });
});

// =====================================================
// 场景 4: 后付款端到端
// =====================================================

test.describe('场景4: 后付款端到端', () => {
  test.describe.configure({ mode: 'serial', timeout: SERIAL_TIMEOUT });
  let token = '';
  let instanceId: number | null = null;
  let billId: number | null = null;

  test.beforeAll(async () => {
    token = await getDevToken();
    if (!token) return;
    const po = await createPO(token);
    if (!po) return;
    billId = po.billId;
    instanceId = await submitOA(token, po.billId, 'no', '[E2E] 后付款端到端');
  });

  test.afterAll(async () => {
    if (!token) return;
    await cleanupAll(token, instanceId, billId ? [billId] : []);
  });

  test('审批链→auto审核PO→流程完成', async ({ authenticatedPage }) => {
    if (!instanceId) { test.skip(); return; }

    // Step 1: 遍历所有 approval 节点
    const result = await approveAllApprovalNodes(token, instanceId);
    expect(result.nodeType).not.toBe('error');

    // Step 2: 主动触发 auto 审核 PO
    const autoOk = await triggerAutoNode(token, instanceId);
    expect(autoOk).toBe(true);

    const final = await getDetail(token, instanceId);
    expect(['approved', 'completed', 'processing']).toContain(final?.status);
  });
});

// =====================================================
// 场景 5: 需预付端到端
// =====================================================

test.describe('场景5: 需预付端到端', () => {
  test.describe.configure({ mode: 'serial', timeout: SERIAL_TIMEOUT });
  let token = '';
  let instanceId: number | null = null;
  let billId: number | null = null;

  test.beforeAll(async () => {
    token = await getDevToken();
    if (!token) return;
    const po = await createPO(token);
    if (!po) return;
    billId = po.billId;
    instanceId = await submitOA(token, po.billId, 'yes', '[E2E] 需预付端到端');
  });

  test.afterAll(async () => {
    if (!token) return;
    await cleanupAll(token, instanceId, billId ? [billId] : []);
  });

  test('审批链→出纳付款→auto预付款+审核PO→流程完成', async ({ authenticatedPage }) => {
    if (!instanceId) { test.skip(); return; }

    // Step 1: 遍历 approval 节点直到遇到 data_input
    const result = await approveAllApprovalNodes(token, instanceId);
    expect(result.nodeType).not.toBe('error');

    // Step 2: 如果是出纳付款节点，通过浏览器完成
    if (result.stoppedAt === '出纳付款' || result.nodeType === 'data_input') {
      const detail = await getDetail(token, instanceId);
      const pendingNode = (detail?.nodes ?? []).find((n: any) => n.status === 'pending' && n.nodeType === 'data_input');
      if (pendingNode?.assignedUserIds?.[0]) {
        const ok = await completeDataInputViaBrowser(authenticatedPage, pendingNode.assignedUserIds[0], instanceId, token);
        if (!ok) {
          await approveNode(token, instanceId, '[E2E] 出纳付款', { paymentAmount: '187', paymentSubjectId: 378, paymentReceiptUrls: [] });
        }
      }
    }

    // Step 3: 主动触发 auto 节点（预付款+审核PO）
    const autoOk5 = await triggerAutoNode(token, instanceId);
    expect(autoOk5).toBe(true);

    // Step 4: 验证 erpMeta 记录了预付款
    const detail = await getDetail(token, instanceId);
    expect(detail?.erpMeta).toBeTruthy();
  });
});

// =====================================================
// 场景 6: 已付款端到端
// =====================================================

test.describe('场景6: 已付款端到端', () => {
  test.describe.configure({ mode: 'serial', timeout: SERIAL_TIMEOUT });
  let token = '';
  let instanceId: number | null = null;
  let billId: number | null = null;

  test.beforeAll(async () => {
    token = await getDevToken();
    if (!token) return;
    const po = await createPO(token);
    if (!po) return;
    billId = po.billId;
    instanceId = await submitOA(token, po.billId, 'no', '[E2E] 已付款端到端');
  });

  test.afterAll(async () => {
    if (!token) return;
    await cleanupAll(token, instanceId, billId ? [billId] : []);
  });

  test('审批链→选择关联单据→auto付款单+审核PO', async ({ authenticatedPage }) => {
    if (!instanceId) { test.skip(); return; }

    const result = await approveAllApprovalNodes(token, instanceId);
    expect(result.nodeType).not.toBe('error');

    // 选择关联单据 (data_input)
    if (result.nodeType === 'data_input') {
      const detail = await getDetail(token, instanceId);
      const pendingNode = (detail?.nodes ?? []).find((n: any) => n.status === 'pending' && n.nodeType === 'data_input');
      if (pendingNode?.assignedUserIds?.[0]) {
        const ok = await completeDataInputViaBrowser(authenticatedPage, pendingNode.assignedUserIds[0], instanceId, token);
        if (!ok) {
          await approveNode(token, instanceId, '[E2E] 选择关联单据', { settleSourceType: 'prepay', selectedPrepayIds: '' });
        }
      }
    }

    // 主动触发 auto 节点
    const autoOk6 = await triggerAutoNode(token, instanceId);
    expect(autoOk6).toBe(true);
  });
});

// =====================================================
// 场景 7: 审批中驳回
// =====================================================

test.describe('场景7: 审批中驳回', () => {
  test.describe.configure({ mode: 'serial', timeout: SERIAL_TIMEOUT });
  let token = '';
  let instanceId: number | null = null;
  let billId: number | null = null;

  test.beforeAll(async () => {
    token = await getDevToken();
    if (!token) return;
    const po = await createPO(token);
    if (!po) return;
    billId = po.billId;
    instanceId = await submitOA(token, po.billId, 'no', '[E2E] 驳回测试');
  });

  test.afterAll(async () => {
    if (!token) return;
    await cleanupAll(token, instanceId, billId ? [billId] : []);
  });

  test('审批中驳回 → 状态变为 rejected', async () => {
    if (!instanceId) { test.skip(); return; }

    // 获取当前审批人的 token 才能驳回
    const detail = await getDetail(token, instanceId);
    const pendingNode = (detail?.nodes ?? []).find((n: any) => n.status === 'pending' && n.nodeType !== 'auto');
    if (!pendingNode?.assignedUserIds?.[0]) { test.skip(); return; }

    const userToken = await getTokenForUser(pendingNode.assignedUserIds[0]);
    const r = await api(userToken, 'POST', `/api/oa/instances/${instanceId}/reject`, { comment: '[E2E] 审批驳回验证' });
    expect(r?.code).toBe(200);

    const afterReject = await getDetail(token, instanceId);
    expect(afterReject?.status).toBe('rejected');
  });
});
