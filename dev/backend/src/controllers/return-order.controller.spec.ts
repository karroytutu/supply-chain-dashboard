/**
 * 退货单操作控制器单元测试
 */

jest.mock('../utils/logger', () => ({
  createLogger: () => ({ warn: jest.fn(), info: jest.fn(), error: jest.fn() }),
}));

jest.mock('../services/return-order', () => ({
  batchConfirmReturnOrders: jest.fn(),
  cancelReturnOrder: jest.fn(),
  fillErpReturnNo: jest.fn(),
  warehouseExecute: jest.fn(),
  marketingSaleComplete: jest.fn(),
  rollbackReturnOrder: jest.fn(),
}));

jest.mock('../services/scheduler/sync-return-orders.task', () => ({
  syncReturnOrders: jest.fn(),
}));

import {
  batchConfirmReturnOrdersController,
  cancelReturnOrderController,
  fillErpReturnNoController,
  warehouseExecuteController,
  marketingSaleCompleteController,
  rollbackReturnOrderController,
} from './return-order.controller';
import {
  batchConfirmReturnOrders,
  cancelReturnOrder,
  fillErpReturnNo,
  warehouseExecute,
  marketingSaleComplete,
  rollbackReturnOrder,
} from '../services/return-order';
import { createMockRequest, createMockResponse } from '../__tests__/helpers/testFactory';

beforeEach(() => {
  jest.resetAllMocks();
});

describe('batchConfirmReturnOrdersController', () => {
  it('成功批量确认', async () => {
    (batchConfirmReturnOrders as jest.Mock).mockResolvedValueOnce({ successCount: 2, failedCount: 0 });

    const req = createMockRequest({
      body: { orderIds: [1, 2], ruleDecision: 'can_return' },
      user: { userId: 5, name: '张三' },
    });
    const res = createMockResponse();

    await batchConfirmReturnOrdersController(req, res);

    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ code: 200 }));
  });

  it('未登录时返回 401', async () => {
    const req = createMockRequest({
      body: { orderIds: [1] },
      user: {},
    });
    const res = createMockResponse();

    await batchConfirmReturnOrdersController(req, res);

    expect(res.status).toHaveBeenCalledWith(401);
  });
});

describe('cancelReturnOrderController', () => {
  it('成功取消', async () => {
    (cancelReturnOrder as jest.Mock).mockResolvedValueOnce({ id: 1, status: 'cancelled' });

    const req = createMockRequest({
      params: { id: '1' },
      user: { userId: 5, name: '张三' },
    });
    const res = createMockResponse();

    await cancelReturnOrderController(req, res);
    expect(cancelReturnOrder).toHaveBeenCalledWith(1, 5, '张三');
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ code: 200 }));
  });

  it('未登录时返回 401', async () => {
    const req = createMockRequest({ params: { id: '1' }, user: {} });
    const res = createMockResponse();

    await cancelReturnOrderController(req, res);
    expect(res.status).toHaveBeenCalledWith(401);
  });
});

describe('fillErpReturnNoController', () => {
  it('成功填写 ERP 退货单号', async () => {
    (fillErpReturnNo as jest.Mock).mockResolvedValueOnce({ id: 1, status: 'pending_warehouse_execute' });

    const req = createMockRequest({
      params: { id: '1' },
      body: { erpReturnNo: 'ERP-001' },
      user: { userId: 5, name: '张三' },
    });
    const res = createMockResponse();

    await fillErpReturnNoController(req, res);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ code: 200 }));
  });

  it('erpReturnNo 为空时返回 400', async () => {
    const req = createMockRequest({
      params: { id: '1' },
      body: {},
      user: { userId: 5, name: '张三' },
    });
    const res = createMockResponse();

    await fillErpReturnNoController(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('未登录时返回 401', async () => {
    const req = createMockRequest({
      params: { id: '1' },
      body: { erpReturnNo: 'ERP-001' },
      user: {},
    });
    const res = createMockResponse();

    await fillErpReturnNoController(req, res);
    expect(res.status).toHaveBeenCalledWith(401);
  });
});

describe('warehouseExecuteController', () => {
  it('成功仓储执行', async () => {
    (warehouseExecute as jest.Mock).mockResolvedValueOnce({ id: 1, status: 'completed' });

    const req = createMockRequest({
      params: { id: '1' },
      body: { evidenceUrls: ['url1'], comment: '完成' },
      user: { userId: 5, name: '王五' },
    });
    const res = createMockResponse();

    await warehouseExecuteController(req, res);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ code: 200 }));
  });

  it('evidenceUrls 为空时返回 400', async () => {
    const req = createMockRequest({
      params: { id: '1' },
      body: { evidenceUrls: [] },
      user: { userId: 5, name: '王五' },
    });
    const res = createMockResponse();

    await warehouseExecuteController(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
  });
});

describe('marketingSaleCompleteController', () => {
  it('成功完成营销销售', async () => {
    (marketingSaleComplete as jest.Mock).mockResolvedValueOnce({ id: 1, status: 'completed' });

    const req = createMockRequest({
      params: { id: '1' },
      body: { comment: '销售完成' },
      user: { userId: 5, name: '赵六' },
    });
    const res = createMockResponse();

    await marketingSaleCompleteController(req, res);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ code: 200 }));
  });
});

describe('rollbackReturnOrderController', () => {
  it('成功回退', async () => {
    (rollbackReturnOrder as jest.Mock).mockResolvedValueOnce({ id: 1, status: 'pending_confirm' });

    const req = createMockRequest({
      params: { id: '1' },
      body: { comment: '回退' },
      user: { userId: 5, name: '张三' },
    });
    const res = createMockResponse();

    await rollbackReturnOrderController(req, res);
    expect(rollbackReturnOrder).toHaveBeenCalledWith(
      expect.objectContaining({ id: 1, operatorId: 5, comment: '回退' })
    );
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ code: 200 }));
  });
});
