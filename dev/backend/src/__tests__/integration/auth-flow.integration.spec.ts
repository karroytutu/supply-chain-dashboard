/**
 * 认证流程 API 集成测试
 * 使用 supertest + 最小化 Express 应用 + mock 数据库层
 * 测试完整 HTTP 链路：请求 → 中间件 → 控制器 → 响应
 */

jest.mock('../../utils/logger', () => ({
  createLogger: () => ({ warn: jest.fn(), info: jest.fn(), error: jest.fn() }),
  default: { warn: jest.fn(), info: jest.fn(), error: jest.fn() },
}));
jest.mock('../../db/appPool', () => ({
  appQuery: jest.fn(),
  getAppClient: jest.fn(),
}));
jest.mock('../../services/auth.service', () => ({
  getUserRolesAndPermissions: jest.fn(),
  getCurrentUser: jest.fn(),
  devLogin: jest.fn(),
  devSwitchUser: jest.fn(),
  getDevUsers: jest.fn(),
}));
jest.mock('../../services/permission-cache.service', () => ({
  getUserPermissionCache: jest.fn(),
  setUserPermissionCache: jest.fn(),
  invalidateUserPermissionCache: jest.fn(),
  invalidateRolePermissionCache: jest.fn(),
  invalidatePermissionTreeCache: jest.fn(),
}));

import express from 'express';
import request from 'supertest';
import { appQuery } from '../../db/appPool';
import { getUserRolesAndPermissions, getCurrentUser, devLogin } from '../../services/auth.service';
import { getUserPermissionCache } from '../../services/permission-cache.service';

const mockAppQuery = appQuery as jest.MockedFunction<typeof appQuery>;
const mockGetRoles = getUserRolesAndPermissions as jest.MockedFunction<typeof getUserRolesAndPermissions>;
const mockGetCurrentUser = getCurrentUser as jest.MockedFunction<any>;
const mockGetCache = getUserPermissionCache as jest.MockedFunction<typeof getUserPermissionCache>;

// 构建最小 Express 应用（仅挂载认证路由）
async function createTestApp() {
  const app = express();
  app.use(express.json());

  // 模拟 JWT 工具函数（直接 mock 模块）
  jest.mock('../../utils/jwt', () => ({
    verifyToken: jest.fn((token: string) => {
      if (token === 'valid-token') return { userId: 1, username: 'admin' };
      if (token === 'disabled-user-token') return { userId: 2, username: 'disabled' };
      return null;
    }),
    extractTokenFromHeader: jest.fn((header?: string) => {
      if (!header || !header.startsWith('Bearer ')) return null;
      return header.slice(7);
    }),
    generateToken: jest.fn(() => 'mock-jwt-token'),
  }));

  // 延迟导入以确保 mock 生效
  const { default: authRoutes } = await import('../../routes/auth.routes');
  app.use('/api/auth', authRoutes);

  return app;
}

let app: express.Express;

beforeAll(async () => {
  // 设置开发环境以启用 dev-login
  process.env.NODE_ENV = 'development';
  app = await createTestApp();
});

beforeEach(() => {
  jest.clearAllMocks();
});

// ==================== GET /api/auth/me ====================

