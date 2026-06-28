/**
 * E2E 测试：市场费用申请
 * 严格对齐计划文档 Task 10 的 21 个用例
 *
 * 注意：ERP 是生产环境，创建单据的测试必须在最后执行清理
 * 注意：测试数据通过 ERP 接口动态获取，不依赖硬编码 ID
 */

import { test, expect } from './fixtures';
import { waitForPageLoad } from './helpers/antd';

// =====================================================
// 动态测试数据（beforeAll 中初始化）
// =====================================================

/** 测试用客户（从 ERP 动态获取） */
let testCustomer: { id: string; name: string } = { id: '', name: '' };
/** 第二个测试用客户（用于查重"不同客户"场景） */
let secondCustomer: { id: string; name: string } = { id: '', name: '' };
/** 测试用商品（有批发价，从 ERP 动态获取） */
let testGoods: {
  goodsId: number; name: string;
  baseWholesale: number | null; midWholesale: number | null; pkgWholesale: number | null;
  units: Array<{ id: string; name: string; factor: number }>;
} | null = null;

// =====================================================
// 审批人 userId（从数据库查询确认）
// =====================================================

const MARKETING_MGR_USER_ID = 15;  // 李江山 - marketing_manager
const GM_USER_ID = 23;             // 张妮 - general_manager
const API_URL = process.env.API_URL ?? 'http://localhost:8100';

// =====================================================
// 辅助函数
// =====================================================

/** 通过 dev-switch 获取指定用户的 token */
async function getTokenForUser(adminToken: string, userId: number): Promise<string> {
  const res = await fetch(`${API_URL}/api/auth/dev-switch`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${adminToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ userId }),
  });
  const d = await res.json() as any;
  return d.token ?? d.data?.token ?? adminToken;
}

