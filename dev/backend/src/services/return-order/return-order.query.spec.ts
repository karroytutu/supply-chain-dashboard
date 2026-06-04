jest.mock('./return-order.repository', () => ({
  getOrders: jest.fn(),
  getOrderById: jest.fn(),
  getStats: jest.fn(),
  getPendingErpOrders: jest.fn(),
  getActions: jest.fn(),
}));

jest.mock('./return-order.mapper', () => ({
  toReturnOrderDTO: jest.fn((x) => ({ ...x, mapped: true })),
  toReturnActionDTO: jest.fn((x) => ({ ...x, mapped: true })),
  toReturnOrderStatsDTO: jest.fn((x) => ({ ...x, mapped: true })),
}));

import {
  getReturnOrders,
  getReturnOrderById,
  getReturnOrderStats,
  getPendingErpOrders,
  getReturnOrderActions,
} from './return-order.query';
import * as repo from './return-order.repository';
import { toReturnOrderDTO, toReturnActionDTO, toReturnOrderStatsDTO } from './return-order.mapper';

beforeEach(() => {
  jest.resetAllMocks();
  (toReturnOrderDTO as jest.Mock).mockImplementation((x) => ({ ...x, mapped: true }));
  (toReturnActionDTO as jest.Mock).mockImplementation((x) => ({ ...x, mapped: true }));
  (toReturnOrderStatsDTO as jest.Mock).mockImplementation((x) => ({ ...x, mapped: true }));
});

describe('getReturnOrders', () => {
  it('查询并转换结果', async () => {
    (repo.getOrders as jest.Mock).mockResolvedValueOnce({
      data: [{ id: 1, return_no: 'R001' }],
      total: 1,
    });
    const result = await getReturnOrders({ page: 1, page_size: 10 } as any);
    expect(result.total).toBe(1);
    expect(result.data[0]).toEqual(expect.objectContaining({ id: 1, mapped: true }));
    expect(toReturnOrderDTO).toHaveBeenCalledTimes(1);
  });
});

describe('getReturnOrderById', () => {
  it('存在时返回转换后的 DTO', async () => {
    (repo.getOrderById as jest.Mock).mockResolvedValueOnce({ id: 1, return_no: 'R001' });
    const result = await getReturnOrderById(1);
    expect(result).toEqual(expect.objectContaining({ id: 1, mapped: true }));
  });

  it('不存在时返回 null', async () => {
    (repo.getOrderById as jest.Mock).mockResolvedValueOnce(null);
    const result = await getReturnOrderById(999);
    expect(result).toBeNull();
  });
});

describe('getReturnOrderStats', () => {
  it('返回转换后的统计', async () => {
    (repo.getStats as jest.Mock).mockResolvedValueOnce({ total_count: 10, pending_count: 3 });
    const result = await getReturnOrderStats();
    expect(result).toEqual(expect.objectContaining({ total_count: 10, mapped: true }));
  });
});

describe('getPendingErpOrders', () => {
  it('查询并手动映射待 ERP 退货单', async () => {
    (repo.getPendingErpOrders as jest.Mock).mockResolvedValueOnce([
      {
        id: 1,
        return_no: 'R001',
        goods_id: 100,
        goods_name: 'Test',
        quantity: '5.5',
        unit: '件',
        batch_date: '2026-01-01',
        return_date: '2026-06-01',
        expire_date: '2026-12-31',
        shelf_life: 365,
        days_to_expire: 180,
        days_to_expire_at_return: 200,
        status: 'pending',
        source_bill_no: 'S001',
        consumer_name: 'Customer',
        marketing_manager: 'Manager',
        created_at: '2026-01-01',
        updated_at: '2026-06-01',
      },
    ]);
    const result = await getPendingErpOrders();
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe(1);
    expect(result[0].quantity).toBe(5.5);
    expect(result[0].erpReturnNo).toBeNull();
    expect(result[0].warehouseReturnQuantity).toBeNull();
  });

  it('quantity 非数字时为 0', async () => {
    (repo.getPendingErpOrders as jest.Mock).mockResolvedValueOnce([
      { id: 2, quantity: 'bad' },
    ]);
    const result = await getPendingErpOrders();
    expect(result[0].quantity).toBe(0);
  });
});

describe('getReturnOrderActions', () => {
  it('查询并转换操作记录', async () => {
    (repo.getActions as jest.Mock).mockResolvedValueOnce([
      { id: 1, action: 'submit' },
      { id: 2, action: 'approve' },
    ]);
    const result = await getReturnOrderActions(1);
    expect(result).toHaveLength(2);
    expect(result[0]).toEqual(expect.objectContaining({ id: 1, mapped: true }));
    expect(toReturnActionDTO).toHaveBeenCalledTimes(2);
  });
});