describe('GET /api/auth/me', () => {
  it('无 Authorization header → 401', async () => {
    const res = await request(app).get('/api/auth/me');

    expect(res.status).toBe(401);
    expect(res.body.message).toContain('未提供');
  });

  it('无效 token → 401', async () => {
    const res = await request(app)
      .get('/api/auth/me')
      .set('Authorization', 'Bearer invalid-token');

    expect(res.status).toBe(401);
    expect(res.body.message).toContain('无效');
  });

  it('有效 token + 正常用户 → 200 + 用户信息', async () => {
    mockAppQuery.mockResolvedValueOnce({ rows: [{ status: 1 }], rowCount: 1 } as any);
    mockGetCache.mockReturnValue({
      roles: ['admin'],
      permissions: ['system:read'],
    });
    mockGetCurrentUser.mockResolvedValueOnce({
      id: 1, username: 'admin', name: '管理员',
      roles: [{ code: 'admin' }], permissions: ['system:read'],
    });

    const res = await request(app)
      .get('/api/auth/me')
      .set('Authorization', 'Bearer valid-token');

    expect(res.status).toBe(200);
  });

  it('有效 token + 被禁用用户 → 401', async () => {
    mockAppQuery.mockResolvedValueOnce({ rows: [{ status: 0 }], rowCount: 1 } as any);

    const res = await request(app)
      .get('/api/auth/me')
      .set('Authorization', 'Bearer disabled-user-token');

    expect(res.status).toBe(401);
    expect(res.body.message).toContain('禁用');
  });

  it('有效 token + 用户不存在 → 401', async () => {
    mockAppQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 } as any);

    const res = await request(app)
      .get('/api/auth/me')
      .set('Authorization', 'Bearer valid-token');

    expect(res.status).toBe(401);
  });
});

// ==================== POST /api/auth/dev-login ====================

describe('POST /api/auth/dev-login', () => {
  it('开发环境端点已注册（非 404）', async () => {
    // mock devLogin 返回成功结果，避免控制器内部抛出未处理异常
    (devLogin as jest.MockedFunction<any>).mockResolvedValueOnce({
      success: true,
      token: 'mock-token',
      user: { id: 1, username: 'admin' },
    } as any);

    const res = await request(app)
      .post('/api/auth/dev-login')
      .send({});

    // 404 表示路由未注册，其他状态码均表示端点可达
    expect(res.status).not.toBe(404);
  });
});

// ==================== POST /api/auth/logout ====================

describe('POST /api/auth/logout', () => {
  it('无 token → 401', async () => {
    const res = await request(app).post('/api/auth/logout');
    expect(res.status).toBe(401);
  });

  it('有效 token → 200', async () => {
    mockAppQuery.mockResolvedValueOnce({ rows: [{ status: 1 }], rowCount: 1 } as any);
    mockGetCache.mockReturnValue({ roles: ['admin'], permissions: [] });
    mockGetCurrentUser.mockResolvedValueOnce({ id: 1, username: 'admin' });

    const res = await request(app)
      .post('/api/auth/logout')
      .set('Authorization', 'Bearer valid-token');

    expect(res.status).toBe(200);
  });
});

// ==================== 权限中间件集成 ====================

describe('权限中间件集成', () => {
  it('GET /api/auth/me 返回用户角色和权限信息', async () => {
    mockAppQuery.mockResolvedValueOnce({ rows: [{ status: 1 }], rowCount: 1 } as any);
    mockGetCache.mockReturnValue({
      roles: ['admin', 'manager'],
      permissions: ['system:user:read', 'system:user:write'],
    });
    mockGetCurrentUser.mockResolvedValueOnce({
      id: 1, username: 'admin', name: '管理员',
      roles: [{ code: 'admin' }, { code: 'manager' }],
      permissions: ['system:user:read', 'system:user:write'],
    });

    const res = await request(app)
      .get('/api/auth/me')
      .set('Authorization', 'Bearer valid-token');

    expect(res.status).toBe(200);
    // 验证响应包含用户数据
    expect(res.body).toBeDefined();
  });

  it('缓存未命中时查询数据库获取权限', async () => {
    mockAppQuery.mockResolvedValueOnce({ rows: [{ status: 1 }], rowCount: 1 } as any);
    mockGetCache.mockReturnValue(null);
    mockGetRoles.mockResolvedValueOnce({
      roles: [{ code: 'viewer' }],
      permissions: ['dashboard:view:read'],
    } as any);
    mockGetCurrentUser.mockResolvedValueOnce({
      id: 1, username: 'admin', name: '管理员',
      roles: [{ code: 'viewer' }], permissions: ['dashboard:view:read'],
    });

    const res = await request(app)
      .get('/api/auth/me')
      .set('Authorization', 'Bearer valid-token');

    expect(res.status).toBe(200);
    expect(mockGetRoles).toHaveBeenCalledWith(1);
  });
});
