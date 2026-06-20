/**
 * Authorized 权限控制组件单元测试
 * 测试权限检查、角色检查、fallback 渲染、未登录状态
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import React from 'react';

// Mock usePermission hook
vi.mock('@/hooks/usePermission', () => ({
  usePermission: vi.fn(),
}));

import { Authorized } from './index';
import { usePermission } from '@/hooks/usePermission';

const mockUsePermission = vi.mocked(usePermission);

function setupPermission(opts: {
  currentUser?: unknown;
  permissions?: string[];
  roles?: string[];
}) {
  mockUsePermission.mockReturnValue({
    currentUser: opts.currentUser ?? { id: 1, name: 'Test' },
    permissions: opts.permissions ?? [],
    roles: opts.roles ?? [],
    hasPermission: (p: string) => (opts.permissions ?? []).includes(p),
    hasAnyPermission: (ps: string[]) => ps.some(p => (opts.permissions ?? []).includes(p)),
    hasAllPermissions: (ps: string[]) => ps.every(p => (opts.permissions ?? []).includes(p)),
    hasRole: (r: string) => (opts.roles ?? []).includes(r),
    hasAnyRole: (rs: string[]) => rs.some(r => (opts.roles ?? []).includes(r)),
    hasAllRoles: (rs: string[]) => rs.every(r => (opts.roles ?? []).includes(r)),
    refresh: vi.fn(),
  } as any);
}

beforeEach(() => {
  mockUsePermission.mockReset();
});

// ==================== 未登录 ====================

describe('Authorized - 未登录', () => {
  it('未登录时不渲染 children 且显示 403 Result', () => {
    setupPermission({ currentUser: null });
    const { container } = render(<Authorized permission="any:perm"><span>内容</span></Authorized>);

    expect(screen.queryByText('内容')).not.toBeInTheDocument();
    expect(container.querySelector('.ant-result')).toBeTruthy();
  });

  it('未登录时角色检查也不通过', () => {
    setupPermission({ currentUser: null });
    render(<Authorized role="admin"><span>管理内容</span></Authorized>);
    expect(screen.queryByText('管理内容')).not.toBeInTheDocument();
  });
});

// ==================== 权限检查 ====================

describe('Authorized - 权限检查', () => {
  it('有权限时渲染 children', () => {
    setupPermission({ permissions: ['system:user:read'] });
    render(<Authorized permission="system:user:read"><span>受保护内容</span></Authorized>);

    expect(screen.getByText('受保护内容')).toBeInTheDocument();
  });

  it('无权限且无 fallback 时显示 403 页面', () => {
    setupPermission({ permissions: [] });
    render(<Authorized permission="system:user:write"><span>内容</span></Authorized>);

    expect(screen.getByText('无访问权限')).toBeInTheDocument();
    expect(screen.queryByText('内容')).not.toBeInTheDocument();
  });

  it('无权限有 fallback 时渲染 fallback', () => {
    setupPermission({ permissions: [] });
    render(
      <Authorized permission="system:user:write" fallback={<span>无权限替代</span>}>
        <span>内容</span>
      </Authorized>
    );

    expect(screen.getByText('无权限替代')).toBeInTheDocument();
    expect(screen.queryByText('内容')).not.toBeInTheDocument();
  });

  it('mode="all" 需全部权限匹配', () => {
    setupPermission({ permissions: ['a:read'] });
    render(
      <Authorized permission={['a:read', 'a:write']} mode="all">
        <span>内容</span>
      </Authorized>
    );

    // 只有 a:read，缺少 a:write → 不显示
    expect(screen.queryByText('内容')).not.toBeInTheDocument();
  });

  it('mode="any"（默认）满足任一即可', () => {
    setupPermission({ permissions: ['a:read'] });
    render(
      <Authorized permission={['a:read', 'a:write']}>
        <span>内容</span>
      </Authorized>
    );

    expect(screen.getByText('内容')).toBeInTheDocument();
  });

  it('多权限数组传入', () => {
    setupPermission({ permissions: ['finance:ar:read'] });
    render(
      <Authorized permission={['finance:ar:read', 'finance:ar:write']}>
        <span>财务内容</span>
      </Authorized>
    );

    expect(screen.getByText('财务内容')).toBeInTheDocument();
  });
});

// ==================== 角色检查 ====================

describe('Authorized - 角色检查', () => {
  it('有角色时渲染 children', () => {
    setupPermission({ roles: ['admin'] });
    render(<Authorized role="admin"><span>管理员内容</span></Authorized>);

    expect(screen.getByText('管理员内容')).toBeInTheDocument();
  });

  it('无角色时隐藏 children', () => {
    setupPermission({ roles: ['viewer'] });
    render(<Authorized role="admin"><span>管理员内容</span></Authorized>);

    expect(screen.queryByText('管理员内容')).not.toBeInTheDocument();
  });

  it('多角色数组 — 任一匹配', () => {
    setupPermission({ roles: ['department_manager'] });
    render(<Authorized role={['admin', 'department_manager']}><span>管理内容</span></Authorized>);

    expect(screen.getByText('管理内容')).toBeInTheDocument();
  });
});

// ==================== 同时检查权限和角色 ====================

describe('Authorized - 权限+角色组合', () => {
  it('权限和角色都满足时渲染', () => {
    setupPermission({ permissions: ['system:read'], roles: ['admin'] });
    render(
      <Authorized permission="system:read" role="admin">
        <span>双重保护内容</span>
      </Authorized>
    );

    expect(screen.getByText('双重保护内容')).toBeInTheDocument();
  });

  it('权限满足但角色不满足时隐藏', () => {
    setupPermission({ permissions: ['system:read'], roles: ['viewer'] });
    render(
      <Authorized permission="system:read" role="admin">
        <span>内容</span>
      </Authorized>
    );

    expect(screen.queryByText('内容')).not.toBeInTheDocument();
  });
});

// ==================== 无权限/角色要求 ====================

describe('Authorized - 无限制', () => {
  it('不传 permission 和 role 时直接渲染 children', () => {
    setupPermission({});
    render(<Authorized><span>公开内容</span></Authorized>);

    expect(screen.getByText('公开内容')).toBeInTheDocument();
  });
});
