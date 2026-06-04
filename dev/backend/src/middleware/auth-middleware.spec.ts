/**
 * 认证中间件单元测试
 * 测试 authMiddleware 和 optionalAuthMiddleware 的完整分支路径
 */

jest.mock('../utils/logger', () => ({
  createLogger: () => ({ warn: jest.fn(), info: jest.fn(), error: jest.fn() }),
}));
jest.mock('../utils/jwt', () => ({
  verifyToken: jest.fn(),
  extractTokenFromHeader: jest.fn(),
}));
jest.mock('../db/appPool', () => ({ appQuery: jest.fn() }));
jest.mock('../services/auth.service', () => ({
  getUserRolesAndPermissions: jest.fn(),
}));
jest.mock('../services/permission-cache.service', () => ({
  getUserPermissionCache: jest.fn(),
  setUserPermissionCache: jest.fn(),
}));

import { authMiddleware, optionalAuthMiddleware } from './auth';
import { extractTokenFromHeader, verifyToken } from '../utils/jwt';
import { appQuery } from '../db/appPool';
import { getUserRolesAndPermissions } from '../services/auth.service';
import { getUserPermissionCache } from '../services/permission-cache.service';
import type { Request, Response, NextFunction } from 'express';

const mockExtractToken = extractTokenFromHeader as jest.MockedFunction<typeof extractTokenFromHeader>;
const mockVerifyToken = verifyToken as jest.MockedFunction<typeof verifyToken>;
const mockAppQuery = appQuery as jest.MockedFunction<typeof appQuery>;
const mockGetRoles = getUserRolesAndPermissions as jest.MockedFunction<typeof getUserRolesAndPermissions>;
const mockGetCache = getUserPermissionCache as jest.MockedFunction<typeof getUserPermissionCache>;

function createMockReq(overrides: Partial<Request> = {}): Request {
  return {
    headers: { authorization: 'Bearer valid-token' },
    ...overrides,
  } as Request;
}

function createMockRes(): Response & { status: jest.Mock; json: jest.Mock } {
  const res = {
    status: jest.fn().mockReturnThis(),
    json: jest.fn().mockReturnThis(),
  } as unknown as Response & { status: jest.Mock; json: jest.Mock };
  return res;
}

const mockNext: NextFunction = jest.fn();

beforeEach(() => {
  jest.clearAllMocks();
});

// ==================== authMiddleware ====================

describe('authMiddleware', () => {
  it('无 token → 401 "未提供认证令牌"', async () => {
    mockExtractToken.mockReturnValue(null);
    const req = createMockReq();
    const res = createMockRes();

    await authMiddleware(req, res, mockNext);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ message: expect.stringContaining('未提供') }));
    expect(mockNext).not.toHaveBeenCalled();
  });

  it('无效 token → 401 "无效的认证令牌"', async () => {
    mockExtractToken.mockReturnValue('bad-token');
    mockVerifyToken.mockReturnValue(null);
    const req = createMockReq();
    const res = createMockRes();

    await authMiddleware(req, res, mockNext);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ message: expect.stringContaining('无效') }));
    expect(mockNext).not.toHaveBeenCalled();
  });

  it('用户被禁用 → 401 "用户已被禁用"', async () => {
    mockExtractToken.mockReturnValue('valid-token');
    mockVerifyToken.mockReturnValue({ userId: 1, username: 'test' } as any);
    mockAppQuery.mockResolvedValueOnce({ rows: [{ status: 0 }], rowCount: 1 } as any);
    const req = createMockReq();
    const res = createMockRes();

    await authMiddleware(req, res, mockNext);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ message: expect.stringContaining('禁用') }));
    expect(mockNext).not.toHaveBeenCalled();
  });

  it('用户不存在 → 401', async () => {
    mockExtractToken.mockReturnValue('valid-token');
    mockVerifyToken.mockReturnValue({ userId: 999, username: 'ghost' } as any);
    mockAppQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 } as any);
    const req = createMockReq();
    const res = createMockRes();

    await authMiddleware(req, res, mockNext);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(mockNext).not.toHaveBeenCalled();
  });

  it('正常放行 → req.user 包含权限信息', async () => {
    mockExtractToken.mockReturnValue('valid-token');
    mockVerifyToken.mockReturnValue({ userId: 1, username: 'test' } as any);
    mockAppQuery.mockResolvedValueOnce({ rows: [{ status: 1 }], rowCount: 1 } as any);
    mockGetCache.mockReturnValue({ roles: ['admin'], permissions: ['system:read'] });
    const req = createMockReq();
    const res = createMockRes();

    await authMiddleware(req, res, mockNext);

    expect(mockNext).toHaveBeenCalled();
    expect(req.user).toEqual(expect.objectContaining({
      userId: 1,
      roles: ['admin'],
      permissions: ['system:read'],
    }));
  });

  it('缓存未命中 → 查询数据库获取权限', async () => {
    mockExtractToken.mockReturnValue('valid-token');
    mockVerifyToken.mockReturnValue({ userId: 1, username: 'test' } as any);
    mockAppQuery.mockResolvedValueOnce({ rows: [{ status: 1 }], rowCount: 1 } as any);
    mockGetCache.mockReturnValue(null); // 缓存未命中
    mockGetRoles.mockResolvedValueOnce({
      roles: [{ code: 'manager' }],
      permissions: ['finance:ar:read'],
    } as any);
    const req = createMockReq();
    const res = createMockRes();

    await authMiddleware(req, res, mockNext);

    expect(mockGetRoles).toHaveBeenCalledWith(1);
    expect(mockNext).toHaveBeenCalled();
    expect(req.user!.roles).toEqual(['manager']);
  });

  it('数据库查询失败 → 500', async () => {
    mockExtractToken.mockReturnValue('valid-token');
    mockVerifyToken.mockReturnValue({ userId: 1, username: 'test' } as any);
    mockAppQuery.mockRejectedValueOnce(new Error('DB connection failed'));
    const req = createMockReq();
    const res = createMockRes();

    await authMiddleware(req, res, mockNext);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(mockNext).not.toHaveBeenCalled();
  });
});

// ==================== optionalAuthMiddleware ====================

describe('optionalAuthMiddleware', () => {
  it('无 token → 直接放行', async () => {
    mockExtractToken.mockReturnValue(null);
    const req = createMockReq();
    const res = createMockRes();

    await optionalAuthMiddleware(req, res, mockNext);

    expect(mockNext).toHaveBeenCalled();
    expect(req.user).toBeUndefined();
  });

  it('有有效 token → 挂载 user 并放行', async () => {
    mockExtractToken.mockReturnValue('valid-token');
    mockVerifyToken.mockReturnValue({ userId: 1, username: 'test' } as any);
    const req = createMockReq();
    const res = createMockRes();

    await optionalAuthMiddleware(req, res, mockNext);

    expect(mockNext).toHaveBeenCalled();
    expect(req.user).toEqual(expect.objectContaining({ userId: 1 }));
  });

  it('有无效 token → 不挂载 user 但仍放行', async () => {
    mockExtractToken.mockReturnValue('invalid-token');
    mockVerifyToken.mockReturnValue(null);
    const req = createMockReq();
    const res = createMockRes();

    await optionalAuthMiddleware(req, res, mockNext);

    expect(mockNext).toHaveBeenCalled();
    expect(req.user).toBeUndefined();
  });
});
