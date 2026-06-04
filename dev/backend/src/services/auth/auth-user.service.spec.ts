/**
 * 认证服务 - 用户管理与权限工具 单元测试
 */

jest.mock('../../utils/logger', () => ({
  createLogger: () => ({ warn: jest.fn(), info: jest.fn(), error: jest.fn() }),
}));

jest.mock('../../utils/errorUtils', () => ({
  getErrorMessage: (e: unknown) => (e instanceof Error ? e.message : String(e)),
}));

// client query (getAppClient) 和 appQuery 使用不同的 mock
const mockClientQuery = jest.fn();
const mockRelease = jest.fn();
const mockAppQuery = jest.fn();

jest.mock('../../db/appPool', () => ({
  appQuery: (...args: any[]) => mockAppQuery(...args),
  getAppClient: jest.fn(() =>
    Promise.resolve({ query: mockClientQuery, release: mockRelease })
  ),
}));

import {
  createOrUpdateUser,
  getUserRolesAndPermissions,
  getCurrentUser,
  recordLoginLog,
} from './auth-user.service';

beforeEach(() => {
  jest.clearAllMocks();
});

// ==================== createOrUpdateUser ====================

describe('createOrUpdateUser', () => {
  const baseDingtalkUser = {
    userid: 'dt_user_1',
    unionid: 'union_1',
    name: '张三',
    avatar: 'https://example.com/avatar.png',
    mobile: '13800138000',
    email: 'zhangsan@example.com',
    department_id: ['dept_10'],
    title: '工程师',
  };

  it('已存在用户 → 执行 UPDATE 并返回更新后的用户', async () => {
    const existingUser = { id: 42, name: '旧名字' };
    const updatedUser = { id: 42, name: '张三' };

    mockClientQuery
      .mockResolvedValueOnce({}) // BEGIN
      .mockResolvedValueOnce({ rows: [existingUser] }) // SELECT
      .mockResolvedValueOnce({ rows: [updatedUser] }) // UPDATE RETURNING
      .mockResolvedValueOnce({}); // COMMIT

    const result = await createOrUpdateUser(baseDingtalkUser);

    expect(result).toEqual(updatedUser);
    expect(mockClientQuery).toHaveBeenCalledTimes(4);
    expect(mockClientQuery.mock.calls[2][0]).toContain('UPDATE users SET');
    expect(mockRelease).toHaveBeenCalled();
  });

  it('新用户 → 执行 INSERT 并分配 viewer 角色', async () => {
    const newUser = { id: 100, name: '张三' };

    mockClientQuery
      .mockResolvedValueOnce({}) // BEGIN
      .mockResolvedValueOnce({ rows: [] }) // SELECT 无匹配
      .mockResolvedValueOnce({ rows: [newUser] }) // INSERT RETURNING
      .mockResolvedValueOnce({ rows: [{ id: 5 }] }) // SELECT viewer role
      .mockResolvedValueOnce({}) // INSERT user_roles
      .mockResolvedValueOnce({}); // COMMIT

    const result = await createOrUpdateUser(baseDingtalkUser);

    expect(result).toEqual(newUser);
    expect(mockClientQuery).toHaveBeenCalledTimes(6);
    expect(mockClientQuery.mock.calls[3][0]).toContain("code = $1");
    expect(mockClientQuery.mock.calls[4][0]).toContain('INSERT INTO user_roles');
    expect(mockRelease).toHaveBeenCalled();
  });

  it('新用户但 viewer 角色不存在 → INSERT 不分配角色', async () => {
    const newUser = { id: 101, name: '张三' };

    mockClientQuery
      .mockResolvedValueOnce({}) // BEGIN
      .mockResolvedValueOnce({ rows: [] }) // SELECT 无匹配
      .mockResolvedValueOnce({ rows: [newUser] }) // INSERT RETURNING
      .mockResolvedValueOnce({ rows: [] }) // SELECT viewer (不存在)
      .mockResolvedValueOnce({}); // COMMIT

    const result = await createOrUpdateUser(baseDingtalkUser);

    expect(result).toEqual(newUser);
    expect(mockClientQuery).toHaveBeenCalledTimes(5);
    expect(mockRelease).toHaveBeenCalled();
  });

  it('可选字段缺失时使用默认空字符串', async () => {
    const minimalUser = { userid: 'dt_min', unionid: 'union_min', name: '李四' };
    const newUser = { id: 200, name: '李四' };

    mockClientQuery
      .mockResolvedValueOnce({}) // BEGIN
      .mockResolvedValueOnce({ rows: [] }) // SELECT
      .mockResolvedValueOnce({ rows: [newUser] }) // INSERT
      .mockResolvedValueOnce({ rows: [] }) // viewer (不存在)
      .mockResolvedValueOnce({}); // COMMIT

    await createOrUpdateUser(minimalUser);

    const insertParams = mockClientQuery.mock.calls[2][1];
    expect(insertParams[3]).toBe(''); // avatar
    expect(insertParams[4]).toBe(''); // mobile
    expect(insertParams[5]).toBe(''); // email
    expect(insertParams[6]).toBe(''); // department_id
    expect(insertParams[7]).toBe(''); // title
  });

  it('数据库错误 → ROLLBACK 并抛出', async () => {
    const dbError = new Error('连接中断');

    mockClientQuery
      .mockResolvedValueOnce({}) // BEGIN
      .mockRejectedValueOnce(dbError); // SELECT 失败

    await expect(createOrUpdateUser(baseDingtalkUser)).rejects.toThrow('连接中断');

    const rollbackCall = mockClientQuery.mock.calls.find(
      (c: any[]) => c[0] === 'ROLLBACK'
    );
    expect(rollbackCall).toBeTruthy();
    expect(mockRelease).toHaveBeenCalled();
  });

  it('finally 中始终释放 client', async () => {
    mockClientQuery
      .mockResolvedValueOnce({}) // BEGIN
      .mockResolvedValueOnce({ rows: [{ id: 1 }] }) // SELECT
      .mockResolvedValueOnce({ rows: [{ id: 1 }] }) // UPDATE
      .mockResolvedValueOnce({}); // COMMIT

    await createOrUpdateUser(baseDingtalkUser);
    expect(mockRelease).toHaveBeenCalledTimes(1);
  });
});

