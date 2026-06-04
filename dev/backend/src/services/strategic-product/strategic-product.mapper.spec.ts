/**
 * 战略商品 DTO 映射器单元测试
 * 测试纯函数，无需 mock 数据库
 */

jest.mock('../../utils/logger', () => ({
  createLogger: () => ({ warn: jest.fn(), info: jest.fn(), error: jest.fn() }),
}));

import {
  toStrategicProductDTO,
  toStrategicProductStatsDTO,
  toProductForSelectionDTO,
  fromAddStrategicProductsDTO,
  type StrategicProductRow,
  type StrategicProductStatsRow,
  type ProductForSelectionRow,
} from './strategic-product.mapper';

// ==================== 测试数据工厂 ====================

function createProductRow(overrides: Partial<StrategicProductRow> = {}): StrategicProductRow {
  return {
    id: 1,
    goods_id: 'G001',
    goods_name: '测试商品',
    category_path: '食品/饮料',
    status: 'pending',
    created_by: 1,
    created_at: new Date('2026-01-01'),
    updated_at: new Date('2026-01-01'),
    procurement_confirmed: false,
    procurement_confirmed_by: null,
    procurement_confirmed_at: null,
    marketing_confirmed: false,
    marketing_confirmed_by: null,
    marketing_confirmed_at: null,
    confirmed_at: null,
    ...overrides,
  };
}

// ==================== toStrategicProductDTO ====================

describe('toStrategicProductDTO', () => {
  it('基本字段 snake_case → camelCase 转换', () => {
    const row = createProductRow();
    const dto = toStrategicProductDTO(row);

    expect(dto.id).toBe(1);
    expect(dto.goodsId).toBe('G001');
    expect(dto.goodsName).toBe('测试商品');
    expect(dto.categoryPath).toBe('食品/饮料');
    expect(dto.status).toBe('pending');
    expect(dto.procurementConfirmed).toBe(false);
    expect(dto.marketingConfirmed).toBe(false);
  });

  it('关联字段 - 有值时映射', () => {
    const row = createProductRow({
      procurement_confirmer_name: '张三',
      marketing_confirmer_name: '李四',
    });
    const dto = toStrategicProductDTO(row);
    expect(dto.procurementConfirmerName).toBe('张三');
    expect(dto.marketingConfirmerName).toBe('李四');
  });

  it('关联字段 - 空值时返回 undefined', () => {
    const row = createProductRow({
      procurement_confirmer_name: undefined,
      marketing_confirmer_name: undefined,
    });
    const dto = toStrategicProductDTO(row);
    expect(dto.procurementConfirmerName).toBeUndefined();
    expect(dto.marketingConfirmerName).toBeUndefined();
  });

  it('空字符串关联字段返回 undefined', () => {
    const row = createProductRow({
      procurement_confirmer_name: '',
      marketing_confirmer_name: '',
    });
    const dto = toStrategicProductDTO(row);
    expect(dto.procurementConfirmerName).toBeUndefined();
    expect(dto.marketingConfirmerName).toBeUndefined();
  });
});

// ==================== toStrategicProductStatsDTO ====================

describe('toStrategicProductStatsDTO', () => {
  it('字符串数值 parseInt 转换', () => {
    const row: StrategicProductStatsRow = {
      pending: '5',
      confirmed: '10',
      rejected: '2',
      total: '17',
    };
    const dto = toStrategicProductStatsDTO(row);

    expect(dto.pending).toBe(5);
    expect(dto.confirmed).toBe(10);
    expect(dto.rejected).toBe(2);
    expect(dto.total).toBe(17);
  });

  it('undefined 字段返回 0', () => {
    const dto = toStrategicProductStatsDTO({});
    expect(dto.pending).toBe(0);
    expect(dto.confirmed).toBe(0);
    expect(dto.rejected).toBe(0);
    expect(dto.total).toBe(0);
  });

  it('null 值返回 0', () => {
    const row: StrategicProductStatsRow = { pending: null as any };
    const dto = toStrategicProductStatsDTO(row);
    expect(dto.pending).toBe(0);
  });
});

