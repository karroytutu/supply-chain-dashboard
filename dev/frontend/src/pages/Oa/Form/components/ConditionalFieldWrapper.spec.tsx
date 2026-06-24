/**
 * ConditionalFieldWrapper 单元测试
 * 覆盖 checkCondition 和 checkSingleCondition 的所有条件类型
 */
import { describe, it, expect } from 'vitest';
import { checkCondition, checkSingleCondition } from './ConditionalFieldWrapper';

// ==================== checkSingleCondition ====================

describe('checkSingleCondition', () => {
  it('== 运算符：值相等返回 true', () => {
    expect(checkSingleCondition({ field: 'status', operator: '==', value: 'active' }, { status: 'active' })).toBe(true);
  });

  it('== 运算符：值不等返回 false', () => {
    expect(checkSingleCondition({ field: 'status', operator: '==', value: 'active' }, { status: 'inactive' })).toBe(false);
  });

  it('== 运算符：数字和字符串自动转换', () => {
    expect(checkSingleCondition({ field: 'count', operator: '==', value: 5 }, { count: '5' })).toBe(true);
  });

  it('>= 运算符', () => {
    expect(checkSingleCondition({ field: 'amount', operator: '>=', value: 100 }, { amount: 100 })).toBe(true);
    expect(checkSingleCondition({ field: 'amount', operator: '>=', value: 100 }, { amount: 50 })).toBe(false);
  });

  it('<= 运算符', () => {
    expect(checkSingleCondition({ field: 'qty', operator: '<=', value: 10 }, { qty: 10 })).toBe(true);
    expect(checkSingleCondition({ field: 'qty', operator: '<=', value: 10 }, { qty: 11 })).toBe(false);
  });

  it('> 运算符', () => {
    expect(checkSingleCondition({ field: 'score', operator: '>', value: 60 }, { score: 61 })).toBe(true);
    expect(checkSingleCondition({ field: 'score', operator: '>', value: 60 }, { score: 60 })).toBe(false);
  });

  it('< 运算符', () => {
    expect(checkSingleCondition({ field: 'days', operator: '<', value: 7 }, { days: 5 })).toBe(true);
    expect(checkSingleCondition({ field: 'days', operator: '<', value: 7 }, { days: 7 })).toBe(false);
  });

  it('not_empty 运算符：有值返回 true', () => {
    expect(checkSingleCondition({ field: 'name', operator: 'not_empty' }, { name: '张三' })).toBe(true);
    expect(checkSingleCondition({ field: 'ids', operator: 'not_empty' }, { ids: [1] })).toBe(true);
  });

  it('not_empty 运算符：空值返回 false', () => {
    expect(checkSingleCondition({ field: 'name', operator: 'not_empty' }, { name: '' })).toBe(false);
    expect(checkSingleCondition({ field: 'name', operator: 'not_empty' }, { name: null })).toBe(false);
    expect(checkSingleCondition({ field: 'ids', operator: 'not_empty' }, { ids: [] })).toBe(false);
  });

  it('is_empty 运算符：空值返回 true', () => {
    expect(checkSingleCondition({ field: 'name', operator: 'is_empty' }, { name: '' })).toBe(true);
    expect(checkSingleCondition({ field: 'name', operator: 'is_empty' }, {})).toBe(true);
  });

  it('is_empty 运算符：有值返回 false', () => {
    expect(checkSingleCondition({ field: 'name', operator: 'is_empty' }, { name: '张三' })).toBe(false);
  });

  it('未知运算符返回 false', () => {
    expect(checkSingleCondition({ field: 'x', operator: 'unknown' as any, value: 1 }, { x: 1 })).toBe(false);
  });
});

// ==================== checkCondition ====================

describe('checkCondition', () => {
  describe('单条件', () => {
    it('条件满足返回 true', () => {
      expect(checkCondition(
        { field: 'action', operator: '==', value: 'verify' },
        { action: 'verify' }
      )).toBe(true);
    });

    it('条件不满足返回 false', () => {
      expect(checkCondition(
        { field: 'action', operator: '==', value: 'verify' },
        { action: 'extension' }
      )).toBe(false);
    });
  });

  describe('AND 数组', () => {
    it('所有条件满足返回 true', () => {
      expect(checkCondition(
        [
          { field: 'customerId', operator: 'not_empty' },
          { field: 'result', operator: '==', value: 'partial' },
        ],
        { customerId: 'C001', result: 'partial' }
      )).toBe(true);
    });

    it('任一条件不满足返回 false', () => {
      expect(checkCondition(
        [
          { field: 'customerId', operator: 'not_empty' },
          { field: 'result', operator: '==', value: 'partial' },
        ],
        { customerId: '', result: 'partial' }
      )).toBe(false);
    });
  });

  describe('ConditionGroup OR（match=any）', () => {
    it('任一条件满足返回 true', () => {
      expect(checkCondition(
        {
          match: 'any',
          conditions: [
            { field: 'result', operator: '==', value: 'reconciled' },
            { field: 'result', operator: '==', value: 'partial_reconciled' },
          ],
        },
        { result: 'reconciled' }
      )).toBe(true);
    });

    it('第二个条件满足也返回 true', () => {
      expect(checkCondition(
        {
          match: 'any',
          conditions: [
            { field: 'result', operator: '==', value: 'reconciled' },
            { field: 'result', operator: '==', value: 'partial_reconciled' },
          ],
        },
        { result: 'partial_reconciled' }
      )).toBe(true);
    });

    it('所有条件不满足返回 false', () => {
      expect(checkCondition(
        {
          match: 'any',
          conditions: [
            { field: 'result', operator: '==', value: 'reconciled' },
            { field: 'result', operator: '==', value: 'partial_reconciled' },
          ],
        },
        { result: 'not_reconciled' }
      )).toBe(false);
    });
  });

  describe('ConditionGroup AND（match=all）', () => {
    it('所有条件满足返回 true', () => {
      expect(checkCondition(
        {
          match: 'all',
          conditions: [
            { field: 'customerId', operator: 'not_empty' },
            { field: 'status', operator: '==', value: 'active' },
          ],
        },
        { customerId: 'C001', status: 'active' }
      )).toBe(true);
    });

    it('任一条件不满足返回 false', () => {
      expect(checkCondition(
        {
          match: 'all',
          conditions: [
            { field: 'customerId', operator: 'not_empty' },
            { field: 'status', operator: '==', value: 'active' },
          ],
        },
        { customerId: 'C001', status: 'inactive' }
      )).toBe(false);
    });
  });
});
