/**
 * 催收OA表单回调 测试
 * @module services/oa/ar-collection-callback.spec
 */

jest.mock('../../utils/logger', () => ({
  __esModule: true,
  default: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
  createLogger: () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() }),
}));

jest.mock('../../db/appPool', () => ({
  appQuery: jest.fn(),
  getAppClient: jest.fn(),
}));

jest.mock('./mutations/shared-utils', () => ({
  insertNodeAfter: jest.fn().mockResolvedValue({ id: 99 }),
  transaction: jest.fn((fn: any) => {
    const mockClient = {
      query: jest.fn().mockResolvedValue({ rows: [{ node_order: 2 }] }),
    };
    return fn(mockClient);
  }),
}));

jest.mock('../erp-client/erp-debt.service', () => ({
  checkExistingBillIds: jest.fn(),
}));

import { beforeSubmitArCollection, onApprovedArCollection } from './ar-collection-callback';
import { insertNodeAfter, transaction } from './mutations/shared-utils';
import { checkExistingBillIds } from '../erp-client/erp-debt.service';
import { OaInstanceRow } from './oa.types';

const mockInsertNodeAfter = insertNodeAfter as jest.MockedFunction<typeof insertNodeAfter>;
const mockTransaction = transaction as jest.MockedFunction<typeof transaction>;
const mockCheckExistingBillIds = checkExistingBillIds as jest.MockedFunction<typeof checkExistingBillIds>;

function createMockInstance(overrides: Partial<OaInstanceRow> = {}): OaInstanceRow {
  return {
    id: 1,
    instance_no: 'OA-001',
    form_type_id: 1,
    form_type_code: 'ar_collection',
    form_type_name: '逾期催收',
    title: '逾期催收 - 张三',
    status: 'processing',
    applicant_id: 1,
    applicant_name: '系统',
    applicant_dept: null,
    form_data: {},
    erp_meta: null,
    current_node_order: 2,
    submitted_at: new Date(),
    completed_at: null,
    ...overrides,
  } as OaInstanceRow;
}

beforeEach(() => {
  jest.clearAllMocks();
  mockInsertNodeAfter.mockResolvedValue({ id: 99 } as any);
});

// =====================================================
// beforeSubmitArCollection
// =====================================================

describe('beforeSubmitArCollection', () => {
  it('formData 无 _extensionCount 时补充默认值 0', async () => {
    const result = await beforeSubmitArCollection({}, 1);
    expect(result).toEqual({ _extensionCount: 0 });
  });

  it('formData 已有 _extensionCount 时返回空对象', async () => {
    const result = await beforeSubmitArCollection({ _extensionCount: 2 }, 1);
    expect(result).toEqual({});
  });
});

// =====================================================
// onApprovedArCollection - 路由分发
// =====================================================

describe('onApprovedArCollection - 路由分发', () => {
  it('action=verify 调用 checkExistingBillIds', async () => {
    mockCheckExistingBillIds.mockResolvedValue(new Set(['B1']));
    const instance = createMockInstance();
    await onApprovedArCollection(instance, {
      action: 'verify',
      billDetails: [{ billNo: 'B1' }],
    });
    expect(mockCheckExistingBillIds).toHaveBeenCalled();
  });

  it('action=difference 插入财务差异处理节点', async () => {
    const instance = createMockInstance();
    await onApprovedArCollection(instance, { action: 'difference' });
    expect(mockTransaction).toHaveBeenCalled();
  });

  it('action=escalate 插入升级节点', async () => {
    const instance = createMockInstance();
    await onApprovedArCollection(instance, { action: 'escalate', _currentLevel: 0 });
    expect(mockTransaction).toHaveBeenCalled();
  });

  it('action=resolve_diff 插入营销师催收节点', async () => {
    const instance = createMockInstance();
    await onApprovedArCollection(instance, { action: 'resolve_diff' });
    expect(mockTransaction).toHaveBeenCalled();
  });

  it('action=send_letter 仅记录日志', async () => {
    const instance = createMockInstance();
    await onApprovedArCollection(instance, { action: 'send_letter' });
    expect(mockTransaction).not.toHaveBeenCalled();
    expect(mockInsertNodeAfter).not.toHaveBeenCalled();
  });

  it('action=lawsuit 插入起诉立案节点', async () => {
    const instance = createMockInstance();
    await onApprovedArCollection(instance, { action: 'lawsuit' });
    expect(mockTransaction).toHaveBeenCalled();
  });

  it('未知 action 不抛错', async () => {
    const instance = createMockInstance();
    await expect(
      onApprovedArCollection(instance, { action: 'unknown_action' })
    ).resolves.not.toThrow();
  });
});

// =====================================================
// handleVerify
// =====================================================

describe('onApprovedArCollection - handleVerify', () => {
  it('billDetails 为空时不查询 ERP', async () => {
    const instance = createMockInstance();
    await onApprovedArCollection(instance, { action: 'verify', billDetails: [] });
    expect(mockCheckExistingBillIds).not.toHaveBeenCalled();
  });

  it('全部账单消失时不插入新节点', async () => {
    mockCheckExistingBillIds.mockResolvedValue(new Set());
    const instance = createMockInstance();
    await onApprovedArCollection(instance, {
      action: 'verify',
      billDetails: [{ billNo: 'B1' }, { billNo: 'B2' }],
    });
    expect(mockTransaction).not.toHaveBeenCalled();
  });

  it('部分消失时插入继续催收节点', async () => {
    mockCheckExistingBillIds.mockResolvedValue(new Set(['B1']));
    const instance = createMockInstance();
    await onApprovedArCollection(instance, {
      action: 'verify',
      billDetails: [{ billNo: 'B1' }, { billNo: 'B2' }],
    });
    expect(mockTransaction).toHaveBeenCalled();
  });

  it('无账单核销时不插入新节点', async () => {
    mockCheckExistingBillIds.mockResolvedValue(new Set(['B1', 'B2']));
    const instance = createMockInstance();
    await onApprovedArCollection(instance, {
      action: 'verify',
      billDetails: [{ billNo: 'B1' }, { billNo: 'B2' }],
    });
    expect(mockTransaction).not.toHaveBeenCalled();
  });
});

