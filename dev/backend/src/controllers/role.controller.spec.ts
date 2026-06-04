jest.mock('../services/role.service', () => ({
  getRoleList: jest.fn(),
  getAllRoles: jest.fn(),
  getRoleById: jest.fn(),
  createRole: jest.fn(),
  updateRole: jest.fn(),
  deleteRole: jest.fn(),
  assignRolePermissions: jest.fn(),
}));

import {
  listRoles,
  listAllRoles,
  getRole,
  createNewRole,
  updateRoleInfo,
  deleteRoleHandler,
  assignPermissions,
} from './role.controller';
import {
  getRoleList,
  getAllRoles,
  getRoleById,
  createRole,
  updateRole,
  deleteRole,
  assignRolePermissions,
} from '../services/role.service';
import { createMockRequest, createMockResponse } from '../__tests__/helpers/testFactory';

beforeEach(() => {
  jest.resetAllMocks();
});

describe('listRoles', () => {
  it('查询角色列表', async () => {
    (getRoleList as jest.Mock).mockResolvedValueOnce({ list: [{ id: 1 }], total: 1 });
    const req = createMockRequest({ query: { page: '1', page_size: '10' } });
    const res = createMockResponse();
    await listRoles(req, res);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ code: 200, total: 1 }));
  });
});

describe('listAllRoles', () => {
  it('获取所有角色', async () => {
    (getAllRoles as jest.Mock).mockResolvedValueOnce([{ id: 1, name: 'admin' }]);
    const req = createMockRequest();
    const res = createMockResponse();
    await listAllRoles(req, res);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ data: [{ id: 1, name: 'admin' }] })
    );
  });
});

describe('getRole', () => {
  it('无效 ID 返回 400', async () => {
    const req = createMockRequest({ params: { id: 'bad' } });
    const res = createMockResponse();
    await getRole(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('角色不存在返回 404', async () => {
    (getRoleById as jest.Mock).mockResolvedValueOnce(null);
    const req = createMockRequest({ params: { id: '99' } });
    const res = createMockResponse();
    await getRole(req, res);
    expect(res.status).toHaveBeenCalledWith(404);
  });

  it('成功返回角色', async () => {
    (getRoleById as jest.Mock).mockResolvedValueOnce({ id: 1, name: 'admin' });
    const req = createMockRequest({ params: { id: '1' } });
    const res = createMockResponse();
    await getRole(req, res);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ data: { id: 1, name: 'admin' } }));
  });
});

describe('createNewRole', () => {
  it('缺少参数返回 400', async () => {
    const req = createMockRequest({ body: {} });
    const res = createMockResponse();
    await createNewRole(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('创建成功', async () => {
    (createRole as jest.Mock).mockResolvedValueOnce({ id: 1, code: 'test', name: 'Test' });
    const req = createMockRequest({ body: { code: 'test', name: 'Test' } });
    const res = createMockResponse();
    await createNewRole(req, res);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ message: '角色创建成功' }));
  });

  it('编码重复返回 400', async () => {
    const err = new Error('duplicate') as any;
    err.code = '23505';
    (createRole as jest.Mock).mockRejectedValueOnce(err);
    const req = createMockRequest({ body: { code: 'dup', name: 'Dup' } });
    const res = createMockResponse();
    await createNewRole(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ message: '角色编码已存在' }));
  });
});

describe('updateRoleInfo', () => {
  it('无效 ID 返回 400', async () => {
    const req = createMockRequest({ params: { id: 'bad' } });
    const res = createMockResponse();
    await updateRoleInfo(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('角色不存在返回 404', async () => {
    (updateRole as jest.Mock).mockResolvedValueOnce(null);
    const req = createMockRequest({ params: { id: '99' }, body: { name: 'x' } });
    const res = createMockResponse();
    await updateRoleInfo(req, res);
    expect(res.status).toHaveBeenCalledWith(404);
  });

  it('更新成功', async () => {
    (updateRole as jest.Mock).mockResolvedValueOnce({ id: 1, name: 'new' });
    const req = createMockRequest({ params: { id: '1' }, body: { name: 'new' } });
    const res = createMockResponse();
    await updateRoleInfo(req, res);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ data: { id: 1, name: 'new' } }));
  });
});

describe('deleteRoleHandler', () => {
  it('无效 ID 返回 400', async () => {
    const req = createMockRequest({ params: { id: 'bad' } });
    const res = createMockResponse();
    await deleteRoleHandler(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('角色不存在返回 404', async () => {
    (deleteRole as jest.Mock).mockResolvedValueOnce(false);
    const req = createMockRequest({ params: { id: '99' } });
    const res = createMockResponse();
    await deleteRoleHandler(req, res);
    expect(res.status).toHaveBeenCalledWith(404);
  });

  it('删除成功', async () => {
    (deleteRole as jest.Mock).mockResolvedValueOnce(true);
    const req = createMockRequest({ params: { id: '1' } });
    const res = createMockResponse();
    await deleteRoleHandler(req, res);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ message: '角色删除成功' }));
  });

  it('删除异常返回 400', async () => {
    (deleteRole as jest.Mock).mockRejectedValueOnce(new Error('角色正在使用中'));
    const req = createMockRequest({ params: { id: '1' } });
    const res = createMockResponse();
    await deleteRoleHandler(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
  });
});

describe('assignPermissions', () => {
  it('无效 ID 返回 400', async () => {
    const req = createMockRequest({ params: { id: 'bad' }, body: { permissionIds: [] } });
    const res = createMockResponse();
    await assignPermissions(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('权限列表格式错误返回 400', async () => {
    const req = createMockRequest({ params: { id: '1' }, body: { permissionIds: 'bad' } });
    const res = createMockResponse();
    await assignPermissions(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('分配权限成功', async () => {
    (assignRolePermissions as jest.Mock).mockResolvedValueOnce(undefined);
    const req = createMockRequest({ params: { id: '1' }, body: { permissionIds: [1, 2] } });
    const res = createMockResponse();
    await assignPermissions(req, res);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ message: '权限分配成功' }));
  });
});
