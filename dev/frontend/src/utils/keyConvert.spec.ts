/**
 * 键名转换工具单元测试
 * 测试 toSnakeCase、toSnakeKeys、toCamelKeys 纯函数
 */

import { describe, it, expect } from 'vitest';
import { toSnakeCase, toSnakeKeys, toCamelKeys } from './keyConvert';

describe('toSnakeCase', () => {
  it('基本 camelCase 转换', () => {
    expect(toSnakeCase('helloWorld')).toBe('hello_world');
  });

  it('多个大写字母', () => {
    expect(toSnakeCase('myLongVariableName')).toBe('my_long_variable_name');
  });

  it('已是 snake_case 不变', () => {
    expect(toSnakeCase('hello_world')).toBe('hello_world');
  });

  it('单词不变', () => {
    expect(toSnakeCase('hello')).toBe('hello');
  });

  it('空字符串', () => {
    expect(toSnakeCase('')).toBe('');
  });

  it('首字母大写', () => {
    expect(toSnakeCase('HelloWorld')).toBe('_hello_world');
  });
});

describe('toSnakeKeys', () => {
  it('扁平对象', () => {
    expect(toSnakeKeys({ userName: 'test', isActive: true })).toEqual({
      user_name: 'test',
      is_active: true,
    });
  });

  it('嵌套对象', () => {
    expect(toSnakeKeys({ userData: { firstName: 'A', lastName: 'B' } })).toEqual({
      user_data: { first_name: 'A', last_name: 'B' },
    });
  });

  it('数组中的对象', () => {
    expect(toSnakeKeys([{ userId: 1 }, { userId: 2 }])).toEqual([
      { user_id: 1 },
      { user_id: 2 },
    ]);
  });

  it('null 返回 null', () => {
    expect(toSnakeKeys(null)).toBeNull();
  });

  it('undefined 返回 undefined', () => {
    expect(toSnakeKeys(undefined)).toBeUndefined();
  });

  it('Date 对象不变', () => {
    const date = new Date('2024-01-01');
    expect(toSnakeKeys(date)).toBe(date);
  });

  it('原始值不变', () => {
    expect(toSnakeKeys(42)).toBe(42);
    expect(toSnakeKeys('hello')).toBe('hello');
    expect(toSnakeKeys(true)).toBe(true);
  });
});

describe('toCamelKeys', () => {
  it('扁平对象', () => {
    expect(toCamelKeys({ user_name: 'test', is_active: true })).toEqual({
      userName: 'test',
      isActive: true,
    });
  });

  it('嵌套对象', () => {
    expect(toCamelKeys({ user_data: { first_name: 'A' } })).toEqual({
      userData: { firstName: 'A' },
    });
  });

  it('数组中的对象', () => {
    expect(toCamelKeys([{ user_id: 1 }, { user_id: 2 }])).toEqual([
      { userId: 1 },
      { userId: 2 },
    ]);
  });

  it('null 返回 null', () => {
    expect(toCamelKeys(null)).toBeNull();
  });

  it('Date 对象不变', () => {
    const date = new Date('2024-01-01');
    expect(toCamelKeys(date)).toBe(date);
  });

  it('往返转换还原', () => {
    const original = { userName: 'test', isActive: true, nested: { firstName: 'A' } };
    expect(toCamelKeys(toSnakeKeys(original))).toEqual(original);
  });
});
