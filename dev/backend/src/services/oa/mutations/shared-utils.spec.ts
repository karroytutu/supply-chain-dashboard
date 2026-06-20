/**
 * OA 共享工具函数测试
 * @module services/oa/mutations/shared-utils.spec
 */

jest.mock('../../../db/appPool', () => ({
  appQuery: jest.fn(),
  getAppClient: jest.fn(),
}));

jest.mock('../form-types', () => ({
  getFormTypeByCode: jest.fn(),
}));

import { getAppClient, appQuery } from '../../../db/appPool';
import { getFormTypeByCode } from '../form-types';
import { createMockPoolClient, mockQueryResult } from '../../../__tests__/helpers/mockDb';
import {
  insertNodeAfter,
  transaction,
  mergeFormData,
  getInstanceNotifyData,
} from './shared-utils';

const mockGetAppClient = getAppClient as jest.MockedFunction<typeof getAppClient>;
const mockAppQuery = appQuery as jest.MockedFunction<typeof appQuery>;
const mockGetFormTypeByCode = getFormTypeByCode as jest.MockedFunction<typeof getFormTypeByCode>;

beforeEach(() => {
  jest.clearAllMocks();
});

// =====================================================
// insertNodeAfter
// =====================================================

describe('insertNodeAfter', () => {
  it('更新后续节点顺序并插入新节点', async () => {
    const client = createMockPoolClient();
    const newNode = {
      name: '加签',
      type: 'approval' as const,
      assignedUserId: 200,
      assignedUserName: '李四',
    };

    const expectedRow = { id: 99, node_order: 3, node_name: '加签' };
    (client.query as jest.Mock)
      .mockResolvedValueOnce({ rows: [], rowCount: 2 }) // UPDATE
      .mockResolvedValueOnce({ rows: [expectedRow], rowCount: 1 }); // INSERT

    const result = await insertNodeAfter(client, 1, 2, newNode);

    // UPDATE: 移位 SQL
    expect(client.query).toHaveBeenNthCalledWith(
      1,
      expect.stringContaining('UPDATE oa_approval_nodes'),
      [1, 3] // instanceId=1, newOrder=afterOrder+1=3
    );

    // INSERT: 新节点 SQL（含 deadline_at、timeout_config、reminder_count）
    expect(client.query).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining('INSERT INTO oa_approval_nodes'),
      [1, 3, '加签', 'approval', null, 200, '李四', null, null, null, null]
    );

    expect(result).toEqual(expectedRow);
  });

  it('handler 不传时 SQL 参数 role_code 为 null', async () => {
    const client = createMockPoolClient();
    (client.query as jest.Mock)
      .mockResolvedValueOnce({ rows: [], rowCount: 0 })
      .mockResolvedValueOnce({ rows: [{ id: 1 }], rowCount: 1 });

    await insertNodeAfter(client, 1, 0, {
      name: '节点',
      type: 'approval' as const,
    });

    const insertCall = (client.query as jest.Mock).mock.calls[1];
    expect(insertCall[1][4]).toBeNull(); // role_code
  });

  it('inputSchema 为对象时 JSON 序列化', async () => {
    const client = createMockPoolClient();
    (client.query as jest.Mock)
      .mockResolvedValueOnce({ rows: [], rowCount: 0 })
      .mockResolvedValueOnce({ rows: [{ id: 1 }], rowCount: 1 });

    const schema = { fields: [{ key: 'test', type: 'text' }] };
    await insertNodeAfter(client, 1, 0, {
      name: '数据录入',
      type: 'handle' as any,
      inputSchema: schema as any,
    });

    const insertCall = (client.query as jest.Mock).mock.calls[1];
    expect(insertCall[1][7]).toBe(JSON.stringify(schema));
  });

  it('inputSchema 不传时 SQL 参数为 null', async () => {
    const client = createMockPoolClient();
    (client.query as jest.Mock)
      .mockResolvedValueOnce({ rows: [], rowCount: 0 })
      .mockResolvedValueOnce({ rows: [{ id: 1 }], rowCount: 1 });

    await insertNodeAfter(client, 1, 0, {
      name: '节点',
      type: 'approval' as const,
    });

    const insertCall = (client.query as jest.Mock).mock.calls[1];
    expect(insertCall[1][7]).toBeNull();
  });

  it('afterOrder=0 时 newOrder=1', async () => {
    const client = createMockPoolClient();
    (client.query as jest.Mock)
      .mockResolvedValueOnce({ rows: [], rowCount: 0 })
      .mockResolvedValueOnce({ rows: [{ id: 1 }], rowCount: 1 });

    await insertNodeAfter(client, 5, 0, {
      name: '首节点前插入',
      type: 'approval' as const,
    });

    // UPDATE 参数: [instanceId, newOrder] = [5, 1]
    expect((client.query as jest.Mock).mock.calls[0][1]).toEqual([5, 1]);
    // INSERT 参数第2个位置: newOrder = 1
    expect((client.query as jest.Mock).mock.calls[1][1][1]).toBe(1);
  });

  it('返回新插入的节点行', async () => {
    const client = createMockPoolClient();
    const mockRow = {
      id: 42,
      instance_id: 1,
      node_order: 2,
      node_name: '测试节点',
      node_type: 'approval',
      status: 'pending',
    };
    (client.query as jest.Mock)
      .mockResolvedValueOnce({ rows: [], rowCount: 0 })
      .mockResolvedValueOnce({ rows: [mockRow], rowCount: 1 });

    const result = await insertNodeAfter(client, 1, 1, {
      name: '测试节点',
      type: 'approval' as const,
    });

    expect(result).toEqual(mockRow);
  });
});

