/**
 * 战略商品管理操作控制器单元测试
 */

jest.mock('../utils/logger', () => ({
  createLogger: () => ({ warn: jest.fn(), info: jest.fn(), error: jest.fn() }),
}));

jest.mock('../services/strategic-product', () => ({
  addStrategicProducts: jest.fn(),
  deleteStrategicProduct: jest.fn(),
  confirmStrategicProduct: jest.fn(),
  batchConfirmStrategicProducts: jest.fn(),
  batchDeleteStrategicProducts: jest.fn(),
  syncCategoryPath: jest.fn(),
}));

import {
  addStrategicProductsController,
  deleteStrategicProductController,
  confirmStrategicProductController,
} from './strategic-product-mutation.controller';
import {
  addStrategicProducts,
  deleteStrategicProduct,
  confirmStrategicProduct,
} from '../services/strategic-product';
import { createMockRequest, createMockResponse } from '../__tests__/helpers/testFactory';

beforeEach(() => {
  jest.resetAllMocks();
});

describe('addStrategicProductsController', () => {
  it('成功添加战略商品', async () => {
    (addStrategicProducts as jest.Mock).mockResolvedValueOnce({ addedCount: 3, skippedCount: 0 });

    const req = createMockRequest({
      body: { goodsIds: ['G001', 'G002', 'G003'] },
      user: { userId: 5 },
    });
    const res = createMockResponse();

    await addStrategicProductsController(req, res);

    expect(addStrategicProducts).toHaveBeenCalledWith({ goodsIds: ['G001', 'G002', 'G003'], userId: 5 });
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ code: 200 }));
  });

  it('空 goodsIds 返回 400', async () => {
    const req = createMockRequest({ body: { goodsIds: [] }, user: { userId: 5 } });
    const res = createMockResponse();

    await addStrategicProductsController(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('非数组 goodsIds 返回 400', async () => {
    const req = createMockRequest({ body: { goodsIds: 'not-array' }, user: { userId: 5 } });
    const res = createMockResponse();

    await addStrategicProductsController(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('未登录返回 401', async () => {
    const req = createMockRequest({ body: { goodsIds: ['G001'] }, user: {} });
    const res = createMockResponse();

    await addStrategicProductsController(req, res);
    expect(res.status).toHaveBeenCalledWith(401);
  });

  it('异常时返回 500', async () => {
    (addStrategicProducts as jest.Mock).mockRejectedValueOnce(new Error('DB error'));

    const req = createMockRequest({
      body: { goodsIds: ['G001'] },
      user: { userId: 5 },
    });
    const res = createMockResponse();

    await addStrategicProductsController(req, res);
    expect(res.status).toHaveBeenCalledWith(500);
  });
});

describe('deleteStrategicProductController', () => {
  it('成功删除', async () => {
    (deleteStrategicProduct as jest.Mock).mockResolvedValueOnce(true);

    const req = createMockRequest({ params: { id: '1' } });
    const res = createMockResponse();

    await deleteStrategicProductController(req, res);
    expect(deleteStrategicProduct).toHaveBeenCalledWith(1);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ code: 200 }));
  });

  it('不存在时返回 404', async () => {
    (deleteStrategicProduct as jest.Mock).mockResolvedValueOnce(false);

    const req = createMockRequest({ params: { id: '999' } });
    const res = createMockResponse();

    await deleteStrategicProductController(req, res);
    expect(res.status).toHaveBeenCalledWith(404);
  });

  it('异常时返回 500', async () => {
    (deleteStrategicProduct as jest.Mock).mockRejectedValueOnce(new Error('fail'));

    const req = createMockRequest({ params: { id: '1' } });
    const res = createMockResponse();

    await deleteStrategicProductController(req, res);
    expect(res.status).toHaveBeenCalledWith(500);
  });
});

describe('confirmStrategicProductController', () => {
  it('成功确认', async () => {
    (confirmStrategicProduct as jest.Mock).mockResolvedValueOnce({ id: 1, status: 'confirmed' });

    const req = createMockRequest({
      params: { id: '1' },
      body: { action: 'confirm' },
      user: { userId: 5, roles: ['procurement_manager'], name: '张三' },
    });
    const res = createMockResponse();

    await confirmStrategicProductController(req, res);
    expect(confirmStrategicProduct).toHaveBeenCalledWith(
      expect.objectContaining({ id: 1, action: 'confirm', userId: 5 })
    );
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ code: 200 }));
  });

  it('无效 action 返回 400', async () => {
    const req = createMockRequest({
      params: { id: '1' },
      body: { action: 'invalid' },
      user: { userId: 5 },
    });
    const res = createMockResponse();

    await confirmStrategicProductController(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('未登录返回 401', async () => {
    const req = createMockRequest({
      params: { id: '1' },
      body: { action: 'confirm' },
      user: {},
    });
    const res = createMockResponse();

    await confirmStrategicProductController(req, res);
    expect(res.status).toHaveBeenCalledWith(401);
  });

  it('reject 操作', async () => {
    (confirmStrategicProduct as jest.Mock).mockResolvedValueOnce({ id: 1, status: 'rejected' });

    const req = createMockRequest({
      params: { id: '1' },
      body: { action: 'reject', comment: '不符合要求' },
      user: { userId: 5, roles: ['admin'], name: '管理员' },
    });
    const res = createMockResponse();

    await confirmStrategicProductController(req, res);
    expect(confirmStrategicProduct).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'reject', comment: '不符合要求' })
    );
  });
});
