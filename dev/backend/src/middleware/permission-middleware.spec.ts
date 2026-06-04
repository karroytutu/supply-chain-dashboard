/**
 * 权限检查中间件单元测试
 * 测试 requirePermission、requireRole、requireAdmin
 * 无需 mock 外部服务：中间件逻辑仅基于 req.user 的内存数据
 */

import { requirePermission, requireRole, requireAdmin } from './permission';
import type { Request, Response, NextFunction } from 'express';

function createReq(user?: { roles?: string[]; permissions?: string[] }): Request {
  return { user } as Request;
}

function createRes(): Response & { status: jest.Mock; json: jest.Mock } {
  const res = {
    status: jest.fn().mockReturnThis(),
    json: jest.fn().mockReturnThis(),
  } as unknown as Response & { status: jest.Mock; json: jest.Mock };
  return res;
}

const next: NextFunction = jest.fn();

beforeEach(() => {
  jest.clearAllMocks();
});

// ==================== requirePermission ====================

describe('requirePermission', () => {
  it('单权限匹配 → 放行', () => {
    const req = createReq({ permissions: ['system:user:read', 'finance:ar:write'] });
    const middleware = requirePermission('system:user:read');
    middleware(req, createRes(), next);
    expect(next).toHaveBeenCalled();
  });

  it('单权限不匹配 → 403', () => {
    const res = createRes();
    const req = createReq({ permissions: ['system:user:read'] });
    const middleware = requirePermission('system:user:delete');
    middleware(req, res, next);
    expect(res.status).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();
  });

  it('多权限数组 — 任一匹配即放行', () => {
    const req = createReq({ permissions: ['finance:ar:read'] });
    const middleware = requirePermission(['finance:ar:read', 'finance:ar:write']);
    middleware(req, createRes(), next);
    expect(next).toHaveBeenCalled();
  });

  it('多权限数组 — 全不匹配 → 403', () => {
    const res = createRes();
    const req = createReq({ permissions: ['other:perm'] });
    const middleware = requirePermission(['finance:ar:read', 'finance:ar:write']);
    middleware(req, res, next);
    expect(res.status).toHaveBeenCalledWith(403);
  });

  it('用户未登录 → 401', () => {
    const res = createRes();
    const middleware = requirePermission('any:perm');
    middleware(createReq(undefined), res, next);
    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ message: '未登录' }));
  });

  it('permissions 为空数组 → 403', () => {
    const res = createRes();
    const req = createReq({ permissions: [] });
    const middleware = requirePermission('any:perm');
    middleware(req, res, next);
    expect(res.status).toHaveBeenCalledWith(403);
  });

  it('permissions 未定义 → 403', () => {
    const res = createRes();
    const req = createReq({ roles: ['admin'] });
    const middleware = requirePermission('any:perm');
    middleware(req, res, next);
    expect(res.status).toHaveBeenCalledWith(403);
  });
});

// ==================== requireRole ====================

describe('requireRole', () => {
  it('单角色匹配 → 放行', () => {
    const req = createReq({ roles: ['admin', 'manager'] });
    const middleware = requireRole('admin');
    middleware(req, createRes(), next);
    expect(next).toHaveBeenCalled();
  });

  it('单角色不匹配 → 403', () => {
    const res = createRes();
    const req = createReq({ roles: ['operator'] });
    const middleware = requireRole('admin');
    middleware(req, res, next);
    expect(res.status).toHaveBeenCalledWith(403);
  });

  it('多角色数组 — 任一匹配即放行', () => {
    const req = createReq({ roles: ['manager'] });
    const middleware = requireRole(['admin', 'manager']);
    middleware(req, createRes(), next);
    expect(next).toHaveBeenCalled();
  });

  it('多角色数组 — 全不匹配 → 403', () => {
    const res = createRes();
    const req = createReq({ roles: ['viewer'] });
    const middleware = requireRole(['admin', 'manager']);
    middleware(req, res, next);
    expect(res.status).toHaveBeenCalledWith(403);
  });

  it('用户未登录 → 401', () => {
    const res = createRes();
    const middleware = requireRole('admin');
    middleware(createReq(undefined), res, next);
    expect(res.status).toHaveBeenCalledWith(401);
  });

  it('roles 为空数组 → 403', () => {
    const res = createRes();
    const req = createReq({ roles: [] });
    const middleware = requireRole('admin');
    middleware(req, res, next);
    expect(res.status).toHaveBeenCalledWith(403);
  });
});

// ==================== requireAdmin ====================

describe('requireAdmin', () => {
  it('admin 角色 → 放行', () => {
    const req = createReq({ roles: ['admin'] });
    requireAdmin(req, createRes(), next);
    expect(next).toHaveBeenCalled();
  });

  it('非 admin 角色 → 403', () => {
    const res = createRes();
    const req = createReq({ roles: ['manager'] });
    requireAdmin(req, res, next);
    expect(res.status).toHaveBeenCalledWith(403);
  });

  it('未登录 → 401', () => {
    const res = createRes();
    requireAdmin(createReq(undefined), res, next);
    expect(res.status).toHaveBeenCalledWith(401);
  });
});
