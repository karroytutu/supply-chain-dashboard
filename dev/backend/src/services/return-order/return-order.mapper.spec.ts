/**
 * 退货单 DTO 映射器单元测试
 * 测试纯函数，无需 mock 数据库
 */

jest.mock('../../utils/logger', () => ({
  createLogger: () => ({ warn: jest.fn(), info: jest.fn(), error: jest.fn() }),
}));

import {
  toReturnOrderDTO,
  toReturnActionDTO,
  toReturnOrderStatsDTO,
  fromCreateReturnOrderDTO,
  type ReturnActionRow,
  type ReturnOrderStatsRow,
} from './return-order.mapper';
import type { ReturnOrderRow } from './return-order-utils';

// ==================== 测试数据工厂 ====================

function createOrderRow(overrides: Partial<ReturnOrderRow> = {}): ReturnOrderRow {
  return {
    id: 1,
    return_no: 'RT-20260601-001',
    goods_id: 'G001',
    goods_name: '测试商品',
    quantity: 10,
    unit: '件',
    batch_date: new Date('2026-01-01'),
    return_date: new Date('2026-06-01'),
    expire_date: new Date('2026-12-01'),
    shelf_life: 365,
    days_to_expire: 180,
    days_to_expire_at_return: 200,
    status: 'pending_confirm',
    source_bill_no: 'SO-001',
    consumer_name: '测试客户',
    marketing_manager: '张三',
    erp_return_no: null,
    erp_filled_by: null,
    erp_filled_at: null,
    warehouse_executed_by: null,
    warehouse_executed_at: null,
    warehouse_return_quantity: null,
    warehouse_evidence_url: null,
    warehouse_comment: null,
    marketing_completed_by: null,
    marketing_completed_at: null,
    marketing_comment: null,
    rule_id: null,
    purchase_price: 25.5,
    rule_confirmed_at: null,
    rule_confirmed_by: null,
    created_at: new Date('2026-06-01'),
    updated_at: new Date('2026-06-01'),
    ...overrides,
  };
}

// ==================== toReturnOrderDTO ====================

describe('toReturnOrderDTO', () => {
  it('基本字段 snake_case → camelCase 转换', () => {
    const row = createOrderRow();
    const dto = toReturnOrderDTO(row);

    expect(dto.id).toBe(1);
    expect(dto.returnNo).toBe('RT-20260601-001');
    expect(dto.goodsId).toBe('G001');
    expect(dto.goodsName).toBe('测试商品');
    expect(dto.consumerName).toBe('测试客户');
    expect(dto.sourceBillNo).toBe('SO-001');
  });

  it('quantity 字段 parseFloat 转换', () => {
    const row = createOrderRow({ quantity: '10.5' as any });
    const dto = toReturnOrderDTO(row);
    expect(dto.quantity).toBe(10.5);
  });

  it('quantity 无效值时返回 0', () => {
    const row = createOrderRow({ quantity: null as any });
    const dto = toReturnOrderDTO(row);
    expect(dto.quantity).toBe(0);
  });

  it('daysToExpire 优先取 calculated_days_to_expire', () => {
    const row = createOrderRow({
      calculated_days_to_expire: 42,
      days_to_expire: 180,
    });
    const dto = toReturnOrderDTO(row);
    expect(dto.daysToExpire).toBe(42);
  });

  it('daysToExpire 回退到 days_to_expire', () => {
    const row = createOrderRow({
      calculated_days_to_expire: null,
      days_to_expire: 180,
    });
    const dto = toReturnOrderDTO(row);
    expect(dto.daysToExpire).toBe(180);
  });

  it('warehouseReturnQuantity parseFloat 转换', () => {
    const row = createOrderRow({ warehouse_return_quantity: '5.5' as any });
    const dto = toReturnOrderDTO(row);
    expect(dto.warehouseReturnQuantity).toBe(5.5);
  });

  it('warehouseReturnQuantity 为 null 时保持 null', () => {
    const row = createOrderRow({ warehouse_return_quantity: null });
    const dto = toReturnOrderDTO(row);
    expect(dto.warehouseReturnQuantity).toBeNull();
  });

  it('purchasePrice parseFloat 转换', () => {
    const row = createOrderRow({ purchase_price: '25.50' as any });
    const dto = toReturnOrderDTO(row);
    expect(dto.purchasePrice).toBe(25.5);
  });

  it('purchasePrice 为 null 时保持 null', () => {
    const row = createOrderRow({ purchase_price: null });
    const dto = toReturnOrderDTO(row);
    expect(dto.purchasePrice).toBeNull();
  });

  it('关联字段映射 - 有值', () => {
    const row = createOrderRow({
      erp_filler_name: '李四',
      warehouse_executor_name: '王五',
      marketing_completer_name: '赵六',
    });
    const dto = toReturnOrderDTO(row);
    expect(dto.erpFillerName).toBe('李四');
    expect(dto.warehouseExecutorName).toBe('王五');
    expect(dto.marketingCompleterName).toBe('赵六');
  });

  it('关联字段映射 - null/空时返回 undefined', () => {
    const row = createOrderRow({
      erp_filler_name: null,
      warehouse_executor_name: null,
      marketing_completer_name: null,
    });
    const dto = toReturnOrderDTO(row);
    expect(dto.erpFillerName).toBeUndefined();
    expect(dto.warehouseExecutorName).toBeUndefined();
    expect(dto.marketingCompleterName).toBeUndefined();
  });

  it('库存信息映射', () => {
    const row = createOrderRow({
      current_stock: 15,
      current_stock_display: '1件5包',
      current_stock_unit: '件包',
    });
    const dto = toReturnOrderDTO(row);
    expect(dto.currentStock).toBe(15);
    expect(dto.currentStockDisplay).toBe('1件5包');
    expect(dto.currentStockUnit).toBe('件包');
  });

  it('库存信息为 null 时处理', () => {
    const row = createOrderRow({
      current_stock: null,
      current_stock_display: null,
      current_stock_unit: null,
    });
    const dto = toReturnOrderDTO(row);
    expect(dto.currentStock).toBeNull();
    expect(dto.currentStockDisplay).toBeUndefined();
    expect(dto.currentStockUnit).toBeUndefined();
  });
});

