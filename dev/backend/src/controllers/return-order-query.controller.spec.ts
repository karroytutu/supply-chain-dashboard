/**
 * 退货单查询控制器单元测试
 */

jest.mock('../utils/logger', () => ({
  createLogger: () => ({ warn: jest.fn(), info: jest.fn(), error: jest.fn() }),
}));

jest.mock('../services/return-order', () => ({
  getReturnOrders: jest.fn(),
  getReturnOrderById: jest.fn(),
  getReturnOrderStats: jest.fn(),
  getPendingErpOrders: jest.fn(),
  getReturnOrderActions: jest.fn(),
}));

import {
  getReturnOrdersController,
  getReturnOrderByIdController,
  getReturnOrderStatsController,
  getPendingErpOrdersController,
  getReturnOrderActionsController,
} from './return-order-query.controller';
import {
  getReturnOrders,
  getReturnOrderById,
  getReturnOrderStats,
  getPendingErpOrders,
  getReturnOrderActions,
} from '../services/return-order';
import { createMockRequest, createMockResponse } from '../__tests__/helpers/testFactory';

beforeEach(() => {
  jest.resetAllMocks();
});

describe('getReturnOrdersController', () => {
  it('成功查询退货单列表', async () => {
    const result = { data: [{ id: 1 }], total: 1, page: 1, pageSize: 20 };
    (getReturnOrders as jest.Mock).mockResolvedValueOnce(result);

    const req = createMockRequest({ query: { page: '1', page_size: '20', status: 'pending_confirm' } });
    const res = createMockResponse();

    await getReturnOrdersController(req, res);

    expect(getReturnOrders).toHaveBeenCalledWith(
      expect.objectContaining({ page: 1, pageSize: 20, status: 'pending_confirm' })
    );
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ code: 200, data: result }));
  });

  it('支持 pageSize 参数（camelCase）', async () => {
    (getReturnOrders as jest.Mock).mockResolvedValueOnce({ data: [], total: 0 });

    const req = createMockRequest({ query: { pageSize: '50' } });
    const res = createMockResponse();

    await getReturnOrdersController(req, res);
    expect(getReturnOrders).toHaveBeenCalledWith(expect.objectContaining({ pageSize: 50 }));
  });

  it('异常时返回 500', async () => {
    (getReturnOrders as jest.Mock).mockRejectedValueOnce(new Error('DB error'));

    const req = createMockRequest();
    const res = createMockResponse();

    await getReturnOrdersController(req, res);
    expect(res.status).toHaveBeenCalledWith(500);
  });
});

describe('getReturnOrderByIdController', () => {
  it('成功获取退货单详情', async () => {
    const order = { id: 1, return_no: 'RT-001' };
    (getReturnOrderById as jest.Mock).mockResolvedValueOnce(order);

    const req = createMockRequest({ params: { id: '1' } });
    const res = createMockResponse();

    await getReturnOrderByIdController(req, res);

    expect(getReturnOrderById).toHaveBeenCalledWith(1);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ code: 200, data: order }));
  });

  it('异常时返回 500', async () => {
    (getReturnOrderById as jest.Mock).mockRejectedValueOnce(new Error('fail'));

    const req = createMockRequest({ params: { id: '999' } });
    const res = createMockResponse();

    await getReturnOrderByIdController(req, res);
    expect(res.status).toHaveBeenCalledWith(500);
  });
});

describe('getReturnOrderStatsController', () => {
  it('成功获取统计', async () => {
    const stats = { total: '20', pending_confirm: '5' };
    (getReturnOrderStats as jest.Mock).mockResolvedValueOnce(stats);

    const req = createMockRequest();
    const res = createMockResponse();

    await getReturnOrderStatsController(req, res);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ code: 200, data: stats }));
  });
});

describe('getPendingErpOrdersController', () => {
  it('成功获取待填写列表', async () => {
    const orders = [{ id: 1, status: 'pending_erp_fill' }];
    (getPendingErpOrders as jest.Mock).mockResolvedValueOnce(orders);

    const req = createMockRequest();
    const res = createMockResponse();

    await getPendingErpOrdersController(req, res);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ code: 200, data: orders }));
  });
});

describe('getReturnOrderActionsController', () => {
  it('成功获取操作记录', async () => {
    const actions = [{ id: 1, action_type: 'create' }];
    (getReturnOrderActions as jest.Mock).mockResolvedValueOnce(actions);

    const req = createMockRequest({ params: { id: '5' } });
    const res = createMockResponse();

    await getReturnOrderActionsController(req, res);

    expect(getReturnOrderActions).toHaveBeenCalledWith(5);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ code: 200, data: actions }));
  });
});
