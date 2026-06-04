/**
 * 认证服务 - 开发环境工具 单元测试
 */

jest.mock('../../utils/logger', () => ({
  createLogger: () => ({ warn: jest.fn(), info: jest.fn(), error: jest.fn() }),
}));

jest.mock('../../utils/errorUtils', () => ({
  getErrorMessage: (e: unknown) => (e instanceof Error ? e.message : String(e)),
}));

const mockAppQuery = jest.fn();
jest.mock('../../db/appPool', () => ({
  appQuery: (...args: any[]) => mockAppQuery(...args),
}));

const mockGenerateToken = jest.fn().mockReturnValue('mock-jwt-token');
jest.mock('../../utils/jwt', () => ({
  generateToken: (payload: any) => mockGenerateToken(payload),
}));

const mockGetCurrentUser = jest.fn();
const mockGetUserRolesAndPermissions = jest.fn();
const mockRecordLoginLog = jest.fn();
jest.mock('./auth-user.service', () => ({
  getCurrentUser: (...args: any[]) => mockGetCurrentUser(...args),
  getUserRolesAndPermissions: (...args: any[]) => mockGetUserRolesAndPermissions(...args),
  recordLoginLog: (...args: any[]) => mockRecordLoginLog(...args),
}));

import { devSwitchUser, devGetUsers, devLogin } from './auth-dev.service';

const savedEnv = process.env.NODE_ENV;

beforeEach(() => {
  jest.clearAllMocks();
  process.env.NODE_ENV = 'development';
});

afterAll(() => {
  process.env.NODE_ENV = savedEnv;
});

// ==================== devSwitchUser ====================

describe('devSwitchUser', () => {
  it('用户存在 → 返回 token 和用户信息', async () => {
    const user = {
      id: 1,
      name: '张三',
      avatar: 'a.png',
      mobile: '13800000000',
      email: 'z@test.com',
      departmentId: 'd1',
      departmentName: '技术部',
      position: '工程师',
      roles: [],
      permissions: [],
    };
    const roles = [{ id: 1, code: 'admin', name: '管理员' }];
    const permissions = ['read', 'write'];

    mockGetCurrentUser.mockResolvedValueOnce(user);
    mockGetUserRolesAndPermissions.mockResolvedValueOnce({ roles, permissions });

    const result = await devSwitchUser(1);

    expect(result.success).toBe(true);
    expect(result.token).toBe('mock-jwt-token');
    expect(result.user!.id).toBe(1);
    expect(result.user!.name).toBe('张三');
    expect(result.user!.roles).toEqual(roles);
    expect(result.user!.permissions).toEqual(permissions);

    // 验证 generateToken payload
    const payload = (mockGenerateToken.mock.calls as any[][])[0][0];
    expect(payload.userId).toBe(1);
    expect(payload.dingtalkUserId).toBe('dev_switch_1');
    expect(payload.roles).toEqual(['admin']);
  });

  it('用户不存在 → 返回失败', async () => {
    mockGetCurrentUser.mockResolvedValueOnce(null);

    const result = await devSwitchUser(99999);

    expect(result.success).toBe(false);
    expect(result.message).toBe('用户不存在或已被禁用');
    expect(mockGenerateToken).not.toHaveBeenCalled();
  });

  it('异常时返回错误信息', async () => {
    mockGetCurrentUser.mockRejectedValueOnce(new Error('DB connection lost'));

    const result = await devSwitchUser(1);

    expect(result.success).toBe(false);
    expect(result.message).toBe('DB connection lost');
  });
});

// ==================== devGetUsers ====================

describe('devGetUsers', () => {
  it('返回用户列表', async () => {
    const rows = [
      { id: 1, name: '张三', avatar: 'a.png', roles: [{ id: 1, code: 'admin', name: '管理员' }] },
      { id: 2, name: '李四', avatar: null, roles: [] },
    ];
    mockAppQuery.mockResolvedValueOnce({ rows });

    const result = await devGetUsers();

    expect(result).toHaveLength(2);
    expect(result[0].id).toBe(1);
    expect(result[0].roles).toHaveLength(1);
    expect(result[1].roles).toEqual([]);
  });

  it('数据库错误 → 返回空数组', async () => {
    mockAppQuery.mockRejectedValueOnce(new Error('query failed'));

    const result = await devGetUsers();

    expect(result).toEqual([]);
  });
});

// ==================== devLogin ====================

