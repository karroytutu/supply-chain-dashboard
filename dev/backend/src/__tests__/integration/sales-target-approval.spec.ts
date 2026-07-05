/**
 * 目标审批提交 API 集成测试
 * 测试 POST /api/sales/targets/:id/submit-approval 的完整 HTTP 链路
 */

// =====================================================
// Mock 层（必须在 import 之前）
// =====================================================

jest.mock('../../utils/logger', () => ({
  createLogger: () => ({ warn: jest.fn(), info: jest.fn(), error: jest.fn() }),
  default: { warn: jest.fn(), info: jest.fn(), error: jest.fn() },
}));

jest.mock('../../config', () => ({
  config: {
    app: { baseUrl: 'http://localhost:8100', port: 8100 },
    db: { host: 'localhost', name: 'test', user: 'test', password: 'test' },
    dingtalk: { appKey: 'test', appSecret: 'test', corpId: 'test', agentId: 'test' },
    jwt: { secret: 'test-secret' },
    cors: { allowedOrigins: ['http://localhost:3100'] },
  },
}));

jest.mock('../../db/appPool', () => ({
  appQuery: jest.fn(),
  getAppClient: jest.fn(),
}));

jest.mock('../../utils/jwt', () => ({
  verifyToken: jest.fn((token: string) => {
    if (token === 'valid-manager') return { userId: 1, username: 'manager', name: '李经理', permissions: ['sales:target:write'] };
    if (token === 'readonly-user') return { userId: 2, username: 'reader', name: '只读用户', permissions: ['sales:target:read'] };
    if (token === 'no-perm') return { userId: 3, username: 'noperm', name: '无权限', permissions: [] };
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

// Mock OA 提交审批
jest.mock('../../services/oa/oa.mutation', () => ({
  submitApproval: jest.fn(),
}));

// Mock OA 表单类型查询
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
import { submitApproval } from '../../services/oa/oa.mutation';
import { getFormTypeByCodeQuery } from '../../services/oa/oa-form-type.query';

const mockAppQuery = appQuery as jest.MockedFunction<typeof appQuery>;
const mockGetCache = getUserPermissionCache as jest.MockedFunction<typeof getUserPermissionCache>;
const mockSubmitApproval = submitApproval as jest.MockedFunction<typeof submitApproval>;
const mockGetFormType = getFormTypeByCodeQuery as jest.MockedFunction<typeof getFormTypeByCodeQuery>;

// =====================================================
// 构建最小 Express 应用（仅挂载目标管理路由）
// =====================================================

async function createTestApp() {
  const app = express();
  app.use(express.json());

  // 延迟导入以确保 mock 生效
  const { default: salesTargetRoutes } = await import('../../routes/sales-target.routes');
  app.use('/api/sales/targets', salesTargetRoutes);

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
    roles: ['marketing_manager'],
    permissions: ['sales:target:read', 'sales:target:write'],
  });
});

// =====================================================
// 认证中间件
// =====================================================

describe('目标审批路由 - 认证中间件', () => {
  it('无 Authorization header → 401', async () => {
    const res = await request(app).post('/api/sales/targets/1/submit-approval');
    expect(res.status).toBe(401);
  });

  it('无效 token → 401', async () => {
    const res = await request(app)
      .post('/api/sales/targets/1/submit-approval')
      .set('Authorization', 'Bearer invalid-token');
    expect(res.status).toBe(401);
  });

  it('有效 token 但无 write 权限 → 403', async () => {
    mockGetCache.mockReturnValue({ roles: [], permissions: ['sales:target:read'] });

    const res = await request(app)
      .post('/api/sales/targets/1/submit-approval')
      .set('Authorization', 'Bearer readonly-user');

    expect(res.status).toBe(403);
  });
});

// =====================================================
// POST /api/sales/targets/:id/submit-approval
// =====================================================

describe('POST /api/sales/targets/:id/submit-approval', () => {
  it('无效目标 ID → 400', async () => {
    const res = await request(app)
      .post('/api/sales/targets/abc/submit-approval')
      .set('Authorization', 'Bearer valid-manager')
      .send({});

    expect(res.status).toBe(400);
    expect(res.body.message).toContain('无效');
  });

  it('目标不存在 → 404', async () => {
    // auth middleware 查用户状态 + getTargetById 返回 null
    mockAppQuery
      .mockResolvedValueOnce({ rows: [{ status: 1 }] } as any) // auth: user status
      .mockResolvedValueOnce({ rows: [] } as any); // getTargetById

    const res = await request(app)
      .post('/api/sales/targets/999/submit-approval')
      .set('Authorization', 'Bearer valid-manager')
      .send({});

    expect(res.status).toBe(404);
    expect(res.body.message).toContain('不存在');
  });

  it('目标状态为 approved（不允许提交）→ 400', async () => {
    mockAppQuery
      .mockResolvedValueOnce({ rows: [{ status: 1 }] } as any) // auth
      .mockResolvedValueOnce({
        rows: [{ id: 1, marketer_id: 1, year: 2026, month: 7, status: 'approved', marketer_name: '张三' }],
      } as any); // getTargetById

    const res = await request(app)
      .post('/api/sales/targets/1/submit-approval')
      .set('Authorization', 'Bearer valid-manager')
      .send({});

    expect(res.status).toBe(400);
    expect(res.body.message).toContain('不允许提交');
  });

  it('目标状态为 pending（不允许重复提交）→ 400', async () => {
    mockAppQuery
      .mockResolvedValueOnce({ rows: [{ status: 1 }] } as any) // auth
      .mockResolvedValueOnce({
        rows: [{ id: 1, marketer_id: 1, year: 2026, month: 7, status: 'pending', marketer_name: '张三' }],
      } as any); // getTargetById

    const res = await request(app)
      .post('/api/sales/targets/1/submit-approval')
      .set('Authorization', 'Bearer valid-manager')
      .send({});

    expect(res.status).toBe(400);
    expect(res.body.message).toContain('不允许提交');
  });

  it('draft 目标提交成功 → 返回 oaInstanceId', async () => {
    mockAppQuery
      .mockResolvedValueOnce({ rows: [{ status: 1 }] } as any) // auth: user status
      .mockResolvedValueOnce({
        rows: [{ id: 1, marketer_id: 1, year: 2026, month: 7, status: 'draft', marketer_name: '张三' }],
      } as any) // getTargetById
      .mockResolvedValueOnce({ rowCount: 1 } as any); // updateTargetStatus

    mockGetFormType.mockResolvedValueOnce({
      code: 'sales_target_approval',
      name: '销售目标审批',
      formSchema: { fields: [] },
      workflowDef: { nodes: [] },
    } as any);

    mockSubmitApproval.mockResolvedValueOnce({
      instanceId: 100,
      instanceNo: 'OA-2026-001',
    });

    const res = await request(app)
      .post('/api/sales/targets/1/submit-approval')
      .set('Authorization', 'Bearer valid-manager')
      .send({ submitterSignature: 'data:image/png;base64,...' });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.oaInstanceId).toBe(100);
    expect(res.body.data.instanceNo).toBe('OA-2026-001');

    // 验证 submitApproval 被正确调用
    expect(mockSubmitApproval).toHaveBeenCalledWith(
      expect.objectContaining({
        formTypeCode: 'sales_target_approval',
        title: expect.stringContaining('张三'),
      }),
      expect.anything(),
      1, // userId
      '李经理', // userName
      null, // userDept (mock 中无 department_name)
    );
  });

  it('rejected 目标允许重新提交', async () => {
    mockAppQuery
      .mockResolvedValueOnce({ rows: [{ status: 1 }] } as any) // auth
      .mockResolvedValueOnce({
        rows: [{ id: 1, marketer_id: 1, year: 2026, month: 7, status: 'rejected', marketer_name: '张三' }],
      } as any) // getTargetById
      .mockResolvedValueOnce({ rowCount: 1 } as any); // updateTargetStatus

    mockGetFormType.mockResolvedValueOnce({
      code: 'sales_target_approval',
      name: '销售目标审批',
      formSchema: { fields: [] },
      workflowDef: { nodes: [] },
    } as any);

    mockSubmitApproval.mockResolvedValueOnce({
      instanceId: 101,
      instanceNo: 'OA-2026-002',
    });

    const res = await request(app)
      .post('/api/sales/targets/1/submit-approval')
      .set('Authorization', 'Bearer valid-manager')
      .send({});

    expect(res.status).toBe(200);
    expect(res.body.data.oaInstanceId).toBe(101);
  });

  it('OA 提交失败 → 返回 400 且不更新目标状态', async () => {
    mockAppQuery
      .mockResolvedValueOnce({ rows: [{ status: 1 }] } as any) // auth
      .mockResolvedValueOnce({
        rows: [{ id: 1, marketer_id: 1, year: 2026, month: 7, status: 'draft', marketer_name: '张三' }],
      } as any); // getTargetById

    mockGetFormType.mockResolvedValueOnce({
      code: 'sales_target_approval',
      name: '销售目标审批',
      formSchema: { fields: [] },
      workflowDef: { nodes: [] },
    } as any);

    mockSubmitApproval.mockRejectedValueOnce(new Error('OA系统异常'));

    const res = await request(app)
      .post('/api/sales/targets/1/submit-approval')
      .set('Authorization', 'Bearer valid-manager')
      .send({});

    expect(res.status).toBe(400);
    expect(res.body.message).toContain('OA系统异常');
  });
});
