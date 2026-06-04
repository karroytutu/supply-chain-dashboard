/**
 * 权限服务单元测试
 */

jest.mock('../utils/logger', () => ({
  createLogger: () => ({ info: jest.fn(), error: jest.fn(), warn: jest.fn() }),
}));

jest.mock('../db/appPool', () => ({
  appQuery: jest.fn(),
}));

jest.mock('./permission-cache.service', () => ({
  getPermissionTreeCache: jest.fn(),
  setPermissionTreeCache: jest.fn(),
  invalidatePermissionTreeCache: jest.fn(),
}));

import { appQuery } from '../db/appPool';
import { mockQueryResult } from '../__tests__/helpers/mockDb';
import {
  getPermissionTreeCache,
  setPermissionTreeCache,
  invalidatePermissionTreeCache,
} from './permission-cache.service';
import {
  getAllPermissions,
  getPermissionTree,
  getPermissionById,
  createPermission,
  updatePermission,
  deletePermission,
} from './permission.service';

const mockAppQuery = appQuery as jest.MockedFunction<typeof appQuery>;
const mockGetCache = getPermissionTreeCache as jest.MockedFunction<typeof getPermissionTreeCache>;
const mockSetCache = setPermissionTreeCache as jest.MockedFunction<typeof setPermissionTreeCache>;
const mockInvalidate = invalidatePermissionTreeCache as jest.MockedFunction<typeof invalidatePermissionTreeCache>;

describe('permission.service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('getAllPermissions', () => {
    it('返回所有权限列表', async () => {
      const rows = [
        { id: 1, code: 'system:user:read', name: '查看用户' },
        { id: 2, code: 'system:user:write', name: '编辑用户' },
      ];
      mockAppQuery.mockResolvedValueOnce(mockQueryResult(rows));

      const result = await getAllPermissions();

      expect(result).toEqual(rows);
      expect(mockAppQuery).toHaveBeenCalledWith(
        expect.stringContaining('ORDER BY sort_order')
      );
    });
  });

  describe('getPermissionTree', () => {
    it('缓存命中时直接返回缓存数据', async () => {
      const cachedTree = [{ id: 1, code: 'system', children: [] }];
      mockGetCache.mockReturnValueOnce(cachedTree as any);

      const result = await getPermissionTree();

      expect(result).toEqual(cachedTree);
      expect(mockAppQuery).not.toHaveBeenCalled();
    });

    it('缓存未命中时从数据库构建树', async () => {
      mockGetCache.mockReturnValueOnce(null);
      const permissions = [
        { id: 1, code: 'system', parent_id: null },
        { id: 2, code: 'system:user:read', parent_id: 1 },
        { id: 3, code: 'system:user:write', parent_id: 1 },
      ];
      mockAppQuery.mockResolvedValueOnce(mockQueryResult(permissions));

      const result = await getPermissionTree();

      expect(result).toHaveLength(1); // 1 个根节点
      expect(result[0].children).toHaveLength(2); // 2 个子节点
      expect(mockSetCache).toHaveBeenCalled();
    });
  });

  describe('getPermissionById', () => {
    it('找到时返回权限对象', async () => {
      const perm = { id: 1, code: 'system:user:read' };
      mockAppQuery.mockResolvedValueOnce(mockQueryResult([perm]));

      const result = await getPermissionById(1);

      expect(result).toEqual(perm);
    });

    it('未找到时返回 null', async () => {
      mockAppQuery.mockResolvedValueOnce(mockQueryResult([]));

      const result = await getPermissionById(999);

      expect(result).toBeNull();
    });
  });

  describe('createPermission', () => {
    it('创建权限并清除缓存', async () => {
      const newPerm = { id: 10, code: 'test:read', name: '测试读取' };
      mockAppQuery.mockResolvedValueOnce(mockQueryResult([newPerm]));

      const result = await createPermission({
        code: 'test:read',
        name: '测试读取',
        resource_type: 'api',
        resource_key: '/api/test',
        action: 'read',
      });

      expect(result).toEqual(newPerm);
      expect(mockInvalidate).toHaveBeenCalled();
    });
  });

  describe('updatePermission', () => {
    it('更新指定字段并清除缓存', async () => {
      const updated = { id: 1, name: '新名称' };
      mockAppQuery.mockResolvedValueOnce(mockQueryResult([updated]));

      const result = await updatePermission(1, { name: '新名称' } as any);

      expect(result).toEqual(updated);
      expect(mockInvalidate).toHaveBeenCalled();
    });

    it('无有效字段时返回当前数据', async () => {
      const perm = { id: 1, code: 'system:user:read' };
      mockAppQuery.mockResolvedValueOnce(mockQueryResult([perm]));

      const result = await updatePermission(1, {});

      expect(result).toEqual(perm);
      expect(mockInvalidate).not.toHaveBeenCalled();
    });
  });

  describe('deletePermission', () => {
    it('有子权限时抛出错误', async () => {
      mockAppQuery.mockResolvedValueOnce(mockQueryResult([{ count: '2' }]));

      await expect(deletePermission(1)).rejects.toThrow('存在子权限');
    });

    it('被角色使用时抛出错误', async () => {
      mockAppQuery
        .mockResolvedValueOnce(mockQueryResult([{ count: '0' }])) // 无子权限
        .mockResolvedValueOnce(mockQueryResult([{ role_name: '管理员' }])); // 被角色使用

      await expect(deletePermission(1)).rejects.toThrow('已被以下角色使用');
    });

    it('正常删除并清除缓存', async () => {
      mockAppQuery
        .mockResolvedValueOnce(mockQueryResult([{ count: '0' }])) // 无子权限
        .mockResolvedValueOnce(mockQueryResult([])) // 无角色使用
        .mockResolvedValueOnce(mockQueryResult([], 1)); // 删除成功

      const result = await deletePermission(1);

      expect(result).toBe(true);
      expect(mockInvalidate).toHaveBeenCalled();
    });
  });
});
