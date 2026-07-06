/**
 * filterNumberInput 单元测试
 * 覆盖 allowNegative=true 场景的边界用例
 */
import { filterNumberInput, AMOUNT_MAX_LENGTH } from './input-filter';

// =====================================================
// allowNegative=false（默认行为，向后兼容）
// =====================================================

describe('filterNumberInput (默认模式)', () => {
  it('保留数字', () => {
    expect(filterNumberInput('100')).toBe('100');
  });

  it('保留小数点', () => {
    expect(filterNumberInput('99.50')).toBe('99.50');
  });

  it('过滤非数字字符', () => {
    expect(filterNumberInput('1a2b3')).toBe('123');
  });

  it('过滤负号', () => {
    expect(filterNumberInput('-100')).toBe('100');
  });

  it('只保留第一个小数点', () => {
    expect(filterNumberInput('1.2.3')).toBe('1.23');
  });

  it('限制小数点后最多两位', () => {
    expect(filterNumberInput('1.234')).toBe('1.23');
  });

  it('限制总长度', () => {
    const long = '123456789012345'; // 15 位
    expect(filterNumberInput(long).length).toBeLessThanOrEqual(AMOUNT_MAX_LENGTH);
  });
});

// =====================================================
// allowNegative=true（负数支持）
// =====================================================

describe('filterNumberInput (allowNegative=true)', () => {
  it('保留前导负号', () => {
    expect(filterNumberInput('-100', true)).toBe('-100');
  });

  it('负数带小数', () => {
    expect(filterNumberInput('-99.50', true)).toBe('-99.50');
  });

  it('负号后紧跟小数点', () => {
    // -.5 → 过滤后为 .5，不补零（由 InputNumber 或业务层处理）
    const result = filterNumberInput('-.5', true);
    expect(result).toBe('-.5');
  });

  it('单独负号保留', () => {
    expect(filterNumberInput('-', true)).toBe('-');
  });

  it('负号不在首位被过滤', () => {
    expect(filterNumberInput('1-00', true)).toBe('100');
  });

  it('多个负号只保留首位', () => {
    expect(filterNumberInput('--100', true)).toBe('-100');
  });

  it('负数限制小数位', () => {
    expect(filterNumberInput('-1.234', true)).toBe('-1.23');
  });

  it('负数限制总长度', () => {
    const long = '-123456789012345'; // 负号 + 15 位
    const result = filterNumberInput(long, true);
    // 负号 + 数字部分 ≤ AMOUNT_MAX_LENGTH - 1
    expect(result.startsWith('-')).toBe(true);
    expect(result.length - 1).toBeLessThanOrEqual(AMOUNT_MAX_LENGTH - 1);
  });

  it('空字符串返回空', () => {
    expect(filterNumberInput('', true)).toBe('');
  });

  it('正数不受负号影响', () => {
    expect(filterNumberInput('100', true)).toBe('100');
  });
});
