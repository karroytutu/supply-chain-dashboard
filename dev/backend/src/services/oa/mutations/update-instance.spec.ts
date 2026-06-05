/**
 * OA 实例表单数据更新 测试
 * @module services/oa/mutations/update-instance.spec
 */

jest.mock('../../../db/appPool', () => ({
  appQuery: jest.fn(),
}));

jest.mock('../../../utils/logger', () => ({
  createLogger: () => ({ warn: jest.fn(), info: jest.fn(), error: jest.fn() }),
}));

import { appQuery } from '../../../db/appPool';
import { updateInstanceFormData } from './update-instance';

const mockAppQuery = appQuery as jest.MockedFunction<typeof appQuery>;

beforeEach(() => {
  jest.clearAllMocks();
});

describe('updateInstanceFormData', () => {
  it('审批实例不存在时抛出错误', async () => {
    mockAppQuery.mockResolvedValueOnce({ rows: [] } as any);

    await expect(
      updateInstanceFormData(999, 1, '张三', { foo: 'bar' })
    ).rejects.toThrow('审批实例不存在');
  });

  it('合并新数据到已有 form_data', async () => {
    mockAppQuery
      .mockResolvedValueOnce({ rows: [{ form_data: { a: 1, b: 2 } }] } as any) // SELECT
      .mockResolvedValueOnce({ rows: [] } as any) // UPDATE
      .mockResolvedValueOnce({ rows: [] } as any); // INSERT action

    await updateInstanceFormData(1, 10, '张三', { b: 20, c: 30 });

    // 验证 UPDATE 的 form_data 参数包含合并后的数据
    const updateCall = mockAppQuery.mock.calls[1];
    const formDataParam = JSON.parse(updateCall[1]![0] as string);
    expect(formDataParam).toEqual({ a: 1, b: 20, c: 30 });
  });

  it('null/undefined 值不覆盖已有字段', async () => {
    mockAppQuery
      .mockResolvedValueOnce({ rows: [{ form_data: { a: 1, b: 2 } }] } as any)
      .mockResolvedValueOnce({ rows: [] } as any)
      .mockResolvedValueOnce({ rows: [] } as any);

    await updateInstanceFormData(1, 10, '张三', { a: null, b: undefined } as any);

    const updateCall = mockAppQuery.mock.calls[1];
    const formDataParam = JSON.parse(updateCall[1]![0] as string);
    expect(formDataParam).toEqual({ a: 1, b: 2 }); // 原值保留
  });

  it('插入 action_type=update 操作记录', async () => {
    mockAppQuery
      .mockResolvedValueOnce({ rows: [{ form_data: {} }] } as any)
      .mockResolvedValueOnce({ rows: [] } as any)
      .mockResolvedValueOnce({ rows: [] } as any);

    await updateInstanceFormData(1, 10, '张三', { x: 1 }, '更新了数据');

    const insertCall = mockAppQuery.mock.calls[2];
    expect(insertCall[0]).toContain("'update'");
    expect(insertCall[1]).toEqual([1, 10, '张三', '更新了数据']);
  });

  it('不传 comment 时操作记录 comment 为 null', async () => {
    mockAppQuery
      .mockResolvedValueOnce({ rows: [{ form_data: {} }] } as any)
      .mockResolvedValueOnce({ rows: [] } as any)
      .mockResolvedValueOnce({ rows: [] } as any);

    await updateInstanceFormData(1, 10, '张三', { x: 1 });

    const insertCall = mockAppQuery.mock.calls[2];
    expect(insertCall[1]![3]).toBeNull();
  });

  it('实例 form_data 为 null 时初始化为空对象', async () => {
    mockAppQuery
      .mockResolvedValueOnce({ rows: [{ form_data: null }] } as any)
      .mockResolvedValueOnce({ rows: [] } as any)
      .mockResolvedValueOnce({ rows: [] } as any);

    await updateInstanceFormData(1, 10, '张三', { newField: 'value' });

    const updateCall = mockAppQuery.mock.calls[1];
    const formDataParam = JSON.parse(updateCall[1]![0] as string);
    expect(formDataParam).toEqual({ newField: 'value' });
  });
});
