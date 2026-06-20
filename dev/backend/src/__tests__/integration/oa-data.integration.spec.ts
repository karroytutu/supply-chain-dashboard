/**
 * OA 数据管理 API 集成测试
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
    if (token === 'valid-admin')
      return { userId: 1, username: 'admin', permissions: ['oa:read'] };
    if (token === 'readonly-user')
      return { userId: 2, username: 'reader', permissions: ['oa:read'] };
    if (token === 'no-perm')
      return { userId: 3, username: 'noperm', permissions: [] };
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

// Mock OA 数据管理服务层
jest.mock('../../services/oa/oa.query', () => ({
  getDataListAll: jest.fn(),
}));

jest.mock('../../services/oa/queries/data-query', () => ({
  getDataListForExport: jest.fn().mockResolvedValue([]),
  generateExportHtml: jest.fn().mockReturnValue('<html></html>'),
  generateExportExcel: jest.fn().mockResolvedValue(undefined),
}));

// =====================================================
// Import（mock 之后）
// =====================================================

import express from 'express';
import request from 'supertest';
import { appQuery } from '../../db/appPool';
import { getUserPermissionCache } from '../../services/permission-cache.service';
import { getDataListAll } from '../../services/oa/oa.query';

const mockAppQuery = appQuery as jest.MockedFunction<typeof appQuery>;
const mockGetCache = getUserPermissionCache as jest.MockedFunction<typeof getUserPermissionCache>;
const mockGetDataListAll = getDataListAll as jest.MockedFunction<typeof getDataListAll>;

// =====================================================
// 构建最小 Express 应用（仅挂载 OA 路由）
// =====================================================

async function createTestApp() {
  const app = express();
  app.use(express.json());

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
// 认证授权中间件
// =====================================================

describe('OA 数据管理 - 认证授权', () => {
  it('GET /api/oa/data 无 Authorization header → 401', async () => {
    const res = await request(app).get('/api/oa/data');
    expect(res.status).toBe(401);
  });

  it('GET /api/oa/data 无效 token → 401', async () => {
    const res = await request(app)
      .get('/api/oa/data')
      .set('Authorization', 'Bearer invalid-token');
    expect(res.status).toBe(401);
  });

  it('GET /api/oa/data 有效 token 但无 oa:read 权限 → 403', async () => {
    mockGetCache.mockReturnValue({ roles: [], permissions: [] });

    const res = await request(app)
      .get('/api/oa/data')
      .set('Authorization', 'Bearer no-perm');

    expect(res.status).toBe(403);
  });
});

// =====================================================
// GET /api/oa/data（数据列表）
// =====================================================

describe('GET /api/oa/data', () => {
  it('正常查询 → 200 + 返回列表和总数', async () => {
    mockGetDataListAll.mockResolvedValueOnce({
      list: [
        {
          id: 1,
          instanceNo: 'OA-001',
          title: '测试审批',
          status: 'pending',
          formTypeName: '其他付款',
          applicantName: '张三',
        } as any,
      ],
      total: 1,
    });

    const res = await request(app)
      .get('/api/oa/data')
      .set('Authorization', 'Bearer valid-admin');

    expect(res.status).toBe(200);
    expect(res.body.code).toBe(200);
    expect(res.body.data.list).toHaveLength(1);
    expect(res.body.data.total).toBe(1);
  });

  it('筛选参数 (form_type_code, status) 透传到 service', async () => {
    mockGetDataListAll.mockResolvedValueOnce({ list: [], total: 0 });

    await request(app)
      .get('/api/oa/data?form_type_code=other_payment&status=approved')
      .set('Authorization', 'Bearer valid-admin');

    expect(mockGetDataListAll).toHaveBeenCalledWith(
      expect.objectContaining({
        formTypeCode: 'other_payment',
        status: 'approved',
      }),
    );
  });

  it('pageSize 非法值 → 自动修正为 20', async () => {
    mockGetDataListAll.mockResolvedValue({ list: [], total: 0 });

    // pageSize = 0 → 修正为 20
    await request(app)
      .get('/api/oa/data?page_size=0')
      .set('Authorization', 'Bearer valid-admin');

    expect(mockGetDataListAll).toHaveBeenCalledWith(
      expect.objectContaining({ pageSize: 20 }),
    );

    // pageSize = -1 → 修正为 20
    await request(app)
      .get('/api/oa/data?page_size=-1')
      .set('Authorization', 'Bearer valid-admin');

    expect(mockGetDataListAll).toHaveBeenCalledWith(
      expect.objectContaining({ pageSize: 20 }),
    );

    // pageSize = 200 → 修正为 20
    await request(app)
      .get('/api/oa/data?page_size=200')
      .set('Authorization', 'Bearer valid-admin');

    expect(mockGetDataListAll).toHaveBeenCalledWith(
      expect.objectContaining({ pageSize: 20 }),
    );
  });

  it('service 抛异常 → 500', async () => {
    mockGetDataListAll.mockRejectedValueOnce(new Error('Database error'));

    const res = await request(app)
      .get('/api/oa/data')
      .set('Authorization', 'Bearer valid-admin');

    expect(res.status).toBe(500);
  });
});

// =====================================================
// GET /api/oa/data/export（导出数据）
// =====================================================

describe('GET /api/oa/data/export', () => {
  it('有 oa:read 权限 → 200', async () => {
    const res = await request(app)
      .get('/api/oa/data/export?export_type=print')
      .set('Authorization', 'Bearer valid-admin');

    expect(res.status).toBe(200);
    expect(res.body.code).toBe(200);
  });

  it('无认证 → 401', async () => {
    const res = await request(app).get('/api/oa/data/export');
    expect(res.status).toBe(401);
  });
});
