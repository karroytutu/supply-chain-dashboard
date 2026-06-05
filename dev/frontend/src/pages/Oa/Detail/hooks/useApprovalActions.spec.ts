import { renderHook, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock dependencies
vi.mock('antd', () => ({
  message: {
    success: vi.fn(),
    error: vi.fn(),
    warning: vi.fn(),
    info: vi.fn(),
  },
}));

vi.mock('@/hooks/usePermission', () => ({
  usePermission: () => ({
    currentUser: { id: 100, name: '测试用户' },
    hasPermission: vi.fn(() => true),
    hasAnyPermission: vi.fn(() => true),
    hasRole: vi.fn(() => false),
  }),
}));

const mockApprove = vi.fn().mockResolvedValue({ data: {} });
const mockReject = vi.fn().mockResolvedValue({ data: {} });
const mockTransfer = vi.fn().mockResolvedValue({ data: {} });
const mockWithdraw = vi.fn().mockResolvedValue({ data: {} });
const mockGetTransferCandidates = vi.fn().mockResolvedValue([{ id: 1, name: '张三' }]);
const mockUpdateInstance = vi.fn().mockResolvedValue(undefined);

vi.mock('@/services/api/oa', () => ({
  oaApi: {
    approve: (...args: any[]) => mockApprove(...args),
    reject: (...args: any[]) => mockReject(...args),
    transfer: (...args: any[]) => mockTransfer(...args),
    withdraw: (...args: any[]) => mockWithdraw(...args),
    getTransferCandidates: (...args: any[]) => mockGetTransferCandidates(...args),
    updateInstance: (...args: any[]) => mockUpdateInstance(...args),
  },
}));

import { useApprovalActions } from './useApprovalActions';
import { message } from 'antd';
import type { ApprovalDetail, ApprovalNode } from '@/types/oa';

const mockDetail: ApprovalDetail = {
  id: 1,
  instanceNo: 'OA-001',
  formTypeCode: 'test',
  formTypeName: '测试',
  title: '测试审批',
  status: 'pending',
  applicantId: 50,
  applicantName: '申请人',
  applicantDept: '部门',
  currentNodeOrder: 1,
  formData: {},
  formSchema: { fields: [] },
  workflowDef: null,
  nodes: [],
  actions: [],
  ccUsers: [],
} as any;

const mockNodes: ApprovalNode[] = [
  { id: 1, nodeOrder: 1, nodeName: '审批节点', nodeType: 'role', assignedUserId: 100, assignedUserName: '测试用户', status: 'pending' },
] as any;

const mockLoadDetail = vi.fn().mockResolvedValue(undefined);

beforeEach(() => {
  vi.clearAllMocks();
});

describe('useApprovalActions', () => {
  describe('canOperate', () => {
    it('detail=null 时返回 false', () => {
      const { result } = renderHook(() =>
        useApprovalActions('1', null, mockNodes, mockLoadDetail)
      );
      expect(result.current.canOperate()).toBe(false);
    });

    it('status !== pending 时返回 false', () => {
      const detail = { ...mockDetail, status: 'approved' } as any;
      const { result } = renderHook(() =>
        useApprovalActions('1', detail, mockNodes, mockLoadDetail)
      );
      expect(result.current.canOperate()).toBe(false);
    });

    it('当前用户非 pending 节点时返回 false', () => {
      const nodes = [{ ...mockNodes[0], assignedUserId: 999 }] as any;
      const { result } = renderHook(() =>
        useApprovalActions('1', mockDetail, nodes, mockLoadDetail)
      );
      expect(result.current.canOperate()).toBe(false);
    });

    it('条件全满足时返回 true', () => {
      const { result } = renderHook(() =>
        useApprovalActions('1', mockDetail, mockNodes, mockLoadDetail)
      );
      expect(result.current.canOperate()).toBe(true);
    });
  });

  describe('canWithdraw', () => {
    it('applicantId 不匹配时返回 false', () => {
      const { result } = renderHook(() =>
        useApprovalActions('1', mockDetail, mockNodes, mockLoadDetail)
      );
      // mockDetail.applicantId = 50, currentUser.id = 100
      expect(result.current.canWithdraw()).toBe(false);
    });

    it('applicantId 匹配时返回 true', () => {
      const detail = { ...mockDetail, applicantId: 100 } as any;
      const { result } = renderHook(() =>
        useApprovalActions('1', detail, mockNodes, mockLoadDetail)
      );
      expect(result.current.canWithdraw()).toBe(true);
    });
  });

  describe('handleAction', () => {
    it('update 类型调用 updateInstance API', async () => {
      const { result } = renderHook(() =>
        useApprovalActions('1', mockDetail, mockNodes, mockLoadDetail)
      );

      await act(async () => {
        result.current.openActionModal('update');
      });
      await act(async () => {
        await result.current.handleAction();
      });

      expect(mockUpdateInstance).toHaveBeenCalledWith(1, {
        formData: {},
        comment: undefined,
      });
      expect(message.success).toHaveBeenCalledWith('数据已更新');
    });

    it('approve 正常完成显示"已通过"', async () => {
      const { result } = renderHook(() =>
        useApprovalActions('1', mockDetail, mockNodes, mockLoadDetail)
      );

      await act(async () => {
        result.current.openActionModal('approve');
      });
      await act(async () => {
        await result.current.handleAction();
      });

      expect(message.success).toHaveBeenCalledWith('已通过');
    });

    it('approve 返回 processing 显示"审批已通过，系统处理中"', async () => {
      mockApprove.mockResolvedValueOnce({ data: { status: 'processing' } });

      const { result } = renderHook(() =>
        useApprovalActions('1', mockDetail, mockNodes, mockLoadDetail)
      );

      await act(async () => {
        result.current.openActionModal('approve');
      });
      await act(async () => {
        await result.current.handleAction();
      });

      expect(message.success).toHaveBeenCalledWith('审批已通过，系统处理中');
    });

    it('transfer 未选人员时显示 warning', async () => {
      const { result } = renderHook(() =>
        useApprovalActions('1', mockDetail, mockNodes, mockLoadDetail)
      );

      await act(async () => {
        result.current.openActionModal('transfer');
      });
      // transferUserId 默认 null
      await act(async () => {
        await result.current.handleAction();
      });

      expect(message.warning).toHaveBeenCalledWith('请选择转交人员');
    });

    it('API 错误时显示"操作失败"', async () => {
      mockApprove.mockRejectedValueOnce(new Error('Network error'));

      const { result } = renderHook(() =>
        useApprovalActions('1', mockDetail, mockNodes, mockLoadDetail)
      );

      await act(async () => {
        result.current.openActionModal('approve');
      });
      await act(async () => {
        await result.current.handleAction();
      });

      expect(message.error).toHaveBeenCalledWith('操作失败');
    });
  });

  describe('openActionModal', () => {
    it('update 设置 actionType 和 visible', () => {
      const { result } = renderHook(() =>
        useApprovalActions('1', mockDetail, mockNodes, mockLoadDetail)
      );

      act(() => {
        result.current.openActionModal('update');
      });

      expect(result.current.actionType).toBe('update');
      expect(result.current.actionModalVisible).toBe(true);
    });
  });

  describe('getCurrentStep', () => {
    it('status=approved 时返回 nodes.length', () => {
      const detail = { ...mockDetail, status: 'approved' } as any;
      const nodes = [{ ...mockNodes[0], status: 'approved' }] as any;
      const { result } = renderHook(() =>
        useApprovalActions('1', detail, nodes, mockLoadDetail)
      );
      expect(result.current.getCurrentStep()).toBe(1);
    });

    it('有 pending 节点时返回其索引', () => {
      const { result } = renderHook(() =>
        useApprovalActions('1', mockDetail, mockNodes, mockLoadDetail)
      );
      expect(result.current.getCurrentStep()).toBe(0);
    });
  });
});
