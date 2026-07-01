/**
 * 目标管理变更服务单元测试
 * @module services/sales-target/sales-target-mutation.spec.ts
 */

jest.mock('../../utils/logger', () => ({
  createLogger: () => ({ warn: jest.fn(), info: jest.fn(), error: jest.fn(), debug: jest.fn() }),
}));
jest.mock('./sales-target.repository', () => ({
  createTarget: jest.fn(),
  updateTargetItems: jest.fn(),
  deleteTarget: jest.fn(),
  getTargetById: jest.fn(),
}));

import { saveTarget, updateTarget, removeTarget } from './sales-target-mutation.service';
import { createTarget, updateTargetItems, deleteTarget, getTargetById } from './sales-target.repository';

const mockCreateTarget = createTarget as jest.MockedFunction<typeof createTarget>;
const mockUpdateTargetItems = updateTargetItems as jest.MockedFunction<typeof updateTargetItems>;
const mockDeleteTarget = deleteTarget as jest.MockedFunction<typeof deleteTarget>;
const mockGetTargetById = getTargetById as jest.MockedFunction<typeof getTargetById>;

beforeEach(() => jest.clearAllMocks());

describe('saveTarget', () => {
  it('调用 createTarget 并透传 params', async () => {
    const params = { marketer_id: 100, year: 2026, month: 7, items: [] };
    mockCreateTarget.mockResolvedValue({ id: 1, ...params } as any);

    const result = await saveTarget(params);

    expect(result).toEqual({ id: 1, ...params });
    expect(mockCreateTarget).toHaveBeenCalledWith(params);
  });
});

describe('updateTarget', () => {
  it('目标不存在 → 抛出 "目标不存在"', async () => {
    mockGetTargetById.mockResolvedValue(null);

    await expect(updateTarget(999, [])).rejects.toThrow('目标不存在');
    expect(mockUpdateTargetItems).not.toHaveBeenCalled();
  });

  it('目标存在 → 调用 updateTargetItems', async () => {
    mockGetTargetById.mockResolvedValue({ id: 1, marketer_id: 100 } as any);
    mockUpdateTargetItems.mockResolvedValue(undefined as any);

    const items = [{
      erp_consumer_id: 1001, consumer_name: '客户A', is_planned_new: false,
      erp_goods_id: 101, goods_name: '商品A', category_name: '品类1',
      unit: '箱', unit_price: 10, target_amount: 500, remark: '',
    }];
    await updateTarget(1, items as any);

    expect(mockUpdateTargetItems).toHaveBeenCalledWith(1, items);
  });
});

describe('removeTarget', () => {
  it('目标不存在 → 抛出 "目标不存在"', async () => {
    mockGetTargetById.mockResolvedValue(null);

    await expect(removeTarget(999)).rejects.toThrow('目标不存在');
    expect(mockDeleteTarget).not.toHaveBeenCalled();
  });

  it('目标存在 → 调用 deleteTarget', async () => {
    mockGetTargetById.mockResolvedValue({ id: 1, marketer_id: 100 } as any);
    mockDeleteTarget.mockResolvedValue(undefined as any);

    await removeTarget(1);

    expect(mockDeleteTarget).toHaveBeenCalledWith(1);
  });
});
