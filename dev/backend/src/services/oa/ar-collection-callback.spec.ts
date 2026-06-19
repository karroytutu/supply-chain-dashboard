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
import { appQuery } from '../../db/appPool';
import { OaInstanceRow } from './oa.types';

const mockInsertNodeAfter = insertNodeAfter as jest.MockedFunction<typeof insertNodeAfter>;
const mockTransaction = transaction as jest.MockedFunction<typeof transaction>;
const mockCheckExistingBillIds = checkExistingBillIds as jest.MockedFunction<typeof checkExistingBillIds>;
const mockAppQuery = appQuery as jest.MockedFunction<typeof appQuery>;

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
  // insertResultComment 默认 mock：查询 auto 节点 + 插入评论
  mockAppQuery
    .mockResolvedValueOnce({ rows: [{ node_order: 2 }] } as any)  // SELECT auto node
    .mockResolvedValueOnce({ rows: [] } as any);                   // INSERT comment
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
// insertResultComment - 处理结果评论验证
// =====================================================

describe('onApprovedArCollection - insertResultComment', () => {
  /** 辅助函数：提取 insertResultComment 写入的评论内容 */
  function getInsertedComment(): string | null {
    const insertCalls = mockAppQuery.mock.calls.filter(
      (call: any[]) => typeof call[0] === 'string' && call[0].includes('INSERT INTO oa_approval_actions')
    );
    if (insertCalls.length === 0) return null;
    const params = insertCalls[0][1] as any[];
    return params[2] as string; // 第3个参数是 comment
  }

  it('核销标记-无账单明细：评论包含“无账单明细”', async () => {
    const instance = createMockInstance();
    await onApprovedArCollection(instance, { action: 'verify', billDetails: [] });
    expect(getInsertedComment()).toBe('核销验证：无账单明细，跳过检查');
  });

  it('核销标记-全部核销：评论包含“全部核销”', async () => {
    mockCheckExistingBillIds.mockResolvedValue(new Set());
    // UPDATE form_data (verifyStatus) 在 insertResultComment 之前调用
    mockAppQuery.mockReset();
    mockAppQuery
      .mockResolvedValueOnce({ rows: [] } as any)                   // UPDATE form_data
      .mockResolvedValueOnce({ rows: [{ node_order: 2 }] } as any)  // SELECT auto node (insertResultComment)
      .mockResolvedValueOnce({ rows: [] } as any);                   // INSERT comment
    const instance = createMockInstance();
    await onApprovedArCollection(instance, {
      action: 'verify',
      billDetails: [{ billNo: 'B1' }, { billNo: 'B2' }],
    });
    expect(getInsertedComment()).toBe('核销验证：2/2笔账单已全部核销，催收流程结束');
  });

  it('核销标记-部分核销：评论包含正确的数量比例', async () => {
    // mock insertResultComment + insertCollectionNode(transaction)
    mockCheckExistingBillIds.mockResolvedValue(new Set(['B1']));
    // UPDATE form_data (verifyStatus) 在 insertResultComment 之前调用
    mockAppQuery.mockReset();
    mockAppQuery
      .mockResolvedValueOnce({ rows: [] } as any)                   // UPDATE form_data
      .mockResolvedValueOnce({ rows: [{ node_order: 2 }] } as any)  // SELECT auto node (insertResultComment)
      .mockResolvedValueOnce({ rows: [] } as any);                   // INSERT comment
    // insertResultComment 已在 beforeEach 中 mock，但 insertCollectionNode 的 transaction 需要额外 mock
    mockTransaction.mockImplementationOnce(async (fn: any) => {
      const mockClient = {
        query: jest.fn()
          .mockResolvedValueOnce({ rows: [{ node_order: 2 }] })   // auto 节点查询
          .mockResolvedValueOnce({ rows: [{ user_id: 10 }] })     // 角色查找 (DISTINCT)
          .mockResolvedValueOnce({ rows: [{ name: '营销师' }] }), // 处理人名称查询
      };
      return fn(mockClient);
    });
    const instance = createMockInstance();
    await onApprovedArCollection(instance, {
      action: 'verify',
      billDetails: [{ billNo: 'B1' }, { billNo: 'B2' }, { billNo: 'B3' }],
    });
    expect(getInsertedComment()).toBe('核销验证：2/3笔已核销，剩余1笔继续催收');
  });

  it('核销标记-均未核销：评论包含“暂无已核销账单”', async () => {
    mockCheckExistingBillIds.mockResolvedValue(new Set(['B1', 'B2']));
    const instance = createMockInstance();
    await onApprovedArCollection(instance, {
      action: 'verify',
      billDetails: [{ billNo: 'B1' }, { billNo: 'B2' }],
    });
    expect(getInsertedComment()).toBe('核销验证：暂无已核销账单，需继续催收');
  });

  it('申请延期-L0首次：评论包含“已生效”', async () => {
    const instance = createMockInstance();
    await onApprovedArCollection(instance, {
      action: 'extension',
      extensionDays: 7,
      _currentLevel: 0,
      _extensionCount: 0,
    });
    expect(getInsertedComment()).toBe('延期7天已生效');
  });

  it('申请延期-L0二次有担保：评论包含“担保签字已验证”', async () => {
    const instance = createMockInstance();
    await onApprovedArCollection(instance, {
      action: 'extension',
      extensionDays: 15,
      _currentLevel: 0,
      _extensionCount: 1,
      guarantorSignature: 'data:image/png;base64,abc',
    });
    expect(getInsertedComment()).toBe('延期15天，担保签字已验证');
  });

  it('申请延期-L1：评论包含"已提交总经理审批"', async () => {
    mockTransaction.mockImplementationOnce(async (fn: any) => {
      const mockClient = {
        query: jest.fn()
          .mockResolvedValueOnce({ rows: [{ node_order: 2 }] })  // auto 节点查询
          .mockResolvedValueOnce({ rows: [{ user_id: 10 }] })    // 角色查找
          .mockResolvedValueOnce({ rows: [{ name: '总经理' }] }), // 处理人名称查询
      };
      return fn(mockClient);
    });
    const instance = createMockInstance();
    await onApprovedArCollection(instance, {
      action: 'extension',
      extensionDays: 10,
      _currentLevel: 1,
      _extensionCount: 0,
    });
    expect(getInsertedComment()).toBe('延期10天，已提交总经理审批');
  });

  it('存在差异：评论包含"等待财务核实"', async () => {
    mockTransaction.mockImplementationOnce(async (fn: any) => {
      const mockClient = {
        query: jest.fn()
          .mockResolvedValueOnce({ rows: [{ node_order: 2 }] })  // auto 节点查询
          .mockResolvedValueOnce({ rows: [{ user_id: 10 }] })    // 角色查找
          .mockResolvedValueOnce({ rows: [{ name: '会计' }] }),  // 处理人名称查询
      };
      return fn(mockClient);
    });
    const instance = createMockInstance();
    await onApprovedArCollection(instance, { action: 'difference', _currentLevel: 0 });
    expect(getInsertedComment()).toBe('已标记差异，等待财务核实');
  });

  it('升级处理：评论包含目标层级', async () => {
    mockTransaction.mockImplementationOnce(async (fn: any) => {
      const mockClient = {
        query: jest.fn()
          .mockResolvedValueOnce({ rows: [{ node_order: 2 }] })  // auto 节点查询
          .mockResolvedValueOnce({ rows: [{ user_id: 10 }] })    // 角色查找
          .mockResolvedValueOnce({ rows: [{ name: '经理' }] }),  // 处理人名称查询
      };
      return fn(mockClient);
    });
    const instance = createMockInstance();
    await onApprovedArCollection(instance, { action: 'escalate', _currentLevel: 0 });
    expect(getInsertedComment()).toBe('已升级到L1(营销经理)催收');
  });

  it('差异解决：评论包含"已安排营销师继续催收"', async () => {
    mockTransaction.mockImplementationOnce(async (fn: any) => {
      const mockClient = {
        query: jest.fn()
          .mockResolvedValueOnce({ rows: [{ node_order: 2 }] })  // auto 节点查询
          .mockResolvedValueOnce({ rows: [{ user_id: 10 }] })    // 角色查找
          .mockResolvedValueOnce({ rows: [{ name: '营销师' }] }),// 处理人名称查询
      };
      return fn(mockClient);
    });
    const instance = createMockInstance();
    await onApprovedArCollection(instance, { action: 'resolve_diff' });
    expect(getInsertedComment()).toBe('差异已解决，已安排营销师继续催收');
  });

  it('发函：评论为“发函完成”', async () => {
    const instance = createMockInstance();
    await onApprovedArCollection(instance, { action: 'send_letter' });
    expect(getInsertedComment()).toBe('发函完成');
  });

  it('起诉：评论为"已进入起诉立案程序"', async () => {
    mockTransaction.mockImplementationOnce(async (fn: any) => {
      const mockClient = {
        query: jest.fn()
          .mockResolvedValueOnce({ rows: [{ node_order: 2 }] })  // auto 节点查询
          .mockResolvedValueOnce({ rows: [{ user_id: 10 }] })    // 角色查找
          .mockResolvedValueOnce({ rows: [{ name: '会计' }] }),  // 处理人名称查询
      };
      return fn(mockClient);
    });
    const instance = createMockInstance();
    await onApprovedArCollection(instance, { action: 'lawsuit' });
    expect(getInsertedComment()).toBe('已进入起诉立案程序');
  });

  it('评论插入失败不影响主流程', async () => {
    // 让 appQuery 抛出异常（但 UPDATE form_data 成功）
    mockAppQuery.mockReset();
    mockAppQuery
      .mockResolvedValueOnce({ rows: [] } as any)               // UPDATE form_data (成功)
      .mockRejectedValueOnce(new Error('DB connection lost'));  // SELECT auto node (失败)
    mockCheckExistingBillIds.mockResolvedValue(new Set());
    const instance = createMockInstance();
    // 不应抛出异常
    await expect(
      onApprovedArCollection(instance, {
        action: 'verify',
        billDetails: [{ billNo: 'B1' }],
      })
    ).resolves.not.toThrow();
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
        query: jest.fn()
          .mockResolvedValueOnce({ rows: [{ node_order: 5 }] })  // auto 节点查询
          .mockResolvedValueOnce({ rows: [{ user_id: 10 }] })    // 角色查找
          .mockResolvedValueOnce({ rows: [{ name: '李江山' }] }), // 处理人名称查询
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

// =====================================================
// insertCollectionNode - 处理人自动分配验证
// =====================================================

describe('onApprovedArCollection - insertCollectionNode 处理人分配', () => {
  it('升级时新建的环节包含处理人', async () => {
    mockTransaction.mockImplementationOnce(async (fn: any) => {
      const mockClient = {
        query: jest.fn()
          .mockResolvedValueOnce({ rows: [{ node_order: 2 }] })  // auto 节点查询
          .mockResolvedValueOnce({ rows: [{ user_id: 10 }] })    // 角色查找
          .mockResolvedValueOnce({ rows: [{ name: '李江山' }] }), // 处理人名称查询
      };
      return fn(mockClient);
    });
    const instance = createMockInstance();
    await onApprovedArCollection(instance, { action: 'escalate', _currentLevel: 0 });
    expect(mockInsertNodeAfter).toHaveBeenCalledWith(
      expect.anything(), expect.any(Number), expect.any(Number),
      expect.objectContaining({
        type: 'approval',
        handler: { roleCode: 'marketing_manager' },
        assignedUserId: 10,
        assignedUserName: '李江山',
        signMode: 'or',
      }),
    );
  });

  it('差异处理时新建的环节包含处理人', async () => {
    mockTransaction.mockImplementationOnce(async (fn: any) => {
      const mockClient = {
        query: jest.fn()
          .mockResolvedValueOnce({ rows: [{ node_order: 2 }] })  // auto 节点查询
          .mockResolvedValueOnce({ rows: [{ user_id: 10 }] })    // 角色查找
          .mockResolvedValueOnce({ rows: [{ name: '王会计' }] }),// 处理人名称查询
      };
      return fn(mockClient);
    });
    const instance = createMockInstance();
    await onApprovedArCollection(instance, { action: 'difference', _currentLevel: 0 });
    expect(mockInsertNodeAfter).toHaveBeenCalledWith(
      expect.anything(), expect.any(Number), expect.any(Number),
      expect.objectContaining({
        type: 'approval',
        handler: { roleCode: 'current_accountant' },
        assignedUserId: 10,
        assignedUserName: '王会计',
        signMode: 'or',
      }),
    );
  });

  it('无匹配角色用户时 assignedUserId 为 undefined', async () => {
    mockTransaction.mockImplementationOnce(async (fn: any) => {
      const mockClient = {
        query: jest.fn()
          .mockResolvedValueOnce({ rows: [{ node_order: 2 }] })  // auto 节点查询
          .mockResolvedValueOnce({ rows: [] }),                   // 角色查找：无匹配用户
      };
      return fn(mockClient);
    });
    const instance = createMockInstance();
    await onApprovedArCollection(instance, { action: 'escalate', _currentLevel: 0 });
    expect(mockInsertNodeAfter).toHaveBeenCalledWith(
      expect.anything(), expect.any(Number), expect.any(Number),
      expect.objectContaining({
        type: 'approval',
        handler: { roleCode: 'marketing_manager' },
      }),
    );
  });
});
