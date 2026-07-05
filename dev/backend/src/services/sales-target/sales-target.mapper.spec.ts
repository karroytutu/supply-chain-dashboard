/**
 * 目标管理 DTO Mapper 单元测试
 * @module services/sales-target/sales-target.mapper.spec.ts
 */

import { fromSaveItemDTO, validateSaveItems } from './sales-target.mapper';

describe('fromSaveItemDTO', () => {
  it('camelCase 输入转为 snake_case', () => {
    const result = fromSaveItemDTO({
      erpConsumerId: 123,
      consumerName: '客户A',
      isPlannedNew: true,
      erpGoodsId: 456,
      goodsName: '商品B',
      categoryName: '品类1',
      unit: '箱',
      unitPrice: 10,
      targetAmount: 1000,
      remark: '备注',
    });

    expect(result).toEqual({
      erp_consumer_id: 123,
      consumer_name: '客户A',
      is_planned_new: true,
      erp_goods_id: 456,
      goods_name: '商品B',
      category_name: '品类1',
      unit: '箱',
      unit_price: 10,
      target_amount: 1000,
      remark: '备注',
    });
  });

  it('snake_case 输入直接透传', () => {
    const result = fromSaveItemDTO({
      erp_consumer_id: 789,
      consumer_name: '客户B',
      is_planned_new: false,
      erp_goods_id: null,
      goods_name: '__category_remark__',
      category_name: '品类2',
      unit: null,
      unit_price: null,
      target_amount: 0,
      remark: '品类说明',
    });

    expect(result.erp_consumer_id).toBe(789);
    expect(result.erp_goods_id).toBeNull();
    expect(result.is_planned_new).toBe(false);
  });

  it('缺失字段使用默认值', () => {
    const result = fromSaveItemDTO({});

    expect(result.erp_consumer_id).toBeNull();
    expect(result.consumer_name).toBe('');
    expect(result.is_planned_new).toBe(false);
    expect(result.erp_goods_id).toBeNull();
    expect(result.goods_name).toBe('');
    expect(result.category_name).toBeNull();
    expect(result.unit).toBeNull();
    expect(result.unit_price).toBeNull();
    expect(result.target_amount).toBe(0);
    expect(result.remark).toBe('');
  });
});

describe('validateSaveItems', () => {
  it('有效数组返回 null', () => {
    expect(validateSaveItems([{ targetAmount: 100, erpConsumerId: 1, goodsName: 'Product', consumerName: 'Customer' }])).toBeNull();
  });

  it('非数组返回错误信息', () => {
    expect(validateSaveItems('invalid')).toBe('items 必须是数组');
    expect(validateSaveItems(null)).toBe('items 必须是数组');
  });

  it('空数组返回错误信息', () => {
    expect(validateSaveItems([])).toBe('items 不能为空');
  });

  it('target_amount 非数字返回错误', () => {
    expect(validateSaveItems([{ targetAmount: 'abc', goodsName: 'P', consumerName: 'C' }])).toContain('target_amount');
  });

  it('erp_consumer_id 非法类型返回错误', () => {
    expect(validateSaveItems([{ erpConsumerId: 'invalid', goodsName: 'P', consumerName: 'C' }])).toContain('erp_consumer_id');
  });

  it('erp_consumer_id 为 null 合法', () => {
    expect(validateSaveItems([{ erpConsumerId: null, targetAmount: 0, goodsName: 'P', consumerName: 'C' }])).toBeNull();
  });
});