// ==================== toReturnActionDTO ====================

describe('toReturnActionDTO', () => {
  it('snake_case → camelCase 转换', () => {
    const row: ReturnActionRow = {
      id: 10,
      order_id: 1,
      action_type: 'confirm_rule',
      operator_id: 5,
      operator_name: '张三',
      action_at: new Date('2026-06-01'),
      comment: '确认退货',
      details: { previousStatus: 'pending_confirm' },
    };
    const dto = toReturnActionDTO(row);

    expect(dto.id).toBe(10);
    expect(dto.orderId).toBe(1);
    expect(dto.actionType).toBe('confirm_rule');
    expect(dto.operatorId).toBe(5);
    expect(dto.operatorName).toBe('张三');
    expect(dto.comment).toBe('确认退货');
    expect(dto.details).toEqual({ previousStatus: 'pending_confirm' });
  });

  it('nullable 字段处理', () => {
    const row: ReturnActionRow = {
      id: 11,
      order_id: 2,
      action_type: 'create',
      operator_id: null,
      operator_name: null,
      action_at: new Date('2026-06-01'),
      comment: null,
      details: null,
    };
    const dto = toReturnActionDTO(row);
    expect(dto.operatorId).toBeNull();
    expect(dto.operatorName).toBeNull();
    expect(dto.comment).toBeNull();
    expect(dto.details).toBeNull();
  });
});

// ==================== toReturnOrderStatsDTO ====================

describe('toReturnOrderStatsDTO', () => {
  it('字符串数值 parseInt 转换', () => {
    const row: ReturnOrderStatsRow = {
      pending_confirm: '3',
      pending_erp_fill: '5',
      pending_warehouse_execute: '2',
      pending_marketing_sale: '1',
      completed: '10',
      total: '21',
    };
    const dto = toReturnOrderStatsDTO(row);

    expect(dto.pendingConfirm).toBe(3);
    expect(dto.pendingErpFill).toBe(5);
    expect(dto.pendingWarehouseExecute).toBe(2);
    expect(dto.pendingMarketingSale).toBe(1);
    expect(dto.completed).toBe(10);
    expect(dto.total).toBe(21);
  });

  it('undefined 字段返回 0', () => {
    const dto = toReturnOrderStatsDTO({});
    expect(dto.pendingConfirm).toBe(0);
    expect(dto.pendingErpFill).toBe(0);
    expect(dto.pendingWarehouseExecute).toBe(0);
    expect(dto.pendingMarketingSale).toBe(0);
    expect(dto.completed).toBe(0);
    expect(dto.total).toBe(0);
  });

  it('null 值返回 0', () => {
    const row: ReturnOrderStatsRow = {
      pending_confirm: null as any,
      total: null as any,
    };
    const dto = toReturnOrderStatsDTO(row);
    expect(dto.pendingConfirm).toBe(0);
    expect(dto.total).toBe(0);
  });

  it('非数字字符串返回 0', () => {
    const row: ReturnOrderStatsRow = {
      pending_confirm: 'abc' as any,
    };
    const dto = toReturnOrderStatsDTO(row);
    expect(dto.pendingConfirm).toBe(0);
  });
});

// ==================== fromCreateReturnOrderDTO ====================

describe('fromCreateReturnOrderDTO', () => {
  it('camelCase → snake_case 转换', () => {
    const result = fromCreateReturnOrderDTO({
      returnNo: 'RT-001',
      goodsId: 'G001',
      goodsName: '测试商品',
      quantity: 10,
      unit: '件',
    }) as any;

    expect(result.return_no).toBe('RT-001');
    expect(result.goods_id).toBe('G001');
    expect(result.goods_name).toBe('测试商品');
    expect(result.quantity).toBe(10);
    expect(result.unit).toBe('件');
  });

  it('可选字段正确转换', () => {
    const result = fromCreateReturnOrderDTO({
      returnNo: 'RT-002',
      goodsId: 'G002',
      goodsName: '商品B',
      quantity: 5,
      daysToExpire: 30,
      daysToExpireAtReturn: 45,
      purchasePrice: 12.5,
    }) as any;

    expect(result.days_to_expire).toBe(30);
    expect(result.days_to_expire_at_return).toBe(45);
    expect(result.purchase_price).toBe(12.5);
  });
});
