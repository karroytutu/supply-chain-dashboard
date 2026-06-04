jest.mock('../services/user.service', () => ({
  getUserList: jest.fn(),
  getUserById: jest.fn(),
  updateUser: jest.fn(),
  updateUserStatus: jest.fn(),
  assignUserRoles: jest.fn(),
  getUserLoginLogs: jest.fn(),
  batchUpdateUserStatus: jest.fn(),
  batchAssignUserRoles: jest.fn(),
}));

import {
  listUsers,
  getUser,
  updateUserInfo,
  updateUserStatusHandler,
  assignRoles,
  getLoginLogs,
  batchUpdateUserStatus,
  batchAssignUserRoles,
} from './user.controller';
import {
  getUserList,
  getUserById,
  updateUser,
  updateUserStatus,
  assignUserRoles,
  getUserLoginLogs,
  batchUpdateUserStatus as batchUpdateStatus,
  batchAssignUserRoles as batchAssignRoles,
} from '../services/user.service';
import { createMockRequest, createMockResponse } from '../__tests__/helpers/testFactory';

beforeEach(() => {
  jest.resetAllMocks();
});

describe('listUsers', () => {
  it('查询用户列表', async () => {
    (getUserList as jest.Mock).mockResolvedValueOnce({ list: [{ id: 1 }], total: 1 });
    const req = createMockRequest({ query: { page: '1', page_size: '10' } });
    const res = createMockResponse();
    await listUsers(req, res);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ code: 200, total: 1 })
    );
  });
});

describe('getUser', () => {
  it('无效 ID 返回 400', async () => {
    const req = createMockRequest({ params: { id: 'bad' } });
    const res = createMockResponse();
    await getUser(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('用户不存在返回 404', async () => {
    (getUserById as jest.Mock).mockResolvedValueOnce(null);
    const req = createMockRequest({ params: { id: '99' } });
    const res = createMockResponse();
    await getUser(req, res);
    expect(res.status).toHaveBeenCalledWith(404);
  });

  it('成功返回用户', async () => {
    (getUserById as jest.Mock).mockResolvedValueOnce({ id: 1, name: 'test' });
    const req = createMockRequest({ params: { id: '1' } });
    const res = createMockResponse();
    await getUser(req, res);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ data: { id: 1, name: 'test' } }));
  });
});

describe('updateUserInfo', () => {
  it('无效 ID 返回 400', async () => {
    const req = createMockRequest({ params: { id: 'bad' } });
    const res = createMockResponse();
    await updateUserInfo(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('用户不存在返回 404', async () => {
    (updateUser as jest.Mock).mockResolvedValueOnce(null);
    const req = createMockRequest({ params: { id: '99' }, body: { name: 'new' } });
    const res = createMockResponse();
    await updateUserInfo(req, res);
    expect(res.status).toHaveBeenCalledWith(404);
  });

  it('更新成功', async () => {
    (updateUser as jest.Mock).mockResolvedValueOnce({ id: 1, name: 'new' });
    const req = createMockRequest({ params: { id: '1' }, body: { name: 'new' } });
    const res = createMockResponse();
    await updateUserInfo(req, res);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ data: { id: 1, name: 'new' } }));
  });
});

describe('updateUserStatusHandler', () => {
  it('无效 ID 返回 400', async () => {
    const req = createMockRequest({ params: { id: 'bad' }, body: { status: 1 } });
    const res = createMockResponse();
    await updateUserStatusHandler(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('无效状态值返回 400', async () => {
    const req = createMockRequest({ params: { id: '1' }, body: { status: 5 } });
    const res = createMockResponse();
    await updateUserStatusHandler(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('用户不存在返回 404', async () => {
    (updateUserStatus as jest.Mock).mockResolvedValueOnce(false);
    const req = createMockRequest({ params: { id: '99' }, body: { status: 1 } });
    const res = createMockResponse();
    await updateUserStatusHandler(req, res);
    expect(res.status).toHaveBeenCalledWith(404);
  });

  it('启用用户成功', async () => {
    (updateUserStatus as jest.Mock).mockResolvedValueOnce(true);
    const req = createMockRequest({ params: { id: '1' }, body: { status: 1 } });
    const res = createMockResponse();
    await updateUserStatusHandler(req, res);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ message: '用户已启用' }));
  });

  it('禁用用户成功', async () => {
    (updateUserStatus as jest.Mock).mockResolvedValueOnce(true);
    const req = createMockRequest({ params: { id: '1' }, body: { status: 0 } });
    const res = createMockResponse();
    await updateUserStatusHandler(req, res);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ message: '用户已禁用' }));
  });
});

describe('assignRoles', () => {
  it('无效 ID 返回 400', async () => {
    const req = createMockRequest({ params: { id: 'bad' }, body: { roleIds: [1] } });
    const res = createMockResponse();
    await assignRoles(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('角色 ID 列表格式错误返回 400', async () => {
    const req = createMockRequest({ params: { id: '1' }, body: { roleIds: 'not-array' } });
    const res = createMockResponse();
    await assignRoles(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('分配角色成功', async () => {
    (assignUserRoles as jest.Mock).mockResolvedValueOnce(undefined);
    const req = createMockRequest({ params: { id: '1' }, body: { roleIds: [1, 2] } });
    const res = createMockResponse();
    await assignRoles(req, res);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ message: '角色分配成功' }));
  });
});

describe('getLoginLogs', () => {
  it('无效 ID 返回 400', async () => {
    const req = createMockRequest({ params: { id: 'bad' } });
    const res = createMockResponse();
    await getLoginLogs(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('查询日志成功', async () => {
    (getUserLoginLogs as jest.Mock).mockResolvedValueOnce({ list: [], total: 0 });
    const req = createMockRequest({ params: { id: '1' }, query: { page: '1' } });
    const res = createMockResponse();
    await getLoginLogs(req, res);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ code: 200, total: 0 }));
  });
});

describe('batchUpdateUserStatus', () => {
  it('用户 ID 列表为空返回 400', async () => {
    const req = createMockRequest({ body: { userIds: [], status: 1 } });
    const res = createMockResponse();
    await batchUpdateUserStatus(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('无效状态值返回 400', async () => {
    const req = createMockRequest({ body: { userIds: [1], status: 5 } });
    const res = createMockResponse();
    await batchUpdateUserStatus(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('批量启用成功', async () => {
    (batchUpdateStatus as jest.Mock).mockResolvedValueOnce(3);
    const req = createMockRequest({ body: { userIds: [1, 2, 3], status: 1 } });
    const res = createMockResponse();
    await batchUpdateUserStatus(req, res);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ data: { affectedCount: 3 }, message: '成功启用 3 个用户' })
    );
  });
});

describe('batchAssignUserRoles', () => {
  it('用户 ID 列表为空返回 400', async () => {
    const req = createMockRequest({ body: { userIds: [], roleIds: [1] } });
    const res = createMockResponse();
    await batchAssignUserRoles(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('角色 ID 列表格式错误返回 400', async () => {
    const req = createMockRequest({ body: { userIds: [1], roleIds: 'bad' } });
    const res = createMockResponse();
    await batchAssignUserRoles(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('批量分配角色成功', async () => {
    (batchAssignRoles as jest.Mock).mockResolvedValueOnce(undefined);
    const req = createMockRequest({ body: { userIds: [1, 2], roleIds: [1] } });
    const res = createMockResponse();
    await batchAssignUserRoles(req, res);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ message: '成功为 2 个用户分配角色' })
    );
  });
});