// =====================================================
// transaction
// =====================================================

describe('transaction', () => {
  it('正常流程: BEGIN → callback → COMMIT → release', async () => {
    const client = createMockPoolClient();
    mockGetAppClient.mockResolvedValue(client);

    const result = await transaction(async (c) => {
      return 'success';
    });

    expect(client.query).toHaveBeenNthCalledWith(1, 'BEGIN');
    expect(client.query).toHaveBeenNthCalledWith(2, 'COMMIT');
    expect(client.release).toHaveBeenCalled();
    expect(result).toBe('success');
  });

  it('callback 异常: BEGIN → throw → ROLLBACK → release → rethrow', async () => {
    const client = createMockPoolClient();
    mockGetAppClient.mockResolvedValue(client);

    const error = new Error('test error');
    await expect(
      transaction(async () => {
        throw error;
      })
    ).rejects.toThrow('test error');

    expect(client.query).toHaveBeenNthCalledWith(1, 'BEGIN');
    expect(client.query).toHaveBeenNthCalledWith(2, 'ROLLBACK');
    expect(client.release).toHaveBeenCalled();
  });

  it('finally 中始终释放 client', async () => {
    const client = createMockPoolClient();
    mockGetAppClient.mockResolvedValue(client);

    try {
      await transaction(async () => {
        throw new Error('fail');
      });
    } catch {
      // expected
    }

    expect(client.release).toHaveBeenCalledTimes(1);
  });
});

// =====================================================
// mergeFormData
// =====================================================

describe('mergeFormData', () => {
  it('合并新字段到 formData', () => {
    const result = mergeFormData({ a: 1 }, { b: 2 });
    expect(result).toEqual({ a: 1, b: 2 });
  });

  it('覆盖已有字段', () => {
    const result = mergeFormData({ a: 1 }, { a: 2 });
    expect(result).toEqual({ a: 2 });
  });

  it('null 值覆盖已有字段（显式清空），undefined 值不覆盖', () => {
    const result = mergeFormData({ a: 1, b: 2 }, { a: null, b: undefined });
    expect(result).toEqual({ a: null, b: 2 });
  });

  it('不修改原对象', () => {
    const original = { a: 1 };
    const result = mergeFormData(original, { b: 2 });
    expect(original).toEqual({ a: 1 });
    expect(result).toEqual({ a: 1, b: 2 });
  });
});

// =====================================================
// getInstanceNotifyData
// =====================================================

describe('getInstanceNotifyData', () => {
  it('实例不存在时返回 null', async () => {
    mockAppQuery.mockResolvedValueOnce(mockQueryResult([]));

    const result = await getInstanceNotifyData(999);
    expect(result).toBeNull();
  });

  it('实例存在时返回完整通知数据', async () => {
    const instance = {
      id: 1,
      form_type_id: 10,
      instance_no: 'OA-001',
      title: '测试',
      status: 'pending',
    };

    mockAppQuery
      .mockResolvedValueOnce(mockQueryResult([instance])) // instance query
      .mockResolvedValueOnce(mockQueryResult([{ code: 'other_payment', name: '其他付款' }])); // form type query

    mockGetFormTypeByCode.mockReturnValue({
      code: 'other_payment',
      name: '其他付款',
    } as any);

    const result = await getInstanceNotifyData(1);
    expect(result).not.toBeNull();
    expect(result!.instance).toEqual(instance);
    expect(result!.formTypeCode).toBe('other_payment');
    expect(result!.formTypeName).toBe('其他付款');
    expect(result!.formType).toBeDefined();
  });
});
