/**
 * 错误处理工具函数单元测试
 */
import { describe, it, expect } from 'vitest';
import { getErrorMessage } from './errorUtils';

describe('getErrorMessage', () => {
  it('Error 对象提取 message', () => {
    expect(getErrorMessage(new Error('something failed'))).toBe('something failed');
  });

  it('字符串直接返回', () => {
    expect(getErrorMessage('直接错误')).toBe('直接错误');
  });

  it('含 message 属性的对象', () => {
    expect(getErrorMessage({ message: 'obj error' })).toBe('obj error');
  });

  it('null 返回 fallback', () => {
    expect(getErrorMessage(null)).toBe('操作失败');
  });

  it('undefined 返回 fallback', () => {
    expect(getErrorMessage(undefined)).toBe('操作失败');
  });

  it('数字返回 fallback', () => {
    expect(getErrorMessage(42)).toBe('操作失败');
  });

  it('自定义 fallback', () => {
    expect(getErrorMessage(null, '自定义错误')).toBe('自定义错误');
  });

  it('空对象返回 fallback', () => {
    expect(getErrorMessage({})).toBe('操作失败');
  });
});