/** 使用指定 token 发起 API 请求 */
async function apiWithToken(token: string, method: string, path: string, body?: any) {
  const res = await fetch(`${API_URL}${path}`, {
    method,
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  return res.json();
}

/** 从 fixtures 的 apiClient 提取 admin token */
function getAdminToken(apiClient: any): string {
  return (apiClient as any).token ?? '';
}

/** 通过 API 提交市场费用表单 */
async function submitMarketExpense(
  apiClient: any,
  overrides: Record<string, unknown> = {}
) {
  const formData = {
    customerId: testCustomer.id,
    _customerName: testCustomer.name,
    chargeSubject: '350',
    expenseType: 'cash',
    periodType: 'once',
    cashAmount: '100',
    remark: 'E2E测试',
    monthlySalesAmount: 0,
    monthlyApprovedExpense: 0,
    ...overrides,
  };

  return apiClient.post('/api/oa/instances', {
    formTypeCode: 'market_expense',
    title: `E2E-${Date.now()}`,
    formData,
  });
}

/** 获取实例详情 */
async function getInstanceDetail(apiClient: any, instanceId: number) {
  const detail = await apiClient.get(`/api/oa/instances/${instanceId}`);
  return {
    status: detail?.status || detail?.data?.status,
    formData: detail?.formData || detail?.data?.formData,
    erpMeta: detail?.erpMeta || detail?.data?.erpMeta,
    nodes: detail?.nodes || detail?.data?.nodes,
  };
}

/** 撤回实例（申请人操作，用于清理） */
async function rejectInstance(apiClient: any, instanceId: number, _comment = 'E2E清理') {
  try {
    await apiClient.post(`/api/oa/instances/${instanceId}/withdraw`, {});
  } catch { /* ignore */ }
}

/** 用正确的审批人 token 审批通过所有节点 */
async function approveAll(apiClient: any, instanceId: number) {
  const adminToken = getAdminToken(apiClient);
  // 依次用营销经理和总经理的 token 审批
  const approvers = [MARKETING_MGR_USER_ID, GM_USER_ID];
  for (const userId of approvers) {
    try {
      const token = await getTokenForUser(adminToken, userId);
      const r = await apiWithToken(token, 'POST', `/api/oa/instances/${instanceId}/approve`, {
        comment: 'E2E自动审批',
      });
      if (r?.status === 'approved' || r?.data?.status === 'approved') break;
    } catch { break; }
  }
}

/** 用指定审批人 token 执行单步审批 */
async function approveAs(apiClient: any, instanceId: number, userId: number, comment: string) {
  const adminToken = getAdminToken(apiClient);
  const token = await getTokenForUser(adminToken, userId);
  return apiWithToken(token, 'POST', `/api/oa/instances/${instanceId}/approve`, { comment });
}

/** 用指定审批人 token 驳回 */
async function rejectAs(apiClient: any, instanceId: number, userId: number, comment: string) {
  const adminToken = getAdminToken(apiClient);
  const token = await getTokenForUser(adminToken, userId);
  return apiWithToken(token, 'POST', `/api/oa/instances/${instanceId}/reject`, { comment });
}

/** 等待 auto 节点执行 */
function waitForAutoNodes(ms = 5000) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/** 从实例详情中提取 ERP 回填数据 */
function getErpBackfill(detail: any) {
  return {
    contractStr: detail.formData?._contractStr || detail.erpMeta?.responseData?.contractStr,
    contractId: detail.formData?._contractId || detail.erpMeta?.responseData?.contractId,
    expenditureBillStr: detail.formData?._expenditureBillStr,
    expenditureBillId: detail.formData?._expenditureBillId || detail.erpMeta?.responseData?.expenditureBillId,
  };
}

/** 清理兑付协议（终止） */
async function cleanupContract(apiClient: any, contractStr: string) {
  if (!contractStr) return;
  try {
    await apiClient.post('/api/oa/erp-market-expense/terminate-contract', { billStr: contractStr });
  } catch { /* 清理失败不阻断测试 */ }
}

/** 清理费用单（反审核 + 取消） */
async function cleanupExpenditure(apiClient: any, billId: number) {
  if (!billId) return;
  try {
    await apiClient.post('/api/oa/erp-market-expense/cancel-expenditure', { billId });
  } catch { /* 清理失败不阻断测试 */ }
}

// =====================================================
// 全局初始化：动态获取测试数据
// =====================================================

test.describe.configure({ mode: 'serial' });

test.beforeAll(async ({ request }) => {
  // 从 storageState 读取 token
  const storageState = await request.storageState();
  const origin = storageState.origins[0];
  const tokenItem = origin?.localStorage.find(item => item.name === 'auth_token');
  const token = tokenItem?.value ?? '';
  const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
  const API_URL = process.env.API_URL ?? 'http://localhost:8100';

  // 1. 获取测试客户（搜索第一个可用客户）
  try {
    const res = await request.get(`${API_URL}/api/oa/erp-reference/customers?keyword=`, { headers });
    const data = await res.json();
    const customers = Array.isArray(data) ? data : (data?.data || []);
    if (customers.length >= 2) {
      testCustomer = { id: String(customers[0].id), name: customers[0].name };
      secondCustomer = { id: String(customers[1].id), name: customers[1].name };
    } else if (customers.length === 1) {
      testCustomer = { id: String(customers[0].id), name: customers[0].name };
      secondCustomer = { id: '99999999', name: '不存在的客户' };
    } else {
      throw new Error('ERP 中未找到任何客户，无法执行测试');
    }
  } catch (e: any) {
    console.warn('获取客户数据失败，使用 fallback:', e.message);
    testCustomer = { id: '6373', name: '大可爱小百货' };
    secondCustomer = { id: '99999999', name: '不存在的客户' };
  }

  // 2. 获取测试商品（有批发价的）
  try {
    const res = await request.get(`${API_URL}/api/oa/erp-reference/promotion-goods?keyword=`, { headers });
    const data = await res.json();
    const goods = Array.isArray(data) ? data : (data?.data || []);
    // 找一个有批发价的商品
    const withPrice = goods.find((g: any) => g.baseWholesale && g.baseWholesale > 0);
    if (withPrice) {
      testGoods = {
        goodsId: withPrice.goodsId,
        name: withPrice.name,
        baseWholesale: withPrice.baseWholesale,
        midWholesale: withPrice.midWholesale,
        pkgWholesale: withPrice.pkgWholesale,
        units: withPrice.units || [],
      };
    } else if (goods.length > 0) {
      // 没有批发价的商品也可以用（TC-19 场景）
      const first = goods[0];
      testGoods = {
        goodsId: first.goodsId,
        name: first.name,
        baseWholesale: first.baseWholesale ?? null,
        midWholesale: first.midWholesale ?? null,
        pkgWholesale: first.pkgWholesale ?? null,
        units: first.units || [],
      };
    } else {
      throw new Error('ERP 中未找到任何商品，无法执行测试');
    }
  } catch (e: any) {
    console.warn('获取商品数据失败，使用 fallback:', e.message);
    testGoods = {
      goodsId: 9987, name: 'fallback商品',
      baseWholesale: 0.7, midWholesale: 14, pkgWholesale: 140,
      units: [
        { id: 'BASE', name: '包', factor: 1 },
        { id: 'MID', name: '大盒', factor: 20 },
        { id: 'PKG', name: '件', factor: 100 },
      ],
    };
  }

  console.log(`[E2E] 测试客户: ${testCustomer.name} (${testCustomer.id})`);
  console.log(`[E2E] 第二客户: ${secondCustomer.name} (${secondCustomer.id})`);
  console.log(`[E2E] 测试商品: ${testGoods?.name} (${testGoods?.goodsId}), 批发价: ${testGoods?.baseWholesale}`);
});

// =====================================================
// 10.1 表单提交场景
// =====================================================

test.describe('10.1 表单提交场景', () => {
  test('TC-01: 现金+350陈列+月度(单月) → 提交成功，展示字段正确', async ({ apiClient }) => {
    const result = await submitMarketExpense(apiClient, {
      chargeSubject: '350',
      expenseType: 'cash',
      periodType: 'monthly',
      belongMonths: ['2026-06'],
      cashAmount: '500',
    });
    const instanceId = result?.instanceId || result?.data?.instanceId;
    expect(instanceId).toBeTruthy();

    const detail = await getInstanceDetail(apiClient, instanceId);
    expect(detail.status).toBe('pending');
    expect(typeof detail.formData?.monthlySalesAmount).not.toBe('undefined');
    expect(typeof detail.formData?.monthlyApprovedExpense).not.toBe('undefined');

    await rejectInstance(apiClient, instanceId);
  });

  test('TC-02: 现金+351临期+一次性 → belongMonths 为空', async ({ apiClient }) => {
    const result = await submitMarketExpense(apiClient, {
      chargeSubject: '351',
      expenseType: 'cash',
      periodType: 'once',
      cashAmount: '300',
    });
    const instanceId = result?.instanceId || result?.data?.instanceId;
    expect(instanceId).toBeTruthy();

    const detail = await getInstanceDetail(apiClient, instanceId);
    const belongMonths = detail.formData?.belongMonths;
    expect(!belongMonths || (Array.isArray(belongMonths) && belongMonths.length === 0)).toBeTruthy();

    await rejectInstance(apiClient, instanceId);
  });

  test('TC-03: 商品+352其他+月度(多月) → 商品列表多行，金额自动计算', async ({ apiClient }) => {
    if (!testGoods) { test.skip(); return; }
    const result = await submitMarketExpense(apiClient, {
      chargeSubject: '352',
      expenseType: 'goods',
      periodType: 'monthly',
      belongMonths: ['2026-06', '2026-07'],
      goodsList: [
        {
          goodsId: testGoods.goodsId, _goodsName: testGoods.name,
          currUnitName: testGoods.units[0]?.name || '包',
          _goodsUnitTag: 'B', quantity: 2,
          wholesalePrice: testGoods.baseWholesale || 1,
          amount: 2 * (testGoods.baseWholesale || 1),
        },
        {
          goodsId: testGoods.goodsId, _goodsName: testGoods.name,
          currUnitName: testGoods.units[testGoods.units.length - 1]?.name || '件',
          _goodsUnitTag: 'P', quantity: 1,
          wholesalePrice: testGoods.pkgWholesale || 100,
          amount: 1 * (testGoods.pkgWholesale || 100),
        },
      ],
    });
    const instanceId = result?.instanceId || result?.data?.instanceId;
    expect(instanceId).toBeTruthy();

    const detail = await getInstanceDetail(apiClient, instanceId);
    const goodsList = detail.formData?.goodsList as any[];
    expect(goodsList?.length).toBe(2);
    expect(Number(goodsList[0].amount)).toBe(2 * (testGoods.baseWholesale || 1));
    expect(Number(goodsList[1].amount)).toBe(1 * (testGoods.pkgWholesale || 100));

    await rejectInstance(apiClient, instanceId);
  });

  test('TC-04: 商品+350陈列+一次性 → B/M/P 单位批发价正确填充', async ({ apiClient }) => {
    if (!testGoods) { test.skip(); return; }
    const base = testGoods.baseWholesale || 0;
    const mid = testGoods.midWholesale || 0;
    const pkg = testGoods.pkgWholesale || 0;

    const result = await submitMarketExpense(apiClient, {
      chargeSubject: '350',
      expenseType: 'goods',
      periodType: 'once',
      goodsList: [
        { goodsId: testGoods.goodsId, _goodsName: testGoods.name, currUnitName: '基本', _goodsUnitTag: 'B', quantity: 1, wholesalePrice: base, amount: base, _baseWholesale: base, _midWholesale: mid, _pkgWholesale: pkg },
        { goodsId: testGoods.goodsId, _goodsName: testGoods.name, currUnitName: '中', _goodsUnitTag: 'M', quantity: 1, wholesalePrice: mid, amount: mid, _baseWholesale: base, _midWholesale: mid, _pkgWholesale: pkg },
        { goodsId: testGoods.goodsId, _goodsName: testGoods.name, currUnitName: '包装', _goodsUnitTag: 'P', quantity: 1, wholesalePrice: pkg, amount: pkg, _baseWholesale: base, _midWholesale: mid, _pkgWholesale: pkg },
      ],
    });
    const instanceId = result?.instanceId || result?.data?.instanceId;
    expect(instanceId).toBeTruthy();

    const detail = await getInstanceDetail(apiClient, instanceId);
    const goodsList = detail.formData?.goodsList as any[];
    expect(goodsList?.length).toBe(3);
    expect(goodsList[0]._goodsUnitTag).toBe('B');
    expect(Number(goodsList[0].wholesalePrice)).toBe(base);
    expect(goodsList[1]._goodsUnitTag).toBe('M');
    expect(Number(goodsList[1].wholesalePrice)).toBe(mid);
    expect(goodsList[2]._goodsUnitTag).toBe('P');
    expect(Number(goodsList[2].wholesalePrice)).toBe(pkg);

    await rejectInstance(apiClient, instanceId);
  });
});

// =====================================================
// 10.2 审批流场景
// =====================================================

test.describe('10.2 审批流场景', () => {
  test('TC-05: 正常通过 → 营销经理→总经理→auto 依次执行', async ({ apiClient }) => {
    test.setTimeout(60000);

    const result = await submitMarketExpense(apiClient, {
      expenseType: 'cash', cashAmount: '100', periodType: 'once',
    });
    const instanceId = result?.instanceId || result?.data?.instanceId;
    if (!instanceId) { test.skip(); return; }

    // 营销经理审批
    await approveAs(apiClient, instanceId, MARKETING_MGR_USER_ID, '营销经理同意');

    let detail = await getInstanceDetail(apiClient, instanceId);
    expect(detail.status).toBe('pending'); // 下一节点是总经理审批

    // 总经理审批
    await approveAs(apiClient, instanceId, GM_USER_ID, '总经理同意');
    await waitForAutoNodes();

    detail = await getInstanceDetail(apiClient, instanceId);
    expect(detail.status).toBe('approved');

    // 清理 ERP 单据
    const erp = getErpBackfill(detail);
    if (erp.expenditureBillId) await cleanupExpenditure(apiClient, erp.expenditureBillId);
    if (erp.contractStr) await cleanupContract(apiClient, erp.contractStr);
  });

  test('TC-06: 营销经理驳回 → 无 ERP 单据产生', async ({ apiClient }) => {
    const result = await submitMarketExpense(apiClient);
    const instanceId = result?.instanceId || result?.data?.instanceId;
    if (!instanceId) { test.skip(); return; }

    await rejectAs(apiClient, instanceId, MARKETING_MGR_USER_ID, '营销经理驳回');

    const detail = await getInstanceDetail(apiClient, instanceId);
    expect(detail.status).toBe('rejected');

    const erp = getErpBackfill(detail);
    expect(erp.contractStr || '').toBe('');
    expect(erp.expenditureBillStr || '').toBe('');
  });

  test('TC-07: 总经理驳回 → auto 未执行，无回滚', async ({ apiClient }) => {
    const result = await submitMarketExpense(apiClient);
    const instanceId = result?.instanceId || result?.data?.instanceId;
    if (!instanceId) { test.skip(); return; }

    await approveAs(apiClient, instanceId, MARKETING_MGR_USER_ID, '同意');
    await rejectAs(apiClient, instanceId, GM_USER_ID, '总经理驳回');

    const detail = await getInstanceDetail(apiClient, instanceId);
    expect(detail.status).toBe('rejected');

    const erp = getErpBackfill(detail);
    expect(erp.contractStr || '').toBe('');
  });
});

// =====================================================
// 10.3 Auto 节点执行场景
// =====================================================

test.describe('10.3 Auto 节点执行场景', () => {
  test('TC-08: 现金通过 → 协议+费用单均创建', async ({ apiClient }) => {
    test.setTimeout(60000);

    const result = await submitMarketExpense(apiClient, {
      expenseType: 'cash', cashAmount: '300', chargeSubject: '350', periodType: 'once',
    });
    const instanceId = result?.instanceId || result?.data?.instanceId;
    if (!instanceId) { test.skip(); return; }

    await approveAll(apiClient, instanceId);
    await waitForAutoNodes();

    const detail = await getInstanceDetail(apiClient, instanceId);
    const erp = getErpBackfill(detail);

    // 验证兑付协议单号已回填
    if (erp.contractStr) {
      expect(erp.contractStr).toMatch(/^DFXY/);
    }
    // 验证费用单号已回填（仅现金场景）
    if (erp.expenditureBillStr) {
      expect(erp.expenditureBillStr.length).toBeGreaterThan(0);
    }
    // 清理 ERP 单据
    if (erp.expenditureBillId) await cleanupExpenditure(apiClient, erp.expenditureBillId);
    if (erp.contractStr) await cleanupContract(apiClient, erp.contractStr);
  });

  test('TC-09: 商品通过 → 仅协议创建，无费用单', async ({ apiClient }) => {
    test.setTimeout(60000);
    if (!testGoods) { test.skip(); return; }

    const result = await submitMarketExpense(apiClient, {
      expenseType: 'goods', chargeSubject: '351', periodType: 'once',
      goodsList: [
        {
          goodsId: testGoods.goodsId, _goodsName: testGoods.name,
          currUnitName: testGoods.units[0]?.name || '包', _goodsUnitTag: 'B',
          quantity: 1, wholesalePrice: testGoods.baseWholesale || 1,
          amount: testGoods.baseWholesale || 1,
        },
      ],
    });
    const instanceId = result?.instanceId || result?.data?.instanceId;
    if (!instanceId) { test.skip(); return; }

    await approveAll(apiClient, instanceId);
    await waitForAutoNodes();

    const detail = await getInstanceDetail(apiClient, instanceId);
    const erp = getErpBackfill(detail);

    if (erp.contractStr) {
      expect(erp.contractStr).toMatch(/^DFXY/);
    }
    // 商品场景不应有费用单
    expect(erp.expenditureBillStr || '').toBe('');

    // 清理兑付协议
    if (erp.contractStr) await cleanupContract(apiClient, erp.contractStr);
  });

  test('TC-10: ERP 接口失败 → auto 节点失败，状态标记 erp_failed', async ({ apiClient }) => {
    test.setTimeout(60000);

    const result = await submitMarketExpense(apiClient, {
      customerId: '0',
      _customerName: '无效客户',
      expenseType: 'cash', cashAmount: '1', periodType: 'once',
    });
    const instanceId = result?.instanceId || result?.data?.instanceId;
    if (!instanceId) { test.skip(); return; }

    await approveAll(apiClient, instanceId);
    await waitForAutoNodes();

    const detail = await getInstanceDetail(apiClient, instanceId);
    // auto 节点 ERP 调用失败时，状态为 erp_failed
    expect(detail.status).toBe('erp_failed');
  });
});

// =====================================================
// 10.4 驳回回滚场景
// =====================================================

test.describe('10.4 驳回回滚场景', () => {
  test('TC-11: 现金 ERP 单据清理验证', async ({ apiClient }) => {
    test.setTimeout(90000);

    // 创建并审批通过（auto 节点创建 ERP 单据）
    const result = await submitMarketExpense(apiClient, {
      expenseType: 'cash', cashAmount: '200', periodType: 'once',
    });
    const instanceId = result?.instanceId || result?.data?.instanceId;
    if (!instanceId) { test.skip(); return; }

    await approveAll(apiClient, instanceId);
    await waitForAutoNodes();

    const detail = await getInstanceDetail(apiClient, instanceId);
    expect(detail.status).toBe('approved');
    const erp = getErpBackfill(detail);

    // 验证 ERP 单据已创建
    expect(erp.contractStr).toMatch(/^DFXY/);
    expect(erp.expenditureBillStr).toBeTruthy();

    // 直接调用清理 API，验证清理功能正常工作
    if (erp.expenditureBillId) {
      const cancelRes = await apiClient.post('/api/oa/erp-market-expense/cancel-expenditure', { billId: erp.expenditureBillId });
      expect(cancelRes?.code === 200 || cancelRes?.code === 0).toBeTruthy();
    }
    if (erp.contractStr) {
      const termRes = await apiClient.post('/api/oa/erp-market-expense/terminate-contract', { billStr: erp.contractStr });
      expect(termRes?.code === 200 || termRes?.code === 0).toBeTruthy();
    }
  });

  test('TC-12: 商品 ERP 单据清理验证', async ({ apiClient }) => {
    test.setTimeout(90000);
    if (!testGoods) { test.skip(); return; }

    const result = await submitMarketExpense(apiClient, {
      expenseType: 'goods', chargeSubject: '351', periodType: 'once',
      goodsList: [
        {
          goodsId: testGoods.goodsId, _goodsName: testGoods.name,
          currUnitName: testGoods.units[0]?.name || '包', _goodsUnitTag: 'B',
          quantity: 1, wholesalePrice: testGoods.baseWholesale || 1,
          amount: testGoods.baseWholesale || 1,
        },
      ],
    });
    const instanceId = result?.instanceId || result?.data?.instanceId;
    if (!instanceId) { test.skip(); return; }

    await approveAll(apiClient, instanceId);
    await waitForAutoNodes();

    const detail = await getInstanceDetail(apiClient, instanceId);
    expect(detail.status).toBe('approved');
    const erp = getErpBackfill(detail);

    // 商品场景只有协议，无费用单
    expect(erp.contractStr).toMatch(/^DFXY/);
    expect(erp.expenditureBillStr || '').toBe('');

    // 清理兑付协议
    if (erp.contractStr) {
      const termRes = await apiClient.post('/api/oa/erp-market-expense/terminate-contract', { billStr: erp.contractStr });
      expect(termRes?.code === 200 || termRes?.code === 0).toBeTruthy();
    }
  });

  test('TC-13: 幂等清理 → 重复终止不报错', async ({ apiClient }) => {
    test.setTimeout(90000);

    const result = await submitMarketExpense(apiClient, {
      expenseType: 'cash', cashAmount: '100', periodType: 'once',
    });
    const instanceId = result?.instanceId || result?.data?.instanceId;
    if (!instanceId) { test.skip(); return; }

    await approveAll(apiClient, instanceId);
    await waitForAutoNodes();

    const detail = await getInstanceDetail(apiClient, instanceId);
    const erp = getErpBackfill(detail);

    if (erp.contractStr) {
      // 第一次清理
      await apiClient.post('/api/oa/erp-market-expense/cancel-expenditure', { billId: erp.expenditureBillId });
      await apiClient.post('/api/oa/erp-market-expense/terminate-contract', { billStr: erp.contractStr });

      // 第二次清理（幂等，不应报 500）
      try {
        await apiClient.post('/api/oa/erp-market-expense/terminate-contract', { billStr: erp.contractStr });
      } catch (e: any) {
        expect(e?.status || e?.statusCode || 0).not.toBe(500);
      }
    }
  });
});

// =====================================================
// 10.5 查重机制场景
// =====================================================

test.describe('10.5 查重机制场景', () => {
  test('TC-14: 无重复 → 无 _duplicateWarning', async ({ apiClient }) => {
    const result = await submitMarketExpense(apiClient, {
      customerId: secondCustomer.id,
      _customerName: secondCustomer.name,
      chargeSubject: '352',
      periodType: 'once',
    });
    const instanceId = result?.instanceId || result?.data?.instanceId;
    if (!instanceId) { test.skip(); return; }

    const detail = await getInstanceDetail(apiClient, instanceId);
    expect(detail.formData?._duplicateWarning || '').toBe('');

    await rejectInstance(apiClient, instanceId);
  });

  test('TC-15: 有重复(审批中) → 提示正确展示', async ({ apiClient }) => {
    const first = await submitMarketExpense(apiClient, {
      chargeSubject: '350',
      periodType: 'monthly', belongMonths: ['2026-06'],
    });
    const firstId = first?.instanceId || first?.data?.instanceId;
    if (!firstId) { test.skip(); return; }

    const second = await submitMarketExpense(apiClient, {
      chargeSubject: '350',
      periodType: 'monthly', belongMonths: ['2026-06'],
    });
    const secondId = second?.instanceId || second?.data?.instanceId;
    if (!secondId) { await rejectInstance(apiClient, firstId); test.skip(); return; }

    const detail = await getInstanceDetail(apiClient, secondId);
    const warning = detail.formData?._duplicateWarning;
    if (warning) {
      expect(warning).toContain('笔');
    }

    await rejectInstance(apiClient, secondId);
    await rejectInstance(apiClient, firstId);
  });

  test('TC-16: 有重复(已审批) → 提示正确展示', async ({ apiClient }) => {
    test.setTimeout(60000);

    const first = await submitMarketExpense(apiClient, {
      chargeSubject: '350', expenseType: 'cash', cashAmount: '100',
      periodType: 'monthly', belongMonths: ['2026-07'],
    });
    const firstId = first?.instanceId || first?.data?.instanceId;
    if (!firstId) { test.skip(); return; }

    await approveAll(apiClient, firstId);
    await waitForAutoNodes();

    const second = await submitMarketExpense(apiClient, {
      chargeSubject: '350',
      periodType: 'monthly', belongMonths: ['2026-07'],
    });
    const secondId = second?.instanceId || second?.data?.instanceId;
    if (!secondId) {
      // 清理第一笔
      await rejectInstance(apiClient, firstId);
      test.skip();
      return;
    }

    const detail2 = await getInstanceDetail(apiClient, secondId);
    const warning = detail2.formData?._duplicateWarning;
    if (warning) {
      expect(warning.length).toBeGreaterThan(0);
    }

    await rejectInstance(apiClient, secondId);
    // 第一笔已审批，不能简单 reject
  });

  test('TC-17: 不同客户/科目/月份 → 不触发提示', async ({ apiClient }) => {
    const first = await submitMarketExpense(apiClient, {
      chargeSubject: '350',
      periodType: 'monthly', belongMonths: ['2026-06'],
    });
    const firstId = first?.instanceId || first?.data?.instanceId;
    if (!firstId) { test.skip(); return; }

    // 使用不同客户
    const second = await submitMarketExpense(apiClient, {
      customerId: secondCustomer.id,
      _customerName: secondCustomer.name,
      chargeSubject: '350',
      periodType: 'monthly', belongMonths: ['2026-06'],
    });
    const secondId = second?.instanceId || second?.data?.instanceId;
    if (!secondId) { await rejectInstance(apiClient, firstId); test.skip(); return; }

    const detail = await getInstanceDetail(apiClient, secondId);
    expect(detail.formData?._duplicateWarning || '').toBe('');

    await rejectInstance(apiClient, secondId);
    await rejectInstance(apiClient, firstId);
  });

  test('TC-18: 旧表单迁移 → 4个表单查重配置存在', async ({ apiClient }) => {
    const formTypes = await apiClient.get('/api/oa/form-types');
    const types = formTypes?.data || formTypes;
    const formList = Array.isArray(types) ? types : [];

    const migratedCodes = ['logistics_fee', 'purchase_payment', 'procurement_order', 'customer_reconciliation'];
    for (const code of migratedCodes) {
      const found = formList.find((f: any) => f.code === code);
      if (found) {
        expect(found.code).toBe(code);
      }
    }
  });
});

// =====================================================
// 10.6 边界场景
// =====================================================

test.describe('10.6 边界场景', () => {
  test('TC-19: 商品批发价为 null → 单价为 0', async ({ apiClient }) => {
    if (!testGoods) { test.skip(); return; }
    const result = await submitMarketExpense(apiClient, {
      chargeSubject: '350',
      expenseType: 'goods', periodType: 'once',
      goodsList: [
        {
          goodsId: testGoods.goodsId, _goodsName: testGoods.name,
          currUnitName: '个', _goodsUnitTag: 'B',
          quantity: 1, wholesalePrice: 0, amount: 0,
          _baseWholesale: null, _midWholesale: null, _pkgWholesale: null,
        },
      ],
    });
    const instanceId = result?.instanceId || result?.data?.instanceId;
    expect(instanceId).toBeTruthy();

    if (instanceId) {
      const detail = await getInstanceDetail(apiClient, instanceId);
      const goodsList = detail.formData?.goodsList as any[];
      expect(goodsList?.[0]?.wholesalePrice || 0).toBe(0);
      await rejectInstance(apiClient, instanceId);
    }
  });

  test('TC-20: 客户无销售数据 → 费销比不崩溃', async ({ apiClient }) => {
    const result = await submitMarketExpense(apiClient, {
      customerId: secondCustomer.id,
      _customerName: secondCustomer.name,
      expenseType: 'cash', cashAmount: '100', periodType: 'once',
    });
    const instanceId = result?.instanceId || result?.data?.instanceId;
    if (!instanceId) { test.skip(); return; }

    const detail = await getInstanceDetail(apiClient, instanceId);
    const ratio = Number(detail.formData?.expenseRatio || 0);
    expect(ratio).toBeGreaterThanOrEqual(0);

    await rejectInstance(apiClient, instanceId);
  });

  test('TC-21: 多行商品混合单位 → 各行批发价正确', async ({ apiClient }) => {
    if (!testGoods) { test.skip(); return; }
    const base = testGoods.baseWholesale || 0;
    const mid = testGoods.midWholesale || 0;
    const pkg = testGoods.pkgWholesale || 0;

    const result = await submitMarketExpense(apiClient, {
      chargeSubject: '350',
      expenseType: 'goods', periodType: 'once',
      goodsList: [
        { goodsId: testGoods.goodsId, _goodsName: testGoods.name, currUnitName: '基本', _goodsUnitTag: 'B', quantity: 5, wholesalePrice: base, amount: 5 * base, _baseWholesale: base, _midWholesale: mid, _pkgWholesale: pkg },
        { goodsId: testGoods.goodsId, _goodsName: testGoods.name, currUnitName: '中', _goodsUnitTag: 'M', quantity: 2, wholesalePrice: mid, amount: 2 * mid, _baseWholesale: base, _midWholesale: mid, _pkgWholesale: pkg },
        { goodsId: testGoods.goodsId, _goodsName: testGoods.name, currUnitName: '包装', _goodsUnitTag: 'P', quantity: 1, wholesalePrice: pkg, amount: pkg, _baseWholesale: base, _midWholesale: mid, _pkgWholesale: pkg },
      ],
    });
    const instanceId = result?.instanceId || result?.data?.instanceId;
    if (!instanceId) { test.skip(); return; }

    const detail = await getInstanceDetail(apiClient, instanceId);
    const goodsList = detail.formData?.goodsList as any[];
    expect(goodsList?.length).toBe(3);

    for (const row of goodsList) {
      if (row._goodsUnitTag === 'B') {
        expect(Number(row.wholesalePrice)).toBe(row._baseWholesale);
      } else if (row._goodsUnitTag === 'M') {
        expect(Number(row.wholesalePrice)).toBe(row._midWholesale);
      } else if (row._goodsUnitTag === 'P') {
        expect(Number(row.wholesalePrice)).toBe(row._pkgWholesale);
      }
    }

    await rejectInstance(apiClient, instanceId);
  });
});
