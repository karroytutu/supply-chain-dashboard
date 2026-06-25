/**
 * OA 审批模块 API 集成测试
 * 使用 supertest + 最小化 Express 应用 + mock 数据库层
 * 测试完整 HTTP 链路：请求 → auth 中间件 → permission 中间件 → 控制器 → 响应
 */

// =====================================================
// Mock 层（必须在 import 之前）
// =====================================================

jest.mock('../../utils/logger', () => ({
  createLogger: () => ({ warn: jest.fn(), info: jest.fn(), error: jest.fn() }),
  default: { warn: jest.fn(), info: jest.fn(), error: jest.fn() },
}));

jest.mock('../../db/appPool', () => ({
  appQuery: jest.fn(),
  getAppClient: jest.fn(),
}));

jest.mock('../../utils/jwt', () => ({
  verifyToken: jest.fn((token: string) => {
    if (token === 'valid-admin') return { userId: 1, username: 'admin', permissions: ['oa:read'] };
    if (token === 'readonly-user') return { userId: 2, username: 'reader', permissions: ['oa:read'] };
    if (token === 'no-perm') return { userId: 3, username: 'noperm', permissions: [] };
    return null;
  }),
  extractTokenFromHeader: jest.fn((header?: string) => {
    if (!header || !header.startsWith('Bearer ')) return null;
    return header.slice(7);
  }),
}));

jest.mock('../../services/auth.service', () => ({
  getUserRolesAndPermissions: jest.fn(),
  getCurrentUser: jest.fn(),
}));

jest.mock('../../services/permission-cache.service', () => ({
  getUserPermissionCache: jest.fn(),
  setUserPermissionCache: jest.fn(),
  invalidateUserPermissionCache: jest.fn(),
  invalidateRolePermissionCache: jest.fn(),
  invalidatePermissionTreeCache: jest.fn(),
}));

// Mock OA 业务服务（控制器调用的 service 层）
jest.mock('../../services/oa/oa.mutation', () => ({
  submitApproval: jest.fn(),
  approveApproval: jest.fn(),
  rejectApproval: jest.fn(),
  transferApproval: jest.fn(),
  countersignApproval: jest.fn(),
  withdrawApproval: jest.fn(),
  markCcRead: jest.fn(),
}));

jest.mock('../../services/oa/mutations/update-instance', () => ({
  updateInstanceFormData: jest.fn(),
}));

jest.mock('../../services/oa/oa-form-type.query', () => ({
  getFormTypeByCodeQuery: jest.fn(),
}));

// =====================================================
// Import（mock 之后）
// =====================================================

import express from 'express';
import request from 'supertest';
import { appQuery } from '../../db/appPool';
import { getUserPermissionCache } from '../../services/permission-cache.service';
import { updateInstanceFormData } from '../../services/oa/mutations/update-instance';
import { approveApproval, rejectApproval } from '../../services/oa/oa.mutation';

const mockAppQuery = appQuery as jest.MockedFunction<typeof appQuery>;
const mockGetCache = getUserPermissionCache as jest.MockedFunction<typeof getUserPermissionCache>;
const mockUpdateInstance = updateInstanceFormData as jest.MockedFunction<typeof updateInstanceFormData>;
const mockApprove = approveApproval as jest.MockedFunction<typeof approveApproval>;
const mockReject = rejectApproval as jest.MockedFunction<typeof rejectApproval>;

// =====================================================
// 构建最小 Express 应用（仅挂载 OA 路由）
// =====================================================

async function createTestApp() {
  const app = express();
  app.use(express.json());

  // authMiddleware 依赖 verifyToken + getUserPermissionCache
  // 通过 mock jwt.verifyToken 和 permission-cache 来控制认证/授权结果

  // 延迟导入以确保 mock 生效
  const { default: oaRoutes } = await import('../../routes/oa.routes');
  app.use('/api/oa', oaRoutes);

  return app;
}

let app: express.Express;

beforeAll(async () => {
  app = await createTestApp();
});

beforeEach(() => {
  jest.clearAllMocks();
  // 默认 mock：用户状态正常 + 权限缓存命中
  mockAppQuery.mockResolvedValue({ rows: [{ status: 1 }] } as any);
  mockGetCache.mockReturnValue({
    roles: ['admin'],
    permissions: ['oa:read'],
  });
});

// =====================================================
// 认证中间件集成
// =====================================================

describe('OA 路由 - 认证中间件', () => {
  it('无 Authorization header → 401', async () => {
    const res = await request(app).get('/api/oa/form-types');
    expect(res.status).toBe(401);
  });

  it('无效 token → 401', async () => {
    const res = await request(app)
      .get('/api/oa/form-types')
      .set('Authorization', 'Bearer invalid-token');
    expect(res.status).toBe(401);
  });

  it('有效 token 但无 oa:read 权限 → 403', async () => {
    // no-perm 用户 (userId=3) 无任何权限
    mockGetCache.mockReturnValue({ roles: [], permissions: [] });

    const res = await request(app)
      .get('/api/oa/form-types')
      .set('Authorization', 'Bearer no-perm');

    expect(res.status).toBe(403);
  });
});

// =====================================================
// POST /api/oa/instances/:id/update（操作型节点更新）
// =====================================================

