/**
 * usePermission Hook 单元测试
 * 测试权限检查的 6 个方法：hasPermission/hasAnyPermission/hasAllPermissions + 角色对应方法
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';

// Mock umi 的 useModel
vi.mock('umi', () => ({
  useModel: vi.fn(),
}));

import { useModel } from 'umi';
import { usePermission } from './usePermission';

const mockUseModel = vi.mocked(useModel);

function setupUser(user: { permissions?: string[]; roles?: Array<{ code: string }> } | null) {
  mockUseModel.mockReturnValue({
    currentUser: user,
    fetchCurrentUser: vi.fn(),
  } as any);
}

beforeEach(() => {
  vi.clearAllMocks();
});

// ==================== 基本数据提取 ====================

describe('usePermission - 数据提取', () => {
  it('currentUser 为 null 时 permissions 和 roles 为空数组', () => {
    setupUser(null);
    const { result } = renderHook(() => usePermission());

    expect(result.current.permissions).toEqual([]);
    expect(result.current.roles).toEqual([]);
    expect(result.current.currentUser).toBeNull();
  });

  it('正确提取 permissions 列表', () => {
    setupUser({ permissions: ['system:read', 'finance:write'] });
    const { result } = renderHook(() => usePermission());

    expect(result.current.permissions).toEqual(['system:read', 'finance:write']);
  });

  it('正确提取 roles 的 code 列表', () => {
    setupUser({ roles: [{ code: 'admin' }, { code: 'manager' }] });
    const { result } = renderHook(() => usePermission());

    expect(result.current.roles).toEqual(['admin', 'manager']);
  });
});

// ==================== hasPermission ====================

describe('usePermission - hasPermission', () => {
  it('有权限 → true', () => {
    setupUser({ permissions: ['system:user:read', 'finance:ar:write'] });
    const { result } = renderHook(() => usePermission());

    expect(result.current.hasPermission('system:user:read')).toBe(true);
  });

  it('无权限 → false', () => {
    setupUser({ permissions: ['system:user:read'] });
    const { result } = renderHook(() => usePermission());

    expect(result.current.hasPermission('system:user:delete')).toBe(false);
  });

  it('空权限列表 → false', () => {
    setupUser({ permissions: [] });
    const { result } = renderHook(() => usePermission());

    expect(result.current.hasPermission('any:perm')).toBe(false);
  });
});

// ==================== hasAnyPermission ====================

describe('usePermission - hasAnyPermission', () => {
  it('任一匹配 → true', () => {
    setupUser({ permissions: ['finance:ar:read'] });
    const { result } = renderHook(() => usePermission());

    expect(result.current.hasAnyPermission(['finance:ar:read', 'finance:ar:write'])).toBe(true);
  });

  it('全不匹配 → false', () => {
    setupUser({ permissions: ['other:perm'] });
    const { result } = renderHook(() => usePermission());

    expect(result.current.hasAnyPermission(['finance:ar:read', 'finance:ar:write'])).toBe(false);
  });
});

// ==================== hasAllPermissions ====================

describe('usePermission - hasAllPermissions', () => {
  it('全部匹配 → true', () => {
    setupUser({ permissions: ['a:read', 'a:write', 'a:delete'] });
    const { result } = renderHook(() => usePermission());

    expect(result.current.hasAllPermissions(['a:read', 'a:write'])).toBe(true);
  });

  it('部分匹配 → false', () => {
    setupUser({ permissions: ['a:read'] });
    const { result } = renderHook(() => usePermission());

    expect(result.current.hasAllPermissions(['a:read', 'a:write'])).toBe(false);
  });
});

// ==================== hasRole ====================

describe('usePermission - hasRole', () => {
  it('有角色 → true', () => {
    setupUser({ roles: [{ code: 'admin' }] });
    const { result } = renderHook(() => usePermission());

    expect(result.current.hasRole('admin')).toBe(true);
  });

  it('无角色 → false', () => {
    setupUser({ roles: [{ code: 'viewer' }] });
    const { result } = renderHook(() => usePermission());

    expect(result.current.hasRole('admin')).toBe(false);
  });
});

// ==================== hasAnyRole ====================

describe('usePermission - hasAnyRole', () => {
  it('任一匹配 → true', () => {
    setupUser({ roles: [{ code: 'manager' }] });
    const { result } = renderHook(() => usePermission());

    expect(result.current.hasAnyRole(['admin', 'manager'])).toBe(true);
  });

  it('全不匹配 → false', () => {
    setupUser({ roles: [{ code: 'viewer' }] });
    const { result } = renderHook(() => usePermission());

    expect(result.current.hasAnyRole(['admin', 'manager'])).toBe(false);
  });
});

// ==================== hasAllRoles ====================

describe('usePermission - hasAllRoles', () => {
  it('全部匹配 → true', () => {
    setupUser({ roles: [{ code: 'admin' }, { code: 'manager' }] });
    const { result } = renderHook(() => usePermission());

    expect(result.current.hasAllRoles(['admin', 'manager'])).toBe(true);
  });

  it('部分匹配 → false', () => {
    setupUser({ roles: [{ code: 'admin' }] });
    const { result } = renderHook(() => usePermission());

    expect(result.current.hasAllRoles(['admin', 'manager'])).toBe(false);
  });
});
