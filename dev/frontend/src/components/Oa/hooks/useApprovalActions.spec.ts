/**
 * useApprovalActions 共享 Hook 单元测试
 * 覆盖：权限计算（canOperate/canWithdraw/currentStep）+ 操作执行 + 弹窗控制
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import type { ApprovalDetail, ApprovalNode } from '@/types/oa';

// ==================== Mocks ====================

const { mockMessage, mockOaApi } = vi.hoisted(() => ({
  mockMessage: {
    success: vi.fn(),
    warning: vi.fn(),
    error: vi.fn(),
  },
  mockOaApi: {
    approve: vi.fn(),
    reject: vi.fn(),
    transfer: vi.fn(),
    withdraw: vi.fn(),
    updateInstance: vi.fn(),
    getTransferCandidates: vi.fn(),
  },
}));

vi.mock('umi', () => ({
  useModel: vi.fn(),
}));

vi.mock('antd', () => ({
  message: mockMessage,
}));

vi.mock('@/hooks/usePermission', () => ({
  usePermission: vi.fn(() => ({ currentUser: { id: 100, name: '测试用户' } })),
}));

vi.mock('@/services/api/oa', () => ({
  oaApi: mockOaApi,
}));

import { useApprovalActions } from './useApprovalActions';
import { usePermission } from '@/hooks/usePermission';

// ==================== 测试数据工厂 ====================

function makeDetail(overrides: Partial<ApprovalDetail> = {}): ApprovalDetail {
  return {
    id: 1,
    instanceNo: 'OA-2026-001',
    formTypeCode: 'other_payment',
    formTypeName: '其他付款申请单',
    formTypeIcon: null,
    title: '测试审批',
    status: 'pending',
    applicantId: 100,
    applicantName: '申请人',
    applicantDept: '技术部',
    currentNodeOrder: 1,
    currentNodeName: '审批节点',
    submittedAt: '2026-06-01T10:00:00Z',
    completedAt: null,
    previewFields: [],
    formData: {},
    formSchema: { fields: [] },
    workflowDef: null,
    nodes: [],
    actions: [],
    ccUsers: [],
    erpMeta: null,
    ...overrides,
  } as ApprovalDetail;
}

function makeNode(overrides: Partial<ApprovalNode> = {}): ApprovalNode {
  return {
    id: 1,
    nodeOrder: 1,
    nodeName: '审批节点',
    nodeType: 'role',
    assignedUserId: 100,
    assignedUserName: '审批人',
    status: 'pending',
    comment: null,
    actedAt: null,
    isCountersign: false,
    ...overrides,
  } as ApprovalNode;
}

function setCurrentUser(user: { id: number; name?: string } | null) {
  vi.mocked(usePermission).mockReturnValue({
    currentUser: user,
  } as any);
}

// ==================== 测试用例 ====================

beforeEach(() => {
  vi.clearAllMocks();
  setCurrentUser({ id: 100, name: '测试用户' });
});

// ==================== A. 权限计算 — canOperate ====================

describe('canOperate 权限计算', () => {
  it('detail.status=pending + pending 节点 assignedUserId === currentUser.id → true', () => {
    const detail = makeDetail({ status: 'pending' });
    const nodes = [makeNode({ status: 'pending', assignedUserId: 100 })];

    const { result } = renderHook(() =>
      useApprovalActions({ instanceId: 1, detail, nodes }),
    );

    expect(result.current.canOperate).toBe(true);
  });

  it('detail.status=approved（非 pending）→ false', () => {
    const detail = makeDetail({ status: 'approved' });
    const nodes = [makeNode({ status: 'approved', assignedUserId: 100 })];

    const { result } = renderHook(() =>
      useApprovalActions({ instanceId: 1, detail, nodes }),
    );

    expect(result.current.canOperate).toBe(false);
  });

  it('无 pending 状态节点 → false', () => {
    const detail = makeDetail({ status: 'pending' });
    const nodes = [makeNode({ status: 'approved', assignedUserId: 100 })];

    const { result } = renderHook(() =>
      useApprovalActions({ instanceId: 1, detail, nodes }),
    );

    expect(result.current.canOperate).toBe(false);
  });

  it('pending 节点 assignedUserId !== currentUser.id → false', () => {
    const detail = makeDetail({ status: 'pending' });
    const nodes = [makeNode({ status: 'pending', assignedUserId: 999 })];

    const { result } = renderHook(() =>
      useApprovalActions({ instanceId: 1, detail, nodes }),
    );

    expect(result.current.canOperate).toBe(false);
  });
});

// ==================== B. 权限计算 — canWithdraw ====================

describe('canWithdraw 权限计算', () => {
  it('detail.status=pending + applicantId === currentUser.id → true', () => {
    const detail = makeDetail({ status: 'pending', applicantId: 100 });
    const nodes = [makeNode()];

    const { result } = renderHook(() =>
      useApprovalActions({ instanceId: 1, detail, nodes }),
    );

    expect(result.current.canWithdraw).toBe(true);
  });

  it('detail.status !== pending → false', () => {
    const detail = makeDetail({ status: 'approved', applicantId: 100 });
    const nodes = [makeNode()];

    const { result } = renderHook(() =>
      useApprovalActions({ instanceId: 1, detail, nodes }),
    );

    expect(result.current.canWithdraw).toBe(false);
  });

  it('applicantId !== currentUser.id → false', () => {
    const detail = makeDetail({ status: 'pending', applicantId: 999 });
    const nodes = [makeNode()];

    const { result } = renderHook(() =>
      useApprovalActions({ instanceId: 1, detail, nodes }),
    );

    expect(result.current.canWithdraw).toBe(false);
  });
});

// ==================== C. 步骤计算 — currentStep ====================

describe('currentStep 步骤计算', () => {
  it('存在 pending 节点 → 返回其 index', () => {
    const nodes = [
      makeNode({ id: 1, nodeOrder: 1, status: 'approved' }),
      makeNode({ id: 2, nodeOrder: 2, status: 'pending' }),
      makeNode({ id: 3, nodeOrder: 3, status: 'pending' }),
    ];
    const detail = makeDetail({ status: 'pending' });

    const { result } = renderHook(() =>
      useApprovalActions({ instanceId: 1, detail, nodes }),
    );

    expect(result.current.currentStep).toBe(1); // 第一个 pending 在 index 1
  });

  it('无 pending + status=approved → nodes.length', () => {
    const nodes = [
      makeNode({ id: 1, status: 'approved' }),
      makeNode({ id: 2, status: 'approved' }),
    ];
    const detail = makeDetail({ status: 'approved' });

    const { result } = renderHook(() =>
      useApprovalActions({ instanceId: 1, detail, nodes }),
    );

    expect(result.current.currentStep).toBe(2); // nodes.length
  });

  it('无 pending + status=rejected → 0', () => {
    const nodes = [
      makeNode({ id: 1, status: 'rejected' }),
    ];
    const detail = makeDetail({ status: 'rejected' });

    const { result } = renderHook(() =>
      useApprovalActions({ instanceId: 1, detail, nodes }),
    );

    expect(result.current.currentStep).toBe(0);
  });

  it('无 pending + status=cancelled → nodes.length (fallback)', () => {
    const nodes = [
      makeNode({ id: 1, status: 'cancelled' }),
      makeNode({ id: 2, status: 'cancelled' }),
    ];
    const detail = makeDetail({ status: 'cancelled' as any });

    const { result } = renderHook(() =>
      useApprovalActions({ instanceId: 1, detail, nodes }),
    );

    expect(result.current.currentStep).toBe(2); // nodes.length fallback
  });
});

// ==================== D. 操作执行 — executeAction ====================

describe('executeAction 操作执行', () => {
  const onActionComplete = vi.fn();

  function setupHook(actionType: 'approve' | 'reject' | 'transfer' | 'countersign' | 'update') {
    const detail = makeDetail({ status: 'pending', formData: { amount: 1000 } });
    const nodes = [makeNode({ status: 'pending', assignedUserId: 100 })];

    // transfer 类型会调用 getTransferCandidates，需预设返回值
    if (actionType === 'transfer') {
      mockOaApi.getTransferCandidates.mockResolvedValue([]);
    }

    const { result } = renderHook(() =>
      useApprovalActions({ instanceId: 42, detail, nodes, onActionComplete }),
    );

    // 打开对应类型的操作弹窗
    act(() => {
      result.current.openActionModal(actionType);
    });

    return result;
  }

  it('approve 成功（普通响应）→ message.success("已通过") + onActionComplete', async () => {
    mockOaApi.approve.mockResolvedValueOnce({ status: 'approved' });
    const result = setupHook('approve');

    await act(async () => {
      await result.current.executeAction();
    });

    expect(mockOaApi.approve).toHaveBeenCalledWith(42, { comment: '' });
    expect(mockMessage.success).toHaveBeenCalledWith('已通过');
    expect(onActionComplete).toHaveBeenCalledTimes(1);
    expect(result.current.actionModalVisible).toBe(false);
  });

  it('approve 成功（processing 响应）→ "审批已通过，系统处理中"', async () => {
    mockOaApi.approve.mockResolvedValueOnce({ status: 'processing' });
    const result = setupHook('approve');

    await act(async () => {
      await result.current.executeAction();
    });

    expect(mockMessage.success).toHaveBeenCalledWith('审批已通过，系统处理中');
  });

  it('reject 无评论 → message.warning("请填写拒绝原因") + 不调 API', async () => {
    const result = setupHook('reject');
    // 不设置 actionComment（默认空字符串）

    await act(async () => {
      await result.current.executeAction();
    });

    expect(mockMessage.warning).toHaveBeenCalledWith('请填写拒绝原因');
    expect(mockOaApi.reject).not.toHaveBeenCalled();
    // Modal 不关闭
    expect(result.current.actionModalVisible).toBe(true);
  });

  it('reject 成功 → oaApi.reject + "已拒绝"', async () => {
    mockOaApi.reject.mockResolvedValueOnce(undefined);
    const result = setupHook('reject');

    // 设置审批意见
    act(() => {
      result.current.setActionComment('不符合要求');
    });

    await act(async () => {
      await result.current.executeAction();
    });

    expect(mockOaApi.reject).toHaveBeenCalledWith(42, { comment: '不符合要求' });
    expect(mockMessage.success).toHaveBeenCalledWith('已拒绝');
  });

  it('transfer 无 transferUserId → message.warning + 不调 API', async () => {
    const result = setupHook('transfer');
    // 不设置 transferUserId（默认 null）

    await act(async () => {
      await result.current.executeAction();
    });

    expect(mockMessage.warning).toHaveBeenCalledWith('请选择转交人员');
    expect(mockOaApi.transfer).not.toHaveBeenCalled();
    // Modal 不关闭
    expect(result.current.actionModalVisible).toBe(true);
  });

  it('transfer 有 transferUserId → oaApi.transfer + "已转交"', async () => {
    mockOaApi.transfer.mockResolvedValueOnce(undefined);
    const result = setupHook('transfer');

    act(() => {
      result.current.setTransferUserId(55);
    });

    await act(async () => {
      await result.current.executeAction();
    });

    expect(mockOaApi.transfer).toHaveBeenCalledWith(42, {
      transferToUserId: 55,
      comment: '',
    });
    expect(mockMessage.success).toHaveBeenCalledWith('已转交');
  });

  it('countersign → message.warning + 不调用 onActionComplete + Modal 保持打开', async () => {
    const result = setupHook('countersign');

    await act(async () => {
      await result.current.executeAction();
    });

    expect(mockMessage.warning).toHaveBeenCalledWith('加签功能需要选择加签人员');
    expect(onActionComplete).not.toHaveBeenCalled();
    // Modal 保持打开（未执行操作）
    expect(result.current.actionModalVisible).toBe(true);
  });

  it('update → oaApi.updateInstance + comment="" 时传 undefined', async () => {
    mockOaApi.updateInstance.mockResolvedValueOnce(undefined);
    const result = setupHook('update');

    await act(async () => {
      await result.current.executeAction();
    });

    expect(mockOaApi.updateInstance).toHaveBeenCalledWith(42, {
      formData: { amount: 1000 },
      comment: undefined,
    });
    expect(mockMessage.success).toHaveBeenCalledWith('数据已更新');
  });

  // ---- editableFormRef 路径 ----

  describe('editableFormRef 路径', () => {
    function setupHookWithRef(actionType: 'approve' | 'update') {
      const detail = makeDetail({ status: 'pending', formData: { amount: 1000, action: null } });
      const nodes = [makeNode({ status: 'pending', assignedUserId: 100 })];
      const editableFormRef = { current: null as any };

      const { result } = renderHook(() =>
        useApprovalActions({ instanceId: 42, detail, nodes, onActionComplete, editableFormRef: editableFormRef as any }),
      );

      act(() => { result.current.openActionModal(actionType); });
      return { result, editableFormRef };
    }

    it('approve + 校验通过 → 发送 inputData', async () => {
      mockOaApi.approve.mockResolvedValueOnce({ status: 'approved' });
      const { result, editableFormRef } = setupHookWithRef('approve');
      editableFormRef.current = {
        validate: () => [],
        getEditedValues: () => ({ action: 'verify', verifyRemark: '已核销' }),
      };

      await act(async () => { await result.current.executeAction(); });

      expect(mockOaApi.approve).toHaveBeenCalledWith(42, expect.objectContaining({
        inputData: { action: 'verify', verifyRemark: '已核销' },
      }));
      expect(mockMessage.success).toHaveBeenCalledWith('已通过');
    });

    it('approve + 校验失败 → message.error + 不调 API', async () => {
      const { result, editableFormRef } = setupHookWithRef('approve');
      editableFormRef.current = {
        validate: () => ['「催收操作」不能为空'],
        getEditedValues: () => ({}),
      };

      await act(async () => { await result.current.executeAction(); });

      expect(mockMessage.error).toHaveBeenCalledWith('「催收操作」不能为空');
      expect(mockOaApi.approve).not.toHaveBeenCalled();
    });

    it('approve + getEditedValues 返回空对象 → inputData=undefined', async () => {
      mockOaApi.approve.mockResolvedValueOnce({ status: 'approved' });
      const { result, editableFormRef } = setupHookWithRef('approve');
      editableFormRef.current = {
        validate: () => [],
        getEditedValues: () => ({}),
      };

      await act(async () => { await result.current.executeAction(); });

      // inputData 应为 undefined（空对象时不发送）
      const approveCall = mockOaApi.approve.mock.calls[0];
      expect(approveCall[1].inputData).toBeUndefined();
    });

    it('update + editableFormRef → 发送编辑 diff 合并 formData', async () => {
      mockOaApi.updateInstance.mockResolvedValueOnce(undefined);
      const { result, editableFormRef } = setupHookWithRef('update');
      editableFormRef.current = {
        validate: () => [],
        getEditedValues: () => ({ action: 'extension' }),
      };

      await act(async () => { await result.current.executeAction(); });

      expect(mockOaApi.updateInstance).toHaveBeenCalledWith(42, expect.objectContaining({
        formData: expect.objectContaining({ amount: 1000, action: 'extension' }),
      }));
      expect(mockMessage.success).toHaveBeenCalledWith('数据已更新');
    });
  });

  it('API 抛异常 → message.error + loading 恢复 false', async () => {
    mockOaApi.approve.mockRejectedValueOnce(new Error('网络超时'));
    const result = setupHook('approve');

    await act(async () => {
      await result.current.executeAction();
    });

    expect(mockMessage.error).toHaveBeenCalledWith('网络超时');
    expect(result.current.actionLoading).toBe(false);
    // Modal 不关闭
    expect(result.current.actionModalVisible).toBe(true);
  });
});

// ==================== E. 撤回 — executeWithdraw ====================

describe('executeWithdraw 撤回操作', () => {
  const onWithdrawComplete = vi.fn();

  it('成功 → oaApi.withdraw + "已撤回" + onWithdrawComplete（非 onActionComplete）', async () => {
    mockOaApi.withdraw.mockResolvedValueOnce(undefined);
    const detail = makeDetail({ status: 'pending', applicantId: 100 });
    const nodes = [makeNode()];

    const { result } = renderHook(() =>
      useApprovalActions({ instanceId: 42, detail, nodes, onWithdrawComplete }),
    );

    await act(async () => {
      await result.current.executeWithdraw();
    });

    expect(mockOaApi.withdraw).toHaveBeenCalledWith(42);
    expect(mockMessage.success).toHaveBeenCalledWith('已撤回');
    expect(onWithdrawComplete).toHaveBeenCalledTimes(1);
  });

  it('失败 → message.error + loading 恢复', async () => {
    mockOaApi.withdraw.mockRejectedValueOnce(new Error('撤回失败'));
    const detail = makeDetail({ status: 'pending', applicantId: 100 });
    const nodes = [makeNode()];

    const { result } = renderHook(() =>
      useApprovalActions({ instanceId: 42, detail, nodes, onWithdrawComplete }),
    );

    await act(async () => {
      await result.current.executeWithdraw();
    });

    expect(mockMessage.error).toHaveBeenCalledWith('撤回失败');
    expect(result.current.actionLoading).toBe(false);
  });
});

// ==================== F. 弹窗控制 ====================

describe('弹窗控制', () => {
  it('openActionModal("transfer") → 调用 getTransferCandidates 并填充 users', async () => {
    mockOaApi.getTransferCandidates.mockResolvedValueOnce([
      { id: 1, name: '张三' },
      { id: 2, name: '李四' },
    ]);
    const detail = makeDetail();
    const nodes = [makeNode()];

    const { result } = renderHook(() =>
      useApprovalActions({ instanceId: 1, detail, nodes }),
    );

    await act(async () => {
      result.current.openActionModal('transfer');
      // 等待 Promise resolve
      await new Promise((r) => setTimeout(r, 0));
    });

    expect(mockOaApi.getTransferCandidates).toHaveBeenCalled();
    expect(result.current.transferUsers).toEqual([
      { id: 1, name: '张三' },
      { id: 2, name: '李四' },
    ]);
    expect(result.current.actionType).toBe('transfer');
    expect(result.current.actionModalVisible).toBe(true);
  });

  it('openActionModal("transfer") 失败 → transferUsers 置 []', async () => {
    mockOaApi.getTransferCandidates.mockRejectedValueOnce(new Error('fail'));
    const detail = makeDetail();
    const nodes = [makeNode()];

    const { result } = renderHook(() =>
      useApprovalActions({ instanceId: 1, detail, nodes }),
    );

    await act(async () => {
      result.current.openActionModal('transfer');
      await new Promise((r) => setTimeout(r, 0));
    });

    expect(result.current.transferUsers).toEqual([]);
  });

  it('closeActionModal → visible=false + 重置 comment/userId', () => {
    const detail = makeDetail();
    const nodes = [makeNode()];

    const { result } = renderHook(() =>
      useApprovalActions({ instanceId: 1, detail, nodes }),
    );

    act(() => {
      result.current.openActionModal('approve');
    });
    act(() => {
      result.current.setActionComment('some comment');
    });
    act(() => {
      result.current.closeActionModal();
    });

    expect(result.current.actionModalVisible).toBe(false);
    expect(result.current.actionComment).toBe('');
  });
});