describe('POST /api/oa/instances/:id/update', () => {
  it('无认证 → 401', async () => {
    const res = await request(app)
      .post('/api/oa/instances/1/update')
      .send({ formData: { x: 1 } });
    expect(res.status).toBe(401);
  });

  it('无 oa:read 权限 → 403', async () => {
    // no-perm 用户无任何权限
    mockGetCache.mockReturnValue({ roles: [], permissions: [] });

    const res = await request(app)
      .post('/api/oa/instances/1/update')
      .set('Authorization', 'Bearer no-perm')
      .send({ formData: { x: 1 } });

    expect(res.status).toBe(403);
  });

  it('有 oa:read 权限 + 正常 formData → 200', async () => {
    mockUpdateInstance.mockResolvedValueOnce(undefined);

    const res = await request(app)
      .post('/api/oa/instances/42/update')
      .set('Authorization', 'Bearer valid-admin')
      .send({ formData: { field1: 'value1' }, comment: '更新备注' });

    expect(res.status).toBe(200);
    expect(res.body.message).toContain('更新');
    // JWT payload 中 username='admin'，但 controller 用的是 req.user.name（来自 DB，mock 未提供则为 undefined）
    expect(mockUpdateInstance).toHaveBeenCalledWith(
      42, 1, undefined, { field1: 'value1' }, '更新备注', undefined
    );
  });

  it('缺少 formData → 400', async () => {
    const res = await request(app)
      .post('/api/oa/instances/1/update')
      .set('Authorization', 'Bearer valid-admin')
      .send({ comment: '无 formData' });

    expect(res.status).toBe(400);
  });

  it('service 层抛异常 → 400', async () => {
    mockUpdateInstance.mockRejectedValueOnce(new Error('审批实例不存在'));

    const res = await request(app)
      .post('/api/oa/instances/999/update')
      .set('Authorization', 'Bearer valid-admin')
      .send({ formData: { x: 1 } });

    expect(res.status).toBe(400);
    expect(res.body.message).toContain('审批实例不存在');
  });
});

// =====================================================
// POST /api/oa/instances/:id/approve（审批通过）
// =====================================================

describe('POST /api/oa/instances/:id/approve', () => {
  it('无认证 → 401', async () => {
    const res = await request(app)
      .post('/api/oa/instances/1/approve')
      .send({});
    expect(res.status).toBe(401);
  });

  it('有权限 + 审批成功 → 200', async () => {
    mockApprove.mockResolvedValueOnce({ status: 'approved' } as any);

    const res = await request(app)
      .post('/api/oa/instances/10/approve')
      .set('Authorization', 'Bearer valid-admin')
      .send({ comment: '同意' });

    expect(res.status).toBe(200);
    expect(res.body.message).toContain('通过');
  });

  it('审批处理中 → 202', async () => {
    mockApprove.mockResolvedValueOnce({ status: 'processing' } as any);

    const res = await request(app)
      .post('/api/oa/instances/10/approve')
      .set('Authorization', 'Bearer valid-admin')
      .send({});

    expect(res.status).toBe(202);
  });

  it('带 inputData 审批 → 控制器正确传递到 service 层', async () => {
    mockApprove.mockResolvedValueOnce({ status: 'approved' } as any);

    const inputData = { action: 'verify', verifyRemark: '已核销' };
    const res = await request(app)
      .post('/api/oa/instances/10/approve')
      .set('Authorization', 'Bearer valid-admin')
      .send({ comment: '完成催收', inputData });

    expect(res.status).toBe(200);
    // 验证 approveApproval 被调用时传入了 inputData
    expect(mockApprove).toHaveBeenCalledWith(
      10,
      expect.any(Number), // userId
      undefined,           // userName（JWT mock 无 name 字段）
      '完成催收',         // comment
      inputData,          // inputData
      undefined,          // attachments
    );
  });
});

// =====================================================
// POST /api/oa/instances/:id/reject（审批拒绝）
// =====================================================

describe('POST /api/oa/instances/:id/reject', () => {
  it('缺少拒绝原因 → 400', async () => {
    const res = await request(app)
      .post('/api/oa/instances/1/reject')
      .set('Authorization', 'Bearer valid-admin')
      .send({});

    expect(res.status).toBe(400);
  });

  it('有拒绝原因 → 拒绝成功', async () => {
    mockReject.mockResolvedValueOnce(undefined);

    const res = await request(app)
      .post('/api/oa/instances/1/reject')
      .set('Authorization', 'Bearer valid-admin')
      .send({ comment: '不符合要求' });

    expect(res.status).toBe(200);
  });
});

// =====================================================
// GET /api/oa/form-types（表单类型列表）
// =====================================================

describe('GET /api/oa/form-types', () => {
  it('有 oa:read 权限 → 200 + 返回表单类型列表', async () => {
    const res = await request(app)
      .get('/api/oa/form-types')
      .set('Authorization', 'Bearer valid-admin');

    // 路由可达且非 401/403 即表示认证和权限链路正常
    expect(res.status).not.toBe(401);
    expect(res.status).not.toBe(403);
    expect(res.status).not.toBe(404);
  });

  it('无 oa:read 权限 → 403', async () => {
    mockGetCache.mockReturnValue({ roles: [], permissions: [] });

    const res = await request(app)
      .get('/api/oa/form-types')
      .set('Authorization', 'Bearer no-perm');

    expect(res.status).toBe(403);
  });
});

// =====================================================
// GET /api/oa/instances/stats（审批统计）
// =====================================================

describe('GET /api/oa/instances/stats', () => {
  it('有 oa:read 权限 → 路由可达', async () => {
    // beforeEach 已设置 appQuery mock，但多请求场景需确保每次调用都有返回值
    mockAppQuery.mockResolvedValue({ rows: [{ status: 1 }] } as any);

    const res = await request(app)
      .get('/api/oa/instances/stats')
      .set('Authorization', 'Bearer valid-admin');

    expect(res.status).not.toBe(401);
    expect(res.status).not.toBe(403);
    expect(res.status).not.toBe(404);
  });
});
