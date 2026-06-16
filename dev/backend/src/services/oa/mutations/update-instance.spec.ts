/**
 * OA 实例表单数据更新 测试
 * @module services/oa/mutations/update-instance.spec
 */

jest.mock('../../../db/appPool', () => ({
  appQuery: jest.fn(),
  getAppClient: jest.fn(),
}));

jest.mock('../../../utils/logger', () => ({
  createLogger: () => ({ warn: jest.fn(), info: jest.fn(), error: jest.fn() }),
}));

import { getAppClient } from '../../../db/appPool';
import { updateInstanceFormData } from './update-instance';

const mockGetAppClient = getAppClient as jest.MockedFunction<typeof getAppClient>;

/**
 * 构造事务 mock：getAppClient → client (query + release)
 * 事务内查询顺序：
 *   BEGIN → advisory lock → SELECT FOR UPDATE → [getCurrentPendingNodeByUser] → UPDATE form_data → INSERT action → [INSERT comment] → COMMIT
 */
function setupTransaction(
  selectResult: any,
  extraQueryResults: any[] = [],
  options: { hasCurrentNodeQuery?: boolean } = {}
) {
  const queryMock = jest.fn()
    .mockResolvedValueOnce({} as any)           // BEGIN
    .mockResolvedValueOnce({ rows: [] } as any) // advisory lock
    .mockResolvedValueOnce(selectResult)          // SELECT ... FOR UPDATE

  if (options.hasCurrentNodeQuery) {
    queryMock.mockResolvedValueOnce({ rows: [] } as any); // getCurrentPendingNodeByUser
  }

  queryMock.mockResolvedValueOnce({} as any); // UPDATE form_data

  for (const r of extraQueryResults) {
    queryMock.mockResolvedValueOnce(r);
  }
  // COMMIT（默认在最后）
  queryMock.mockResolvedValueOnce({} as any);
  // ROLLBACK（如果事务失败）
  queryMock.mockResolvedValueOnce({} as any);

  const mockClient = { query: queryMock, release: jest.fn() };
  mockGetAppClient.mockResolvedValue(mockClient as any);
  return mockClient;
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('updateInstanceFormData', () => {
  it('审批实例不存在时抛出错误', async () => {
    setupTransaction({ rows: [] } as any);

    await expect(
      updateInstanceFormData(999, 1, '张三', { foo: 'bar' })
    ).rejects.toThrow('审批实例不存在');
  });

  it('合并新数据到已有 form_data', async () => {
    const mockClient = setupTransaction(
      { rows: [{ form_data: { a: 1, b: 2 }, current_node_order: null, applicant_id: 10 }] },
      [{ rows: [] }, { rows: [] }], // INSERT action, (no comment)
    );

    await updateInstanceFormData(1, 10, '张三', { b: 20, c: 30 });

    // client.query 调用顺序：BEGIN=0, advisory lock=1, SELECT=2, UPDATE=3, INSERT action=4, COMMIT=5
    const updateCall = mockClient.query.mock.calls[3]; // UPDATE
    const formDataParam = JSON.parse(updateCall[1]![0] as string);
    expect(formDataParam).toEqual({ a: 1, b: 20, c: 30 });
  });

  it('undefined 值不覆盖已有字段，null 值允许覆盖（显式清空）', async () => {
    const mockClient = setupTransaction(
      { rows: [{ form_data: { a: 1, b: 2 }, current_node_order: null, applicant_id: 10 }] },
      [{ rows: [] }],
    );

    await updateInstanceFormData(1, 10, '张三', { a: null, b: undefined } as any);

    const updateCall = mockClient.query.mock.calls[3];
    const formDataParam = JSON.parse(updateCall[1]![0] as string);
    expect(formDataParam).toEqual({ a: null, b: 2 }); // null 覆盖，undefined 保留
  });

  it('插入 action_type=update 操作记录（在事务内）', async () => {
    const mockClient = setupTransaction(
      { rows: [{ form_data: {}, current_node_order: 2, applicant_id: 10 }] },
      [{ rows: [] }, { rows: [] }], // INSERT action, INSERT comment
      { hasCurrentNodeQuery: true }
    );

    await updateInstanceFormData(1, 10, '张三', { x: 1 }, '更新了数据');

    // client.query 调用顺序：BEGIN=0, advisory lock=1, SELECT=2, getCurrentNode=3, UPDATE=4, INSERT action=5
    const insertCall = mockClient.query.mock.calls[5];
    expect(insertCall[0]).toContain("'update'");
    // 参数：[instanceId, userId, userName, currentNodeOrder, null, details]
    expect(insertCall[1]).toEqual([1, 10, '张三', 2, null, expect.any(String)]);
    // 验证 details 包含 formDataDiff
    const details = JSON.parse(insertCall[1]![5] as string);
    expect(details).toEqual({ formDataDiff: { x: 1 } });
  });

  it('不传 comment 时不插入 comment 记录', async () => {
    const mockClient = setupTransaction(
      { rows: [{ form_data: {}, current_node_order: null, applicant_id: 10 }] },
      [{ rows: [] }], // 仅 INSERT action，无 INSERT comment
    );

    await updateInstanceFormData(1, 10, '张三', { x: 1 });

    // 调用次数：BEGIN + advisory lock + SELECT + UPDATE + INSERT action + COMMIT = 6
    expect(mockClient.query).toHaveBeenCalledTimes(6);
  });

  it('实例 form_data 为 null 时初始化为空对象', async () => {
    const mockClient = setupTransaction(
      { rows: [{ form_data: null, current_node_order: null, applicant_id: 10 }] },
      [{ rows: [] }],
    );

    await updateInstanceFormData(1, 10, '张三', { newField: 'value' });

    const updateCall = mockClient.query.mock.calls[3];
    const formDataParam = JSON.parse(updateCall[1]![0] as string);
    expect(formDataParam).toEqual({ newField: 'value' });
  });

  it('事务内使用 SELECT ... FOR UPDATE 加行锁', async () => {
    const mockClient = setupTransaction(
      { rows: [{ form_data: {}, current_node_order: null, applicant_id: 10 }] },
      [{ rows: [] }],
    );

    await updateInstanceFormData(1, 10, '张三', { x: 1 });

    // 验证 SELECT 查询包含 FOR UPDATE（advisory lock 之后）
    const selectCall = mockClient.query.mock.calls[2];
    expect(selectCall[0]).toContain('FOR UPDATE');
  });

  it('action 记录的 details 存储编辑 diff（仅变更字段）', async () => {
    const mockClient = setupTransaction(
      { rows: [{ form_data: { a: 1, b: 2 }, current_node_order: null, applicant_id: 10 }] },
      [{ rows: [] }], // INSERT action（无 comment INSERT）
    );

    // 提交 a: 1（未变）和 b: 20（变更）
    await updateInstanceFormData(1, 10, '张三', { a: 1, b: 20 });

    const insertCall = mockClient.query.mock.calls[4];
    const details = JSON.parse(insertCall[1]![5] as string);
    // 只有 b 是变更的
    expect(details).toEqual({ formDataDiff: { b: 20 } });
  });

  it('无变更时 details 为 null', async () => {
    const mockClient = setupTransaction(
      { rows: [{ form_data: { a: 1 }, current_node_order: null, applicant_id: 10 }] },
      [{ rows: [] }],
    );

    // 提交相同值
    await updateInstanceFormData(1, 10, '张三', { a: 1 });

    const insertCall = mockClient.query.mock.calls[4];
    expect(insertCall[1]![5]).toBeNull(); // details 为 null
  });
});