// =====================================================
// handleExtension
// =====================================================

describe('onApprovedArCollection - handleExtension', () => {
  it('延期天数 < 1 时抛出错误', async () => {
    const instance = createMockInstance();
    await expect(
      onApprovedArCollection(instance, {
        action: 'extension',
        extensionDays: 0,
        _currentLevel: 0,
        _extensionCount: 0,
      })
    ).rejects.toThrow('延期天数必须在1-30天之间');
  });

  it('延期天数 > 30 时抛出错误', async () => {
    const instance = createMockInstance();
    await expect(
      onApprovedArCollection(instance, {
        action: 'extension',
        extensionDays: 31,
        _currentLevel: 0,
        _extensionCount: 0,
      })
    ).rejects.toThrow('延期天数必须在1-30天之间');
  });

  it('L0 首次延期直接生效，不插入新节点', async () => {
    const instance = createMockInstance();
    await onApprovedArCollection(instance, {
      action: 'extension',
      extensionDays: 7,
      _currentLevel: 0,
      _extensionCount: 0,
    });
    expect(mockTransaction).not.toHaveBeenCalled();
  });

  it('L0 二次延期无担保签字时抛出错误', async () => {
    const instance = createMockInstance();
    await expect(
      onApprovedArCollection(instance, {
        action: 'extension',
        extensionDays: 7,
        _currentLevel: 0,
        _extensionCount: 1,
      })
    ).rejects.toThrow('二次延期需要营销担保签字');
  });

  it('L0 二次延期有担保签字时通过', async () => {
    const instance = createMockInstance();
    await onApprovedArCollection(instance, {
      action: 'extension',
      extensionDays: 7,
      _currentLevel: 0,
      _extensionCount: 1,
      guarantorSignature: 'data:image/png;base64,abc',
    });
    // 不抛错即可
  });

  it('L1 延期插入总经理审批节点', async () => {
    const instance = createMockInstance();
    await onApprovedArCollection(instance, {
      action: 'extension',
      extensionDays: 7,
      _currentLevel: 1,
      _extensionCount: 0,
    });
    expect(mockTransaction).toHaveBeenCalled();
  });
});

// =====================================================
// handleEscalate
// =====================================================

describe('onApprovedArCollection - handleEscalate', () => {
  it('L0 升级到 L1（营销经理）', async () => {
    const instance = createMockInstance();
    await onApprovedArCollection(instance, {
      action: 'escalate',
      _currentLevel: 0,
    });
    expect(mockTransaction).toHaveBeenCalled();
  });

  it('L1 升级到 L2（财务）', async () => {
    const instance = createMockInstance();
    await onApprovedArCollection(instance, {
      action: 'escalate',
      _currentLevel: 1,
    });
    expect(mockTransaction).toHaveBeenCalled();
  });

  it('超出最高级别时抛出错误', async () => {
    const instance = createMockInstance();
    await expect(
      onApprovedArCollection(instance, {
        action: 'escalate',
        _currentLevel: 2,
      })
    ).rejects.toThrow('已达到最高升级级别');
  });
});

// =====================================================
// handleDifference / handleResolveDiff / handleLawsuit
// =====================================================

describe('onApprovedArCollection - 其他操作', () => {
  it('handleDifference 插入财务差异处理节点', async () => {
    const instance = createMockInstance();
    await onApprovedArCollection(instance, {
      action: 'difference',
      _currentLevel: 0,
    });
    expect(mockTransaction).toHaveBeenCalled();
  });

  it('handleResolveDiff 插入营销师催收节点', async () => {
    const instance = createMockInstance();
    await onApprovedArCollection(instance, { action: 'resolve_diff' });
    expect(mockTransaction).toHaveBeenCalled();
  });

  it('handleLawsuit 插入起诉立案节点', async () => {
    const instance = createMockInstance();
    await onApprovedArCollection(instance, { action: 'lawsuit' });
    expect(mockTransaction).toHaveBeenCalled();
  });
});

// =====================================================
// insertCollectionNode - 节点插入位置验证
// =====================================================

describe('onApprovedArCollection - insertCollectionNode 位置计算', () => {
  it('insertNodeAfter 的 afterOrder 为 auto 节点 node_order - 1', async () => {
    // mock auto 节点 node_order=5 → afterOrder 应为 4
    mockTransaction.mockImplementationOnce(async (fn: any) => {
      const mockClient = {
        query: jest.fn().mockResolvedValue({ rows: [{ node_order: 5 }] }),
      };
      return fn(mockClient);
    });
    const instance = createMockInstance();
    await onApprovedArCollection(instance, { action: 'difference', _currentLevel: 0 });
    expect(mockInsertNodeAfter).toHaveBeenCalledWith(
      expect.anything(), expect.any(Number), 4, expect.any(Object),
    );
  });

  it('无 auto 节点时抛出明确错误', async () => {
    mockTransaction.mockImplementationOnce(async (fn: any) => {
      const mockClient = {
        query: jest.fn().mockResolvedValue({ rows: [] }), // 无 auto 节点
      };
      return fn(mockClient);
    });
    const instance = createMockInstance();
    await expect(
      onApprovedArCollection(instance, { action: 'difference', _currentLevel: 0 }),
    ).rejects.toThrow('未找到 pending/processing 的 auto 节点');
  });
});
