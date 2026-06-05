/**
 * useApprovalDetailData Hook 单元测试
 * 覆盖：数据加载、错误映射（403/404/500）、auto 节点轮询（processing→approved/erp_failed）、竞态保护
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import type { ApprovalDetail } from '@/types/oa';

// ==================== Mocks ====================

const { mockMessage, mockOaApi } = vi.hoisted(() => ({
  mockMessage: {
    success: vi.fn(),
    error: vi.fn(),
    warning: vi.fn(),
  },
  mockOaApi: {
    getDetail: vi.fn(),
  },
}));

vi.mock('umi', () => ({
  useModel: vi.fn(),
}));

vi.mock('antd', () => ({
  message: mockMessage,
}));

vi.mock('@/services/api/oa', () => ({
  oaApi: mockOaApi,
}));

import { useApprovalDetailData } from './useApprovalDetailData';

// ==================== 测试数据工厂 ====================

function makeDetail(overrides: Partial<ApprovalDetail> = {}): ApprovalDetail {
  return {
    id: 1,
    instanceNo: 'OA-001',
    formTypeCode: 'test',
    formTypeName: '测试',
    formTypeIcon: null,
    title: '测试审批',
    status: 'pending',
    applicantId: 1,
    applicantName: '申请人',
    applicantDept: '技术部',
    currentNodeOrder: 1,
    currentNodeName: '节点',
    submittedAt: '2026-06-01',
    completedAt: null,
    previewFields: [],
    formData: {},
    formSchema: { fields: [] },
    workflowDef: null,
    nodes: [{ id: 1, nodeOrder: 1, status: 'pending', assignedUserId: 100 } as any],
    actions: [{ id: 1, actionType: 'submit', userId: 1, userName: '申请人', comment: '', actedAt: '2026-06-01' } as any],
    ccUsers: [],
    erpMeta: null,
    ...overrides,
  } as ApprovalDetail;
}

// ==================== 测试用例 ====================

beforeEach(() => {
  vi.clearAllMocks();
});

describe('useApprovalDetailData - 数据加载', () => {
  it('loadDetail 成功 → 设置 detail/nodes/actions', async () => {
    const detail = makeDetail();
    mockOaApi.getDetail.mockResolvedValue({ data: detail });

    const { result } = renderHook(() => useApprovalDetailData('42'));

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(mockOaApi.getDetail).toHaveBeenCalledWith(42);
    expect(result.current.detail).toEqual(detail);
    expect(result.current.nodes).toEqual(detail.nodes);
    expect(result.current.actions).toEqual(detail.actions);
    expect(result.current.errorType).toBeNull();
  });

  it('id=undefined → 不发起请求', async () => {
    const { result } = renderHook(() => useApprovalDetailData(undefined));

    // 等一个微任务周期确认无 API 调用
    await new Promise((r) => setTimeout(r, 50));

    expect(mockOaApi.getDetail).not.toHaveBeenCalled();
    expect(result.current.detail).toBeNull();
  });
});

describe('useApprovalDetailData - 错误映射', () => {
  it('API 403 → errorType="forbidden"', async () => {
    mockOaApi.getDetail.mockRejectedValue({ status: 403 });

    const { result } = renderHook(() => useApprovalDetailData('1'));

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.errorType).toBe('forbidden');
    expect(result.current.detail).toBeNull();
  });

  it('API 404 → errorType="not_found"', async () => {
    mockOaApi.getDetail.mockRejectedValue({ status: 404 });

    const { result } = renderHook(() => useApprovalDetailData('1'));

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.errorType).toBe('not_found');
  });

  it('API 其他错误 → errorType="server_error"', async () => {
    mockOaApi.getDetail.mockRejectedValue(new Error('网络超时'));

    const { result } = renderHook(() => useApprovalDetailData('1'));

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.errorType).toBe('server_error');
  });
});

describe('useApprovalDetailData - auto 节点轮询', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('status=processing → 启动轮询，status 变为 approved → 停止 + message.success', async () => {
    const processingDetail = makeDetail({ status: 'processing' });
    const approvedDetail = makeDetail({ status: 'approved' });

    mockOaApi.getDetail
      .mockResolvedValueOnce({ data: processingDetail })
      .mockResolvedValueOnce({ data: approvedDetail });

    const { result } = renderHook(() => useApprovalDetailData('1'));

    // 等待首次加载完成（flush 微任务）
    await act(async () => {
      await vi.runAllTimersAsync();
    });

    // 首次加载后 detail.status 应为 processing
    expect(result.current.detail?.status).toBe('processing');

    // 推进 2000ms 触发轮询
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2000);
    });

    // 轮询后 status 变为 approved
    expect(result.current.detail?.status).toBe('approved');
    expect(mockMessage.success).toHaveBeenCalledWith('系统处理完成');
    // 只调用了 2 次 getDetail：初始 + 1 次轮询
    expect(mockOaApi.getDetail).toHaveBeenCalledTimes(2);
  });

  it('status=processing → 轮询 status 变为 erp_failed → 停止 + message.error', async () => {
    const processingDetail = makeDetail({ status: 'processing' });
    const failedDetail = makeDetail({ status: 'erp_failed' });

    mockOaApi.getDetail
      .mockResolvedValueOnce({ data: processingDetail })
      .mockResolvedValueOnce({ data: failedDetail });

    const { result } = renderHook(() => useApprovalDetailData('1'));

    await act(async () => {
      await vi.runAllTimersAsync();
    });

    expect(result.current.detail?.status).toBe('processing');

    await act(async () => {
      await vi.advanceTimersByTimeAsync(2000);
    });

    expect(result.current.detail?.status).toBe('erp_failed');
    expect(mockMessage.error).toHaveBeenCalledWith('系统处理失败，请点击重试');
  });

  it('组件卸载 → clearInterval 防内存泄漏', async () => {
    const processingDetail = makeDetail({ status: 'processing' });
    mockOaApi.getDetail.mockResolvedValue({ data: processingDetail });

    const { result, unmount } = renderHook(() => useApprovalDetailData('1'));

    await act(async () => {
      await vi.runAllTimersAsync();
    });

    expect(result.current.detail?.status).toBe('processing');

    const callsBefore = mockOaApi.getDetail.mock.calls.length;

    // 卸载组件
    unmount();

    // 推进时间，不应再调用 getDetail
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10000);
    });

    expect(mockOaApi.getDetail.mock.calls.length).toBe(callsBefore);
  });

  it('轮询失败 → 静默忽略，detail 保持 processing', async () => {
    const processingDetail = makeDetail({ status: 'processing' });
    mockOaApi.getDetail
      .mockResolvedValueOnce({ data: processingDetail })
      .mockRejectedValueOnce(new Error('轮询网络错误'))
      .mockResolvedValueOnce({ data: processingDetail }); // 后续轮询也返回 processing

    const { result } = renderHook(() => useApprovalDetailData('1'));

    await act(async () => {
      await vi.runAllTimersAsync();
    });

    expect(result.current.detail?.status).toBe('processing');

    // 推进触发轮询（失败）
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2000);
    });

    // detail 保持 processing（轮询失败静默）
    expect(result.current.detail?.status).toBe('processing');
  });
});