// ==================== toProductForSelectionDTO ====================

describe('toProductForSelectionDTO', () => {
  it('基本字段映射', () => {
    const row: ProductForSelectionRow = {
      goods_id: 'G001',
      goods_name: '商品A',
      category_path: '食品/饮料',
      stock: '100',
    };
    const dto = toProductForSelectionDTO(row, new Set());

    expect(dto.goodsId).toBe('G001');
    expect(dto.goodsName).toBe('商品A');
    expect(dto.categoryPath).toBe('食品/饮料');
    expect(dto.stock).toBe(100);
    expect(dto.isStrategic).toBe(false);
  });

  it('isStrategic 正确判断', () => {
    const row: ProductForSelectionRow = {
      goods_id: 'G001',
      goods_name: '商品A',
      category_path: null,
      stock: '0',
    };
    const strategicIds = new Set(['G001', 'G002']);
    const dto = toProductForSelectionDTO(row, strategicIds);
    expect(dto.isStrategic).toBe(true);
  });

  it('非战略商品 isStrategic = false', () => {
    const row: ProductForSelectionRow = {
      goods_id: 'G999',
      goods_name: '普通商品',
      category_path: null,
      stock: '0',
    };
    const dto = toProductForSelectionDTO(row, new Set(['G001']));
    expect(dto.isStrategic).toBe(false);
  });

  it('specification 生成 - 有换算关系', () => {
    const row: ProductForSelectionRow = {
      goods_id: 'G001',
      goods_name: '商品A',
      category_path: null,
      stock: '0',
      pkg_unit_name: '件',
      base_unit_name: '包',
      unit_factor: 10,
    };
    const dto = toProductForSelectionDTO(row, new Set());
    expect(dto.specification).toBe('1件=10包');
  });

  it('specification - 无换算关系时显示包装单位', () => {
    const row: ProductForSelectionRow = {
      goods_id: 'G001',
      goods_name: '商品A',
      category_path: null,
      stock: '0',
      pkg_unit_name: '件',
      base_unit_name: '件',
      unit_factor: 1,
    };
    const dto = toProductForSelectionDTO(row, new Set());
    expect(dto.specification).toBe('件');
  });

  it('specification - 无单位信息时为空', () => {
    const row: ProductForSelectionRow = {
      goods_id: 'G001',
      goods_name: '商品A',
      category_path: null,
      stock: '0',
    };
    const dto = toProductForSelectionDTO(row, new Set());
    expect(dto.specification).toBe('');
  });

  it('stock parseFloat 转换', () => {
    const row: ProductForSelectionRow = {
      goods_id: 'G001',
      goods_name: 'A',
      category_path: null,
      stock: '12.5',
    };
    const dto = toProductForSelectionDTO(row, new Set());
    expect(dto.stock).toBe(12.5);
  });

  it('stock 无效值返回 0', () => {
    const row: ProductForSelectionRow = {
      goods_id: 'G001',
      goods_name: 'A',
      category_path: null,
      stock: null as any,
    };
    const dto = toProductForSelectionDTO(row, new Set());
    expect(dto.stock).toBe(0);
  });

  it('categoryPath 为 null 时返回空字符串', () => {
    const row: ProductForSelectionRow = {
      goods_id: 'G001',
      goods_name: 'A',
      category_path: null,
      stock: '0',
    };
    const dto = toProductForSelectionDTO(row, new Set());
    expect(dto.categoryPath).toBe('');
  });
});

// ==================== fromAddStrategicProductsDTO ====================

describe('fromAddStrategicProductsDTO', () => {
  it('camelCase → snake_case 转换', () => {
    const result = fromAddStrategicProductsDTO({
      goodsIds: ['G001', 'G002'],
      userId: 5,
    }) as any;

    expect(result.goods_ids).toEqual(['G001', 'G002']);
    expect(result.user_id).toBe(5);
  });
});
