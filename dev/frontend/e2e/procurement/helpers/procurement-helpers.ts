/**
 * 采购审批 E2E 测试辅助函数
 * 从 oa-operation-node.spec.ts 提取的公共函数 + 采购审批专用辅助
 * @module e2e/procurement/helpers/procurement-helpers
 */
import type { Page } from '@playwright/test';

const API_URL = process.env.API_URL ?? 'http://localhost:8100';

// =====================================================
// 通用辅助（从 oa-operation-node.spec.ts 提取）
// =====================================================

/**
 * 切换到指定用户身份
 * 使用相对路径（通过前端 dev proxy 代理到后端），避免跨域问题
 */
export async function switchToUser(page: Page, userId: number): Promise<string | null> {
  const token = await page.evaluate(async (uid: number) => {
    const authToken = localStorage.getItem('auth_token') || '';
    const response = await fetch('/api/auth/dev-switch', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${authToken}`,
      },
      body: JSON.stringify({ userId: uid }),
    });
    const data = await response.json();
    const newToken = data.token ?? data.data?.token;
    if (newToken) {
      localStorage.setItem('auth_token', newToken);
    }
    return newToken ?? null;
  }, userId);
  return token;
}

/**
 * 在页面上下文中执行 API 调用（绕过 Playwright fixture 生命周期限制）
 * 使用相对路径通过前端 dev proxy，避免跨域问题
 */
export async function apiCall(
  page: Page,
  method: string,
  path: string,
  body?: unknown
): Promise<any> {
  return page.evaluate(async ({ m, p, b }: any) => {
    const token = localStorage.getItem('auth_token') || '';
    const response = await fetch(p, {
      method: m,
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: b ? JSON.stringify(b) : undefined,
    });
    return response.json();
  }, { m: method, p: path, b: body });
}

// =====================================================
// 采购审批专用辅助
// =====================================================

/**
 * 提交采购审批测试实例
 * 通过 OA 提交接口创建，beforeSubmit 会自动从 ERP 拉取数据
 */
export async function submitTestProcurement(
  apiClient: { post: (path: string, body?: any) => Promise<any> },
  options: {
    erpBillId: number;
    paymentMethod: string;
    title?: string;
  }
): Promise<{ instanceId: number; nodes: any[] } | null> {
  try {
    const submitResult = await apiClient.post('/api/oa/instances', {
      formTypeCode: 'procurement_order',
      title: options.title || `[E2E测试] 采购审批 ${options.paymentMethod}`,
      formData: {
        erpBillId: options.erpBillId,
        paymentMethod: options.paymentMethod,
      },
    });

    const instanceId = submitResult?.data?.instanceId ?? submitResult?.instanceId;
    if (!instanceId) return null;

    // 获取详情，获取节点信息
    const detail = await apiClient.post(`/api/oa/instances/${instanceId}`, {});
    const nodes = detail?.data?.nodes ?? [];

    return { instanceId, nodes };
  } catch {
    return null;
  }
}

/**
 * 等待 auto 节点执行完成
 * 轮询 GET /api/oa/instances/:id 检查节点状态
 * @param timeout 超时毫秒数（默认20s，连续auto节点建议30s）
 */
export async function waitForAutoNode(
  apiClient: { get?: (path: string) => Promise<any>; post: (path: string, body?: any) => Promise<any> },
  instanceId: number,
  expectedNodeOrder: number,
  timeout = 20000
): Promise<{ success: boolean; currentNodeOrder: number }> {
  const startTime = Date.now();
  const pollInterval = 1000;

  while (Date.now() - startTime < timeout) {
    try {
      const detail = await apiClient.post(`/api/oa/instances/${instanceId}`, {});
      const detailData = detail?.data ?? detail;
      const currentNodeOrder = detailData?.currentNodeOrder ?? 0;
      const status = detailData?.status;

      // 实例已完结
      if (status === 'approved' || status === 'completed') {
        return { success: true, currentNodeOrder };
      }

      // 当前节点已超过预期节点（说明预期节点已完成）
      if (currentNodeOrder > expectedNodeOrder) {
        return { success: true, currentNodeOrder };
      }

      // 检查预期节点是否已完成
      const nodes = detailData?.nodes ?? [];
      const targetNode = nodes.find((n: any) => n.nodeOrder === expectedNodeOrder);
      if (targetNode && (targetNode.status === 'approved' || targetNode.status === 'completed')) {
        return { success: true, currentNodeOrder };
      }

      // 检查是否有错误
      if (targetNode && targetNode.status === 'failed') {
        return { success: false, currentNodeOrder };
      }
    } catch {
      // 查询失败，继续轮询
    }

    await new Promise(resolve => setTimeout(resolve, pollInterval));
  }

  return { success: false, currentNodeOrder: -1 };
}

/**
 * 获取实例当前节点信息
 */
export async function getCurrentNodeInfo(
  apiClient: { post: (path: string, body?: any) => Promise<any> },
  instanceId: number
): Promise<{ currentNodeOrder: number; currentNodeName: string; status: string; nodes: any[] }> {
  const detail = await apiClient.post(`/api/oa/instances/${instanceId}`, {});
  const data = detail?.data ?? detail;
  return {
    currentNodeOrder: data?.currentNodeOrder ?? 0,
    currentNodeName: data?.currentNodeName ?? '',
    status: data?.status ?? '',
    nodes: data?.nodes ?? [],
  };
}

/**
 * ERP 清理：利用 OA reject 自动回滚 + cancel-po 兜底
 *
 * 策略：
 * 1. 尝试 OA reject（触发 onRejected 自动回滚全部 ERP 单据）
 * 2. 若 reject 失败（如状态不允许），尝试 OA withdraw
 * 3. 最后用 cancel-po 兜底取消任何残留的 PO
 */
export async function cleanupProcurement(
  page: Page,
  instanceId: number | null,
  billIds: number[] = []
): Promise<void> {
  if (!instanceId) return;

  // Step 1: 尝试 reject（触发 onRejected 自动回滚）
  try {
    await apiCall(page, 'POST', `/api/oa/instances/${instanceId}/reject`, {
      comment: '[E2E测试] 自动清理',
    });
  } catch {
    // reject 失败，继续尝试 withdraw
  }

  // Step 2: 尝试 withdraw（仅在 pending 状态有效）
  try {
    await apiCall(page, 'POST', `/api/oa/instances/${instanceId}/withdraw`);
  } catch {
    // withdraw 失败，继续兜底
  }

  // Step 3: cancel-po 兜底（取消所有关联的 PO）
  for (const billId of billIds) {
    try {
      await apiCall(page, 'POST', '/api/dev/erp/cancel-po', { billId });
    } catch {
      // 兜底失败，记录但不阻断
      console.warn(`[E2E清理] cancel-po 失败: billId=${billId}`);
    }
  }
}

/**
 * 通过 dev 端点取消单个 PO（用于 afterAll 兜底）
 */
export async function cancelTestPO(page: Page, billId: number): Promise<void> {
  try {
    await apiCall(page, 'POST', '/api/dev/erp/cancel-po', { billId });
  } catch {
    console.warn(`[E2E清理] cancelTestPO 失败: billId=${billId}`);
  }
}
