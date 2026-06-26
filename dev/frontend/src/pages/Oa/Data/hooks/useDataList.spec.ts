/**
 * useDataList Hook 单元测试
 * 覆盖：初始化加载、筛选触发重新加载、handleReset、handleExport、容错处理
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import type { ApprovalInstance, FormTypeDefinition } from '@/types/oa';

// ==================== Mocks ====================

const { mockGetDataList, mockGetFormTypes, mockExportData } = vi.hoisted(() => ({
  mockGetDataList: vi.fn(),
  mockGetFormTypes: vi.fn(),
  mockExportData: vi.fn(),
}));

const { mockMessage } = vi.hoisted(() => ({
  mockMessage: {
    error: vi.fn(),
    loading: vi.fn(),
    success: vi.fn(),
  },
}));

vi.mock('@/services/api/oa', () => ({
  oaApi: {
    getDataList: (...args: any[]) => mockGetDataList(...args),
    getFormTypes: (...args: any[]) => mockGetFormTypes(...args),

    exportData: (...args: any[]) => mockExportData(...args),
  },
}));

vi.mock('antd', async (importOriginal) => {
  const original = await importOriginal<any>();
  return {
    ...original,
    message: mockMessage,
  };
});

vi.mock('../../../../utils/logger', () => ({
  createLogger: () => ({ warn: vi.fn(), info: vi.fn(), error: vi.fn() }),
}));

import { useDataList } from './useDataList';

// ==================== 测试数据工厂 ====================

function makeInstance(id: number): ApprovalInstance {
  return {
    id,
    instanceNo: `OA-${id}`,
    formTypeCode: 'test',
    formTypeName: '测试表单',
    formTypeIcon: null,
    title: `审批 ${id}`,
    status: 'pending',
    applicantId: 1,
    applicantName: '申请人',
    applicantDept: '部门',
    currentNodeOrder: 1,
    currentNodeName: '节点',
    currentApproverName: null,
    currentNodeDeadlineAt: null,
    submittedAt: '2026-06-01',
    completedAt: null,
    previewFields: [],
  };
}

function makeFormType(code: string): FormTypeDefinition {
  return {
    code,
    name: `表单-${code}`,
    icon: 'icon',
    category: 'finance',
    sortOrder: 1,
    description: '',
    version: 1,
    formSchema: { fields: [] },
    workflowDef: { nodes: [] },
  };
}

// ==================== 默认 mock 返回值 ====================

const defaultListResponse = { data: { list: [makeInstance(1), makeInstance(2)], total: 2 } };
const defaultFormTypesResponse = { data: [makeFormType('other_payment')] };

// ==================== 测试用例 ====================

beforeEach(() => {
  vi.clearAllMocks();
  mockGetDataList.mockResolvedValue(defaultListResponse);
  mockGetFormTypes.mockResolvedValue(defaultFormTypesResponse);

  mockExportData.mockResolvedValue({ data: { url: 'http://example.com/export.xlsx' } });
});

describe('useDataList 初始化', () => {
  it('挂载后调用 getFormTypes + getDataList', async () => {
    await act(async () => {
      renderHook(() => useDataList());
    });

    expect(mockGetFormTypes).toHaveBeenCalledTimes(1);
    expect(mockGetDataList).toHaveBeenCalled();
  });

  it('初始 pagination 为 {current:1, pageSize:20, total:0}', async () => {
    const { result } = await act(async () => {
      return renderHook(() => useDataList());
    });

    // 初始加载完成后 total 应已更新
    expect(result.current.pagination.current).toBe(1);
    expect(result.current.pagination.pageSize).toBe(20);
  });

  it('loadData 成功后 dataSource 和 total 更新', async () => {
    const { result } = await act(async () => {
      return renderHook(() => useDataList());
    });

    expect(result.current.dataSource).toHaveLength(2);
    expect(result.current.pagination.total).toBe(2);
  });
});

describe('useDataList 筛选', () => {
  it('setFormTypeCode 触发 getDataList 重新调用', async () => {
    const { result } = await act(async () => {
      return renderHook(() => useDataList());
    });

    const callCountBefore = mockGetDataList.mock.calls.length;

    await act(async () => {
      result.current.setFormTypeCode('other_payment');
    });

    expect(mockGetDataList.mock.calls.length).toBeGreaterThan(callCountBefore);
    // 最后一次调用的参数应包含 formTypeCode
    const lastCall = mockGetDataList.mock.calls[mockGetDataList.mock.calls.length - 1][0];
    expect(lastCall.formTypeCode).toBe('other_payment');
  });

  it('setStatus 触发重新加载且参数含 status', async () => {
    const { result } = await act(async () => {
      return renderHook(() => useDataList());
    });

    await act(async () => {
      result.current.setStatus('approved');
    });

    const lastCall = mockGetDataList.mock.calls[mockGetDataList.mock.calls.length - 1][0];
    expect(lastCall.status).toBe('approved');
  });

  it('setSearchText 和 setApplicantName 传递正确参数', async () => {
    const { result } = await act(async () => {
      return renderHook(() => useDataList());
    });

    await act(async () => {
      result.current.setSearchText('测试关键词');
    });

    let lastCall = mockGetDataList.mock.calls[mockGetDataList.mock.calls.length - 1][0];
    expect(lastCall.keyword).toBe('测试关键词');

    await act(async () => {
      result.current.setApplicantName('张三');
    });

    lastCall = mockGetDataList.mock.calls[mockGetDataList.mock.calls.length - 1][0];
    expect(lastCall.applicantName).toBe('张三');
  });

  it('setDateRange 格式化日期为 YYYY-MM-DD', async () => {
    const { result } = await act(async () => {
      return renderHook(() => useDataList());
    });

    const dayjs = (await import('dayjs')).default;

    await act(async () => {
      result.current.setDateRange([dayjs('2026-01-15'), dayjs('2026-06-30')]);
    });

    const lastCall = mockGetDataList.mock.calls[mockGetDataList.mock.calls.length - 1][0];
    expect(lastCall.startDate).toBe('2026-01-15');
    expect(lastCall.endDate).toBe('2026-06-30');
  });
});

describe('useDataList handleReset', () => {
  it('重置所有筛选到默认值 + pagination.current 回到 1', async () => {
    const { result } = await act(async () => {
      return renderHook(() => useDataList());
    });

    // 先设置一些筛选值
    await act(async () => {
      result.current.setFormTypeCode('other_payment');
    });
    await act(async () => {
      result.current.setStatus('approved');
    });
    await act(async () => {
      result.current.setSearchText('搜索词');
    });

    // 执行重置
    await act(async () => {
      result.current.handleReset();
    });

    expect(result.current.formTypeCode).toBeUndefined();
    expect(result.current.status).toBeUndefined();
    expect(result.current.dateRange).toBeNull();
    expect(result.current.searchText).toBe('');
    expect(result.current.applicantName).toBe('');
    expect(result.current.pagination.current).toBe(1);
  });
});

describe('useDataList handleExport', () => {
  it('excel 导出：调用 oaApi.exportData + window.open', async () => {
    const openSpy = vi.spyOn(window, 'open').mockImplementation(() => null);

    const { result } = await act(async () => {
      return renderHook(() => useDataList());
    });

    await act(async () => {
      await result.current.handleExport('excel');
    });

    expect(mockExportData).toHaveBeenCalledWith(
      expect.objectContaining({ exportType: 'excel' }),
    );
    expect(openSpy).toHaveBeenCalledWith('http://example.com/export.xlsx', '_blank');

    openSpy.mockRestore();
  });

  it('print 导出：打开新窗口并调用 print', async () => {
    const mockPrint = vi.fn();
    const mockDocumentWrite = vi.fn();
    const openSpy = vi.spyOn(window, 'open').mockReturnValue({
      document: { write: mockDocumentWrite, close: vi.fn() },
      print: mockPrint,
    } as any);

    mockExportData.mockResolvedValueOnce({ data: { html: '<h1>打印内容</h1>' } });

    const { result } = await act(async () => {
      return renderHook(() => useDataList());
    });

    await act(async () => {
      await result.current.handleExport('print');
    });

    expect(mockExportData).toHaveBeenCalledWith(
      expect.objectContaining({ exportType: 'print' }),
    );
    expect(mockDocumentWrite).toHaveBeenCalledWith('<h1>打印内容</h1>');
    expect(mockPrint).toHaveBeenCalled();

    openSpy.mockRestore();
  });

  it('导出失败时 message.error', async () => {
    mockExportData.mockRejectedValueOnce(new Error('Network error'));

    const { result } = await act(async () => {
      return renderHook(() => useDataList());
    });

    await act(async () => {
      await result.current.handleExport('excel');
    });

    expect(mockMessage.error).toHaveBeenCalled();
  });
});

describe('useDataList 容错', () => {
  it('loadData 失败 → loading 变 false + message.error', async () => {
    mockGetDataList.mockRejectedValueOnce(new Error('Network error'));

    const { result } = await act(async () => {
      return renderHook(() => useDataList());
    });

    expect(result.current.loading).toBe(false);
    expect(mockMessage.error).toHaveBeenCalledWith('加载数据失败');
  });

  it('loadFormTypes 失败 → 静默处理不崩溃', async () => {
    mockGetFormTypes.mockRejectedValueOnce(new Error('Form types error'));

    const { result } = await act(async () => {
      return renderHook(() => useDataList());
    });

    // 不应崩溃，formTypes 保持空数组
    expect(result.current.formTypes).toEqual([]);
  });


});
