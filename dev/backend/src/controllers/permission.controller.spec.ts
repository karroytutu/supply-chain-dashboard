jest.mock('../services/permission.service', () => ({
  getAllPermissions: jest.fn(),
  getPermissionTree: jest.fn(),
  getPermissionById: jest.fn(),
  createPermission: jest.fn(),
  updatePermission: jest.fn(),
  deletePermission: jest.fn(),
}));

import {
  listPermissions,
  getPermissionTreeHandler,
  getPermission,
  createNewPermission,
  updatePermissionInfo,
  deletePermissionHandler,
} from './permission.controller';
import {
  getAllPermissions,
  getPermissionTree,
  getPermissionById,
  createPermission,
  updatePermission,
  deletePermission,
} from '../services/permission.service';
import { createMockRequest, createMockResponse } from '../__tests__/helpers/testFactory';

beforeEach(() => {
  jest.resetAllMocks();
});

describe('listPermissions', () => {
  it('获取所有权限', async () => {
    (getAllPermissions as jest.Mock).mockResolvedValueOnce([{ id: 1 }]);
    const req = createMockRequest();
    const res = createMockResponse();
    await listPermissions(req, res);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ data: [{ id: 1 }] }));
  });
});

describe('getPermissionTreeHandler', () => {
  it('获取权限树', async () => {
    (getPermissionTree as jest.Mock).mockResolvedValueOnce([{ id: 1, children: [] }]);
    const req = createMockRequest();
    const res = createMockResponse();
    await getPermissionTreeHandler(req, res);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ data: [{ id: 1, children: [] }] }));
  });
});

describe('getPermission', () => {
  it('无效 ID 返回 400', async () => {
    const req = createMockRequest({ params: { id: 'bad' } });
    const res = createMockResponse();
    await getPermission(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('权限不存在返回 404', async () => {
    (getPermissionById as jest.Mock).mockResolvedValueOnce(null);
    const req = createMockRequest({ params: { id: '99' } });
    const res = createMockResponse();
    await getPermission(req, res);
    expect(res.status).toHaveBeenCalledWith(404);
  });

  it('成功返回权限', async () => {
    (getPermissionById as jest.Mock).mockResolvedValueOnce({ id: 1, code: 'p1' });
    const req = createMockRequest({ params: { id: '1' } });
    const res = createMockResponse();
    await getPermission(req, res);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ data: { id: 1, code: 'p1' } }));
  });
});

describe('createNewPermission', () => {
  it('缺少参数返回 400', async () => {
    const req = createMockRequest({ body: {} });
    const res = createMockResponse();
    await createNewPermission(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('创建成功', async () => {
    (createPermission as jest.Mock).mockResolvedValueOnce({ id: 1, code: 'p1' });
    const req = createMockRequest({
      body: { code: 'p1', name: 'P1', resource_type: 'menu', resource_key: 'sys', action: 'view' },
    });
    const res = createMockResponse();
    await createNewPermission(req, res);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ message: '权限创建成功' }));
  });

  it('编码重复返回 400', async () => {
    const err = new Error('duplicate') as any;
    err.code = '23505';
    (createPermission as jest.Mock).mockRejectedValueOnce(err);
    const req = createMockRequest({
      body: { code: 'p1', name: 'P1', resource_type: 'menu', resource_key: 'sys', action: 'view' },
    });
    const res = createMockResponse();
    await createNewPermission(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ message: '权限编码已存在' }));
  });
});

describe('updatePermissionInfo', () => {
  it('无效 ID 返回 400', async () => {
    const req = createMockRequest({ params: { id: 'bad' } });
    const res = createMockResponse();
    await updatePermissionInfo(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('权限不存在返回 404', async () => {
    (updatePermission as jest.Mock).mockResolvedValueOnce(null);
    const req = createMockRequest({ params: { id: '99' }, body: { name: 'x' } });
    const res = createMockResponse();
    await updatePermissionInfo(req, res);
    expect(res.status).toHaveBeenCalledWith(404);
  });

  it('更新成功', async () => {
    (updatePermission as jest.Mock).mockResolvedValueOnce({ id: 1, name: 'new' });
    const req = createMockRequest({ params: { id: '1' }, body: { name: 'new' } });
    const res = createMockResponse();
    await updatePermissionInfo(req, res);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ data: { id: 1, name: 'new' } }));
  });
});

describe('deletePermissionHandler', () => {
  it('无效 ID 返回 400', async () => {
    const req = createMockRequest({ params: { id: 'bad' } });
    const res = createMockResponse();
    await deletePermissionHandler(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('权限不存在返回 404', async () => {
    (deletePermission as jest.Mock).mockResolvedValueOnce(false);
    const req = createMockRequest({ params: { id: '99' } });
    const res = createMockResponse();
    await deletePermissionHandler(req, res);
    expect(res.status).toHaveBeenCalledWith(404);
  });

  it('删除成功', async () => {
    (deletePermission as jest.Mock).mockResolvedValueOnce(true);
    const req = createMockRequest({ params: { id: '1' } });
    const res = createMockResponse();
    await deletePermissionHandler(req, res);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ message: '权限删除成功' }));
  });

  it('删除异常返回 400', async () => {
    (deletePermission as jest.Mock).mockRejectedValueOnce(new Error('权限正在使用中'));
    const req = createMockRequest({ params: { id: '1' } });
    const res = createMockResponse();
    await deletePermissionHandler(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
  });
});
