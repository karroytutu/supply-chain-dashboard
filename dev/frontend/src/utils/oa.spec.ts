/**
 * OA 工具函数单元测试
 * 测试 getRoleDisplayName、humanizeCondition、isSafeUrl、getFieldLinkUrl
 */

import { describe, it, expect } from 'vitest';
import { getRoleDisplayName, humanizeCondition, isSafeUrl, getFieldLinkUrl } from './oa';
import type { ConditionDef, FormField } from '@/types/oa';

// ==================== getRoleDisplayName ====================

describe('getRoleDisplayName', () => {
  it('已知角色返回中文名', () => {
    expect(getRoleDisplayName('admin')).toBe('系统管理员');
    expect(getRoleDisplayName('general_manager')).toBe('总经理');
    expect(getRoleDisplayName('department_manager')).toBe('部门经理');
    expect(getRoleDisplayName('cashier')).toBe('结算会计');
    expect(getRoleDisplayName('procurement_manager')).toBe('采购主管');
  });

  it('未知角色返回原始 code', () => {
    expect(getRoleDisplayName('unknown_role')).toBe('unknown_role');
    expect(getRoleDisplayName('')).toBe('');
  });
});

// ==================== humanizeCondition ====================

describe('humanizeCondition', () => {
  const fieldLabels = { amount: '金额', days: '天数', count: '数量' };

  it('大于操作符', () => {
    const condition: ConditionDef = { field: 'amount', operator: '>', value: 50000 };
    expect(humanizeCondition(condition, fieldLabels)).toBe('金额超过50,000时');
  });

  it('大于等于', () => {
    const condition: ConditionDef = { field: 'days', operator: '>=', value: 30 };
    expect(humanizeCondition(condition, fieldLabels)).toBe('天数不低于30时');
  });

  it('小于', () => {
    const condition: ConditionDef = { field: 'count', operator: '<', value: 5 };
    expect(humanizeCondition(condition, fieldLabels)).toBe('数量低于5时');
  });

  it('等于', () => {
    const condition: ConditionDef = { field: 'amount', operator: '==', value: 100 };
    expect(humanizeCondition(condition, fieldLabels)).toBe('金额为100时');
  });

  it('未知字段回退为字段名', () => {
    const condition: ConditionDef = { field: 'unknownField', operator: '>', value: 10 };
    expect(humanizeCondition(condition, fieldLabels)).toBe('unknownField超过10时');
  });

  it('字符串值', () => {
    const condition: ConditionDef = { field: 'amount', operator: '==', value: 'high' };
    expect(humanizeCondition(condition, fieldLabels)).toBe('金额为high时');
  });
});

// ==================== isSafeUrl ====================

describe('isSafeUrl', () => {
  it('相对路径 → 安全', () => {
    expect(isSafeUrl('/path/to/page')).toBe(true);
    expect(isSafeUrl('/oa/detail/123')).toBe(true);
  });

  it('http URL → 安全', () => {
    expect(isSafeUrl('http://example.com')).toBe(true);
    expect(isSafeUrl('https://example.com/path?q=1')).toBe(true);
  });

  it('javascript: → 不安全', () => {
    expect(isSafeUrl('javascript:alert(1)')).toBe(false);
    expect(isSafeUrl('JavaScript:void(0)')).toBe(false);
  });

  it('data: → 不安全', () => {
    expect(isSafeUrl('data:text/html,<script>alert(1)</script>')).toBe(false);
  });

  it('空字符串 → 不安全', () => {
    expect(isSafeUrl('')).toBe(false);
  });

  it('//开头的协议相对URL → 不安全', () => {
    expect(isSafeUrl('//evil.com')).toBe(false);
  });
});

// ==================== getFieldLinkUrl ====================

describe('getFieldLinkUrl', () => {
  it('text 类型 + 有效 URL → 返回 URL', () => {
    const field: FormField = { key: 'contractNo', label: '合同号', type: 'text', required: false };
    const formData = { _contractNoUrl: '/oa/detail/123' };
    expect(getFieldLinkUrl(field, formData)).toBe('/oa/detail/123');
  });

  it('非 text 类型 → 返回 null', () => {
    const field: FormField = { key: 'amount', label: '金额', type: 'number', required: false };
    const formData = { _amountUrl: '/some/url' };
    expect(getFieldLinkUrl(field, formData)).toBeNull();
  });

  it('无 formData → 返回 null', () => {
    const field: FormField = { key: 'test', label: '测试', type: 'text', required: false };
    expect(getFieldLinkUrl(field)).toBeNull();
    expect(getFieldLinkUrl(field, undefined)).toBeNull();
  });

  it('URL 不安全 → 返回 null', () => {
    const field: FormField = { key: 'link', label: '链接', type: 'text', required: false };
    const formData = { _linkUrl: 'javascript:alert(1)' };
    expect(getFieldLinkUrl(field, formData)).toBeNull();
  });

  it('URL key 不存在 → 返回 null', () => {
    const field: FormField = { key: 'missing', label: '缺失', type: 'text', required: false };
    const formData = { otherField: 'value' };
    expect(getFieldLinkUrl(field, formData)).toBeNull();
  });

  it('URL 为非字符串 → 返回 null', () => {
    const field: FormField = { key: 'test', label: '测试', type: 'text', required: false };
    const formData = { _testUrl: 12345 };
    expect(getFieldLinkUrl(field, formData)).toBeNull();
  });
});