// ==================== getUserRolesAndPermissions ====================

describe('getUserRolesAndPermissions', () => {
  it('返回角色和权限列表', async () => {
    const roles = [
      { id: 1, code: 'admin', name: '管理员' },
      { id: 2, code: 'viewer', name: '查看者' },
    ];
    const permissions = [{ code: 'read' }, { code: 'write' }];

    mockAppQuery
      .mockResolvedValueOnce({ rows: roles })
      .mockResolvedValueOnce({ rows: permissions });

    const result = await getUserRolesAndPermissions(42);

    expect(result.roles).toEqual(roles);
    expect(result.permissions).toEqual(['read', 'write']);
    expect(mockAppQuery).toHaveBeenCalledTimes(2);
  });

  it('无角色无权限时返回空数组', async () => {
    mockAppQuery
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] });

    const result = await getUserRolesAndPermissions(999);

    expect(result.roles).toEqual([]);
    expect(result.permissions).toEqual([]);
  });
});

// ==================== getCurrentUser ====================

describe('getCurrentUser', () => {
  it('返回完整用户信息', async () => {
    const dbUser = {
      id: 1,
      name: '王五',
      avatar: 'avatar.png',
      mobile: '13000000000',
      email: 'wangwu@test.com',
      department_id: 'dept_1',
      department_name: '技术部',
      position: 'CTO',
    };

    mockAppQuery
      .mockResolvedValueOnce({ rows: [dbUser] }) // SELECT users
      .mockResolvedValueOnce({ rows: [{ id: 1, code: 'admin', name: '管理员' }] }) // roles
      .mockResolvedValueOnce({ rows: [{ code: 'manage' }] }); // permissions

    const result = await getCurrentUser(1);

    expect(result).not.toBeNull();
    expect(result!.id).toBe(1);
    expect(result!.name).toBe('王五');
    expect(result!.departmentId).toBe('dept_1');
    expect(result!.departmentName).toBe('技术部');
    expect(result!.roles).toHaveLength(1);
    expect(result!.permissions).toEqual(['manage']);
  });

  it('用户不存在时返回 null', async () => {
    mockAppQuery.mockResolvedValueOnce({ rows: [] });

    const result = await getCurrentUser(99999);

    expect(result).toBeNull();
    expect(mockAppQuery).toHaveBeenCalledTimes(1);
  });
});

// ==================== recordLoginLog ====================

describe('recordLoginLog', () => {
  it('成功记录登录日志', async () => {
    mockAppQuery.mockResolvedValueOnce({});

    await recordLoginLog(1, 'dingtalk', '127.0.0.1', 'Mozilla/5.0', true);

    expect(mockAppQuery).toHaveBeenCalledTimes(1);
    const params = mockAppQuery.mock.calls[0][1];
    expect(params[0]).toBe(1);
    expect(params[1]).toBe('dingtalk');
    expect(params[2]).toBe('127.0.0.1');
    expect(params[4]).toBe(1); // success = true → 1
    expect(params[5]).toBeUndefined();
  });

  it('记录失败登录日志', async () => {
    mockAppQuery.mockResolvedValueOnce({});

    await recordLoginLog(2, 'dev_login', undefined, undefined, false, 'Token expired');

    const params = mockAppQuery.mock.calls[0][1];
    expect(params[2]).toBeUndefined();
    expect(params[4]).toBe(0); // success = false → 0
    expect(params[5]).toBe('Token expired');
  });
});
