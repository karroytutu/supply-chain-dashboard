/**
 * 商品退货规则 DTO 映射器单元测试
 */

import {
  toGoodsReturnRuleDTO,
  toGoodsReturnRuleStatsDTO,
  type GoodsReturnRuleRow,
} from './goods-return-rules.mapper';

function createRow(overrides: Partial<GoodsReturnRuleRow> = {}): GoodsReturnRuleRow {
  return {
    id: 1,
    goods_id: 'G001',
    goods_name: '测试商品',
    can_return_to_supplier: true,
    confirmed_by: 5,
    confirmed_at: new Date('2026-06-01'),
    comment: '可退货',
    is_active: true,
    created_at: new Date('2026-01-01'),
    updated_at: new Date('2026-06-01'),
    ...overrides,
  };
}

describe('toGoodsReturnRuleDTO', () => {
  it('snake_case → camelCase 转换', () => {
    const dto = toGoodsReturnRuleDTO(createRow());
    expect(dto.id).toBe(1);
    expect(dto.goodsId).toBe('G001');
    expect(dto.goodsName).toBe('测试商品');
    expect(dto.canReturnToSupplier).toBe(true);
    expect(dto.confirmedBy).toBe(5);
    expect(dto.isActive).toBe(true);
  });

  it('confirmedByName 有值时映射', () => {
    const dto = toGoodsReturnRuleDTO(createRow({ confirmed_by_name: '张三' }));
    expect(dto.confirmedByName).toBe('张三');
  });

  it('confirmedByName 空值时 undefined', () => {
    const dto = toGoodsReturnRuleDTO(createRow({ confirmed_by_name: null }));
    expect(dto.confirmedByName).toBeUndefined();
  });

  it('nullable 字段处理', () => {
    const dto = toGoodsReturnRuleDTO(createRow({
      confirmed_by: null, confirmed_at: null, comment: null,
    }));
    expect(dto.confirmedBy).toBeNull();
    expect(dto.confirmedAt).toBeNull();
    expect(dto.comment).toBeNull();
  });
});

describe('toGoodsReturnRuleStatsDTO', () => {
  it('字符串 parseInt 转换', () => {
    const stats = toGoodsReturnRuleStatsDTO({
      can_return: '5', cannot_return: '3', total: '8',
    });
    expect(stats.canReturn).toBe(5);
    expect(stats.cannotReturn).toBe(3);
    expect(stats.total).toBe(8);
  });

  it('无效值返回 0', () => {
    const stats = toGoodsReturnRuleStatsDTO({});
    expect(stats.canReturn).toBe(0);
    expect(stats.cannotReturn).toBe(0);
    expect(stats.total).toBe(0);
  });
});