describe('devLogin', () => {
  it('生产环境 → 直接拒绝', async () => {
    process.env.NODE_ENV = 'production';

    const result = await devLogin();

    expect(result.success).toBe(false);
    expect(result.message).toBe('开发登录仅用于开发环境');
    expect(mockAppQuery).not.toHaveBeenCalled();
  });

  it('已有 dev_admin 用户 → 更新登录时间并返回 token', async () => {
    const existingUser = {
      id: 10,
      name: '开发管理员',
      avatar: '',
      mobile: '',
      email: '',
      department_id: '',
      position: '',
    };
    const roles = [{ id: 1, code: 'admin', name: '管理员' }];
    const permissions = ['manage'];

    mockAppQuery
      .mockResolvedValueOnce({ rows: [existingUser] }) // SELECT users
      .mockResolvedValueOnce({}); // UPDATE last_login_at
    mockRecordLoginLog.mockResolvedValueOnce(undefined);
    mockGetUserRolesAndPermissions.mockResolvedValueOnce({ roles, permissions });

    const result = await devLogin('127.0.0.1', 'TestAgent');

    expect(result.success).toBe(true);
    expect(result.token).toBe('mock-jwt-token');
    expect(result.user!.id).toBe(10);
    expect(result.user!.name).toBe('开发管理员');

    // 验证 recordLoginLog 调用
    expect(mockRecordLoginLog).toHaveBeenCalledWith(
      10,
      'dev_login',
      '127.0.0.1',
      'TestAgent',
      true
    );
  });

  it('无 dev_admin → 创建用户并分配已有 admin 角色', async () => {
    const newUser = { id: 20, name: '开发管理员' };
    const roles = [{ id: 1, code: 'admin', name: '管理员' }];

    mockAppQuery
      .mockResolvedValueOnce({ rows: [] }) // SELECT users (空)
      .mockResolvedValueOnce({ rows: [newUser] }) // INSERT user RETURNING
      .mockResolvedValueOnce({ rows: [{ id: 1 }] }) // SELECT admin role (已存在)
      .mockResolvedValueOnce({}); // INSERT user_roles
    mockRecordLoginLog.mockResolvedValueOnce(undefined);
    mockGetUserRolesAndPermissions.mockResolvedValueOnce({ roles, permissions: [] });

    const result = await devLogin();

    expect(result.success).toBe(true);
    expect(result.user!.id).toBe(20);
    // 应该只有4次 appQuery 调用（无创建角色和权限分配）
    expect(mockAppQuery).toHaveBeenCalledTimes(4);
  });

  it('无 dev_admin 且无 admin 角色 → 创建角色并分配所有权限', async () => {
    const newUser = { id: 30, name: '开发管理员' };
    const newRole = { id: 99, code: 'admin', name: '管理员' };
    const roles = [{ id: 99, code: 'admin', name: '管理员' }];

    mockAppQuery
      .mockResolvedValueOnce({ rows: [] }) // SELECT users (空)
      .mockResolvedValueOnce({ rows: [newUser] }) // INSERT user RETURNING
      .mockResolvedValueOnce({ rows: [] }) // SELECT admin role (不存在)
      .mockResolvedValueOnce({ rows: [newRole] }) // INSERT role RETURNING
      .mockResolvedValueOnce({}) // INSERT user_roles
      .mockResolvedValueOnce({ rows: [{ id: 1 }, { id: 2 }] }) // SELECT permissions
      .mockResolvedValueOnce({}) // INSERT role_permissions (perm 1)
      .mockResolvedValueOnce({}); // INSERT role_permissions (perm 2)
    mockRecordLoginLog.mockResolvedValueOnce(undefined);
    mockGetUserRolesAndPermissions.mockResolvedValueOnce({ roles, permissions: ['p1', 'p2'] });

    const result = await devLogin();

    expect(result.success).toBe(true);
    expect(result.user!.id).toBe(30);
    // 验证权限分配：2个权限 → 2次 INSERT role_permissions
    const rpInserts = mockAppQuery.mock.calls.filter(
      (c: any[]) => typeof c[0] === 'string' && c[0].includes('role_permissions')
    );
    expect(rpInserts).toHaveLength(2);
  });

  it('异常时返回错误信息', async () => {
    mockAppQuery.mockRejectedValueOnce(new Error('table not found'));

    const result = await devLogin();

    expect(result.success).toBe(false);
    expect(result.message).toBe('table not found');
  });
});
