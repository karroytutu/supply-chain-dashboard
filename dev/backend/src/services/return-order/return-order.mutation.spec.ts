/**
 * 退货单变更服务单元测试
 * Mock: repository, mapper, notify, assessment, goods-return-rules
 */

jest.mock('../../utils/logger', () => ({
  createLogger: () => ({ warn: jest.fn(), info: jest.fn(), error: jest.fn() }),
}));

jest.mock('./return-order.repository', () => ({
  createOrder: jest.fn(),
  recordCreateAction: jest.fn(),
  recordAction: jest.fn(),
  getOrderStatus: jest.fn(),
  updateStatus: jest.fn(),
  batchConfirm: jest.fn(),
  fillErpReturnNo: jest.fn(),
  warehouseExecute: jest.fn(),
  marketingSaleComplete: jest.fn(),
  rollbackOrder: jest.fn(),
  getRawOrderById: jest.fn(),
  autoCompleteMarketingSale: jest.fn(),
  invalidateOrderCache: jest.fn(),
}));

jest.mock('./return-order-notify', () => ({
  notifyPendingErpFill: jest.fn().mockResolvedValue(undefined),
  notifyPendingMarketingSale: jest.fn().mockResolvedValue(undefined),
  notifyPendingWarehouseExecute: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('../assessment/assessment-calculate', () => ({
  runCalculation: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('../goods-return-rules', () => ({
  createGoodsReturnRule: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('../../utils/constants', () => ({
  RETURN_EXPIRE_INSUFFICIENT_DAYS: 15,
}));

import * as repo from './return-order.repository';
import {
  notifyPendingErpFill,
  notifyPendingMarketingSale,
  notifyPendingWarehouseExecute,
} from './return-order-notify';
import { runCalculation } from '../assessment/assessment-calculate';
import { createGoodsReturnRule } from '../goods-return-rules';
import {
  createReturnOrder,
  updateReturnOrderStatus,
  batchConfirmReturnOrders,
  cancelReturnOrder,
  fillErpReturnNo,
  warehouseExecute,
  marketingSaleComplete,
  autoCompleteMarketingSale,
  rollbackReturnOrder,
} from './return-order.mutation';

const mockRepo = repo as jest.Mocked<typeof repo>;

// ==================== 测试数据工厂 ====================

function createMockRow(overrides: Partial<any> = {}): any {
  return {
    id: 1,
    return_no: 'RT-001',
    goods_id: 'G001',
    goods_name: '商品A',
    quantity: 10,
    unit: '件',
    status: 'pending_confirm',
    days_to_expire: 30,
    days_to_expire_at_return: 45,
    created_at: new Date(),
    updated_at: new Date(),
    ...overrides,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
});

// ==================== createReturnOrder ====================

describe('createReturnOrder', () => {
  it('成功创建退货单并记录操作', async () => {
    const row = createMockRow();
    mockRepo.createOrder.mockResolvedValueOnce(row);
    mockRepo.recordCreateAction.mockResolvedValueOnce(undefined);

    const result = await createReturnOrder({
      returnNo: 'RT-001',
      goodsId: 'G001',
      goodsName: '商品A',
      quantity: 10,
    });

    expect(result).not.toBeNull();
    expect(result?.id).toBe(1);
    expect(mockRepo.recordCreateAction).toHaveBeenCalledWith(1);
    expect(mockRepo.invalidateOrderCache).toHaveBeenCalledWith(1);
  });

  it('ON CONFLICT 时返回 null', async () => {
    mockRepo.createOrder.mockResolvedValueOnce(null as any);

    const result = await createReturnOrder({
      returnNo: 'RT-001',
      goodsId: 'G001',
      goodsName: '商品A',
      quantity: 10,
    });

    expect(result).toBeNull();
    expect(mockRepo.recordCreateAction).not.toHaveBeenCalled();
  });
});

// ==================== updateReturnOrderStatus ====================

describe('updateReturnOrderStatus', () => {
  it('更新状态并记录操作日志', async () => {
    const row = createMockRow({ status: 'pending_erp_fill' });
    mockRepo.getOrderStatus.mockResolvedValueOnce('pending_confirm');
    mockRepo.updateStatus.mockResolvedValueOnce(row);

    const result = await updateReturnOrderStatus({
      id: 1,
      status: 'pending_erp_fill',
      operatorId: 5,
      operatorName: '张三',
    });

    expect(result).not.toBeNull();
    expect(mockRepo.recordAction).toHaveBeenCalledWith(
      1, 'confirm_rule', 5, '张三', undefined,
      { previousStatus: 'pending_confirm', newStatus: 'pending_erp_fill' }
    );
    expect(mockRepo.invalidateOrderCache).toHaveBeenCalledWith(1);
  });

  it('退货单不存在时返回 null', async () => {
    mockRepo.getOrderStatus.mockResolvedValueOnce(null);

    const result = await updateReturnOrderStatus({
      id: 999,
      status: 'completed',
      operatorId: 5,
      operatorName: '张三',
    });

    expect(result).toBeNull();
    expect(mockRepo.updateStatus).not.toHaveBeenCalled();
  });
});

// ==================== batchConfirmReturnOrders ====================

describe('batchConfirmReturnOrders', () => {
  it('空 orderIds 直接返回', async () => {
    const result = await batchConfirmReturnOrders({
      orderIds: [],
      ruleDecision: 'can_return',
      operatorId: 5,
      operatorName: '张三',
    });

    expect(result.successCount).toBe(0);
    expect(result.failedCount).toBe(0);
  });

  it('can_return 决策 → pending_erp_fill 状态', async () => {
    const rows = [
      { id: 1, goods_id: 'G001', goods_name: '商品A' },
    ];
    mockRepo.batchConfirm.mockResolvedValueOnce(rows);
    mockRepo.getRawOrderById.mockResolvedValueOnce(createMockRow());

    const result = await batchConfirmReturnOrders({
      orderIds: [1],
      ruleDecision: 'can_return',
      operatorId: 5,
      operatorName: '张三',
    });

    expect(result.successCount).toBe(1);
    expect(mockRepo.batchConfirm).toHaveBeenCalledWith('pending_erp_fill', 5, [1]);
    expect(createGoodsReturnRule).toHaveBeenCalledWith(expect.objectContaining({
      canReturnToSupplier: true,
    }));
    // 等待异步通知
    await new Promise(r => setTimeout(r, 10));
    expect(notifyPendingErpFill).toHaveBeenCalled();
  });

  it('cannot_return 决策 → pending_marketing_sale 状态', async () => {
    const rows = [{ id: 2, goods_id: 'G002', goods_name: '商品B' }];
    mockRepo.batchConfirm.mockResolvedValueOnce(rows);
    mockRepo.getRawOrderById.mockResolvedValueOnce(createMockRow({ id: 2 }));

    await batchConfirmReturnOrders({
      orderIds: [2],
      ruleDecision: 'cannot_return',
      operatorId: 5,
      operatorName: '张三',
    });

    expect(mockRepo.batchConfirm).toHaveBeenCalledWith('pending_marketing_sale', 5, [2]);
    expect(createGoodsReturnRule).toHaveBeenCalledWith(expect.objectContaining({
      canReturnToSupplier: false,
    }));
    await new Promise(r => setTimeout(r, 10));
    expect(notifyPendingMarketingSale).toHaveBeenCalled();
  });

  it('daysToExpireAtReturn < 15 触发考核计算', async () => {
    const rows = [{ id: 3, goods_id: 'G003', goods_name: '商品C' }];
    mockRepo.batchConfirm.mockResolvedValueOnce(rows);
    mockRepo.getRawOrderById.mockResolvedValueOnce(
      createMockRow({ id: 3, days_to_expire_at_return: 10 })
    );

    await batchConfirmReturnOrders({
      orderIds: [3],
      ruleDecision: 'can_return',
      operatorId: 5,
      operatorName: '张三',
    });

    // 等待异步考核计算
    await new Promise(r => setTimeout(r, 10));
    expect(runCalculation).toHaveBeenCalledWith(expect.objectContaining({
      category: 'return_order',
      rule_type: 'return_expire_insufficient',
      source_id: 3,
    }));
  });

  it('daysToExpireAtReturn >= 15 不触发考核', async () => {
    const rows = [{ id: 4, goods_id: 'G004', goods_name: '商品D' }];
    mockRepo.batchConfirm.mockResolvedValueOnce(rows);
    mockRepo.getRawOrderById.mockResolvedValueOnce(
      createMockRow({ id: 4, days_to_expire_at_return: 20 })
    );

    await batchConfirmReturnOrders({
      orderIds: [4],
      ruleDecision: 'can_return',
      operatorId: 5,
      operatorName: '张三',
    });

    await new Promise(r => setTimeout(r, 10));
    expect(runCalculation).not.toHaveBeenCalled();
  });
});

// ==================== cancelReturnOrder ====================

describe('cancelReturnOrder', () => {
  it('pending_confirm 状态可取消', async () => {
    const row = createMockRow({ status: 'cancelled' });
    mockRepo.getOrderStatus.mockResolvedValueOnce('pending_confirm');
    mockRepo.updateStatus.mockResolvedValueOnce(row);

    const result = await cancelReturnOrder(1, 5, '张三', '不需要了');
    expect(result).not.toBeNull();
    expect(mockRepo.updateStatus).toHaveBeenCalledWith(1, 'cancelled');
    expect(mockRepo.recordAction).toHaveBeenCalled();
  });

  it('pending_erp_fill 状态可取消', async () => {
    mockRepo.getOrderStatus.mockResolvedValueOnce('pending_erp_fill');
    mockRepo.updateStatus.mockResolvedValueOnce(createMockRow({ status: 'cancelled' }));

    const result = await cancelReturnOrder(1, 5, '张三');
    expect(result).not.toBeNull();
  });

  it('其他状态不可取消', async () => {
    mockRepo.getOrderStatus.mockResolvedValueOnce('pending_warehouse_execute');

    const result = await cancelReturnOrder(1, 5, '张三');
    expect(result).toBeNull();
    expect(mockRepo.updateStatus).not.toHaveBeenCalled();
  });

  it('退货单不存在返回 null', async () => {
    mockRepo.getOrderStatus.mockResolvedValueOnce(null);

    const result = await cancelReturnOrder(999, 5, '张三');
    expect(result).toBeNull();
  });
});

// ==================== fillErpReturnNo ====================

describe('fillErpReturnNo', () => {
  it('成功填写 ERP 退货单号', async () => {
    const row = createMockRow({ status: 'pending_warehouse_execute' });
    mockRepo.getOrderStatus.mockResolvedValueOnce('pending_erp_fill');
    mockRepo.fillErpReturnNo.mockResolvedValueOnce(row);

    const result = await fillErpReturnNo({
      id: 1,
      erpReturnNo: 'ERP-001',
      operatorId: 5,
      operatorName: '张三',
    });

    expect(result).not.toBeNull();
    expect(mockRepo.recordAction).toHaveBeenCalledWith(
      1, 'erp_fill', 5, '张三', undefined,
      { erpReturnNo: 'ERP-001', previousStatus: 'pending_erp_fill', newStatus: 'pending_warehouse_execute' }
    );
    await new Promise(r => setTimeout(r, 10));
    expect(notifyPendingWarehouseExecute).toHaveBeenCalled();
  });

  it('退货单不存在抛出异常', async () => {
    mockRepo.getOrderStatus.mockResolvedValueOnce(null);

    await expect(fillErpReturnNo({
      id: 999, erpReturnNo: 'ERP-001', operatorId: 5, operatorName: '张三',
    })).rejects.toThrow('退货单不存在');
  });

  it('非 pending_erp_fill 状态抛出异常', async () => {
    mockRepo.getOrderStatus.mockResolvedValueOnce('pending_confirm');

    await expect(fillErpReturnNo({
      id: 1, erpReturnNo: 'ERP-001', operatorId: 5, operatorName: '张三',
    })).rejects.toThrow('无法填写ERP退货单号');
  });
});

// ==================== warehouseExecute ====================

describe('warehouseExecute', () => {
  it('成功执行仓储退货', async () => {
    const row = createMockRow({ status: 'completed' });
    mockRepo.getOrderStatus.mockResolvedValueOnce('pending_warehouse_execute');
    mockRepo.warehouseExecute.mockResolvedValueOnce(row);

    const result = await warehouseExecute({
      id: 1,
      evidenceUrls: ['url1', 'url2'],
      comment: '退货完成',
      operatorId: 5,
      operatorName: '王五',
    });

    expect(result).not.toBeNull();
    expect(mockRepo.warehouseExecute).toHaveBeenCalledWith(
      1, 5, '["url1","url2"]', '退货完成'
    );
  });

  it('退货单不存在抛出异常', async () => {
    mockRepo.getOrderStatus.mockResolvedValueOnce(null);

    await expect(warehouseExecute({
      id: 999, evidenceUrls: [], operatorId: 5, operatorName: '王五',
    })).rejects.toThrow('退货单不存在');
  });

  it('非 pending_warehouse_execute 状态抛出异常', async () => {
    mockRepo.getOrderStatus.mockResolvedValueOnce('pending_confirm');

    await expect(warehouseExecute({
      id: 1, evidenceUrls: [], operatorId: 5, operatorName: '王五',
    })).rejects.toThrow('无法执行仓储退货');
  });
});

// ==================== marketingSaleComplete ====================

describe('marketingSaleComplete', () => {
  it('成功完成营销销售', async () => {
    const row = createMockRow({ status: 'completed' });
    mockRepo.getOrderStatus.mockResolvedValueOnce('pending_marketing_sale');
    mockRepo.marketingSaleComplete.mockResolvedValueOnce(row);

    const result = await marketingSaleComplete({
      id: 1,
      comment: '销售完成',
      operatorId: 5,
      operatorName: '赵六',
    });

    expect(result).not.toBeNull();
    expect(mockRepo.recordAction).toHaveBeenCalledWith(
      1, 'marketing_complete', 5, '赵六', '销售完成',
      expect.objectContaining({ newStatus: 'completed' })
    );
  });

  it('退货单不存在抛出异常', async () => {
    mockRepo.getOrderStatus.mockResolvedValueOnce(null);

    await expect(marketingSaleComplete({
      id: 999, operatorId: 5, operatorName: '赵六',
    })).rejects.toThrow('退货单不存在');
  });

  it('非 pending_marketing_sale 状态抛出异常', async () => {
    mockRepo.getOrderStatus.mockResolvedValueOnce('pending_confirm');

    await expect(marketingSaleComplete({
      id: 1, operatorId: 5, operatorName: '赵六',
    })).rejects.toThrow('无法执行营销销售完成');
  });
});

// ==================== autoCompleteMarketingSale ====================

describe('autoCompleteMarketingSale', () => {
  it('有完成时失效缓存', async () => {
    mockRepo.autoCompleteMarketingSale.mockResolvedValueOnce({
      checkedCount: 5,
      completedCount: 2,
    });

    const result = await autoCompleteMarketingSale();
    expect(result.completedCount).toBe(2);
    expect(mockRepo.invalidateOrderCache).toHaveBeenCalled();
  });

  it('无完成时不失效缓存', async () => {
    mockRepo.autoCompleteMarketingSale.mockResolvedValueOnce({
      checkedCount: 3,
      completedCount: 0,
    });

    const result = await autoCompleteMarketingSale();
    expect(result.completedCount).toBe(0);
    expect(mockRepo.invalidateOrderCache).not.toHaveBeenCalled();
  });
});

// ==================== rollbackReturnOrder ====================

describe('rollbackReturnOrder', () => {
  it('pending_erp_fill 可回退', async () => {
    const row = createMockRow({ status: 'pending_confirm' });
    mockRepo.getOrderStatus.mockResolvedValueOnce('pending_erp_fill');
    mockRepo.rollbackOrder.mockResolvedValueOnce(row);

    const result = await rollbackReturnOrder({
      id: 1, operatorId: 5, operatorName: '张三',
    });

    expect(result).not.toBeNull();
    expect(mockRepo.recordAction).toHaveBeenCalledWith(
      1, 'rollback', 5, '张三', undefined,
      { previousStatus: 'pending_erp_fill', newStatus: 'pending_confirm' }
    );
  });

  it('pending_marketing_sale 可回退', async () => {
    mockRepo.getOrderStatus.mockResolvedValueOnce('pending_marketing_sale');
    mockRepo.rollbackOrder.mockResolvedValueOnce(createMockRow({ status: 'pending_confirm' }));

    const result = await rollbackReturnOrder({
      id: 1, operatorId: 5, operatorName: '张三',
    });
    expect(result).not.toBeNull();
  });

  it('其他状态不可回退', async () => {
    mockRepo.getOrderStatus.mockResolvedValueOnce('completed');

    await expect(rollbackReturnOrder({
      id: 1, operatorId: 5, operatorName: '张三',
    })).rejects.toThrow('无法回退');
  });

  it('退货单不存在抛出异常', async () => {
    mockRepo.getOrderStatus.mockResolvedValueOnce(null);

    await expect(rollbackReturnOrder({
      id: 999, operatorId: 5, operatorName: '张三',
    })).rejects.toThrow('退货单不存在');
  });
});
