/**
 * 权限缓存管理服务单元测试
 */

jest.mock('../utils/logger', () => ({
  createLogger: () => ({ info: jest.fn(), error: jest.fn(), warn: jest.fn() }),
}));

jest.mock('../db/appPool', () => ({
  appQuery: jest.fn(),
}));

import { appQuery } from '../db/appPool';
import { mockQueryResult } from '../__tests__/helpers/mockDb';
import { cache } from '../utils/cache';
import {
  invalidateUserPermissionCache,
  invalidateRolePermissionCache,
  invalidateAllPermissionCache,
  invalidatePermissionTreeCache,
  getUserPermissionCache,
  setUserPermissionCache,
  getPermissionTreeCache,
  setPermissionTreeCache,
} from './permission-cache.service';

const mockAppQuery = appQuery as jest.MockedFunction<typeof appQuery>;

describe('permission-cache.service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // 清除所有缓存
    cache.invalidate('user_permissions');
    cache.invalidate('permission:tree:full');
  });

  describe('setUserPermissionCache / getUserPermissionCache', () => {
    it('设置和读取用户权限缓存', () => {
      const data = { roles: ['admin'], permissions: ['system:user:read'] };
      setUserPermissionCache(1, data);
      const result = getUserPermissionCache(1);

      expect(result).toEqual(data);
    });

    it('未缓存时返回 null', () => {
      expect(getUserPermissionCache(999)).toBeNull();
    });
  });

  describe('invalidateUserPermissionCache', () => {
    it('清除指定用户的权限缓存', () => {
      setUserPermissionCache(1, { roles: ['admin'], permissions: [] });
      expect(getUserPermissionCache(1)).not.toBeNull();

      invalidateUserPermissionCache(1);
      expect(getUserPermissionCache(1)).toBeNull();
    });
  });

  describe('invalidateRolePermissionCache', () => {
    it('清除角色下所有用户的权限缓存', async () => {
      // 设置两个用户的缓存
      setUserPermissionCache(10, { roles: ['manager'], permissions: [] });
      setUserPermissionCache(20, { roles: ['manager'], permissions: [] });

      mockAppQuery.mockResolvedValueOnce(
        mockQueryResult([{ user_id: 10 }, { user_id: 20 }])
      );

      await invalidateRolePermissionCache(5);

      expect(getUserPermissionCache(10)).toBeNull();
      expect(getUserPermissionCache(20)).toBeNull();
      expect(mockAppQuery).toHaveBeenCalledWith(
        expect.stringContaining('user_roles'),
        [5]
      );
    });

    it('角色下无用户时不报错', async () => {
      mockAppQuery.mockResolvedValueOnce(mockQueryResult([]));
      await expect(invalidateRolePermissionCache(999)).resolves.not.toThrow();
    });

    it('数据库查询失败时不抛异常', async () => {
      mockAppQuery.mockRejectedValueOnce(new Error('DB error'));
      await expect(invalidateRolePermissionCache(1)).resolves.not.toThrow();
    });
  });

  describe('invalidateAllPermissionCache', () => {
    it('清除所有用户的权限缓存', () => {
      setUserPermissionCache(1, { roles: [], permissions: [] });
      setUserPermissionCache(2, { roles: [], permissions: [] });

      invalidateAllPermissionCache();

      expect(getUserPermissionCache(1)).toBeNull();
      expect(getUserPermissionCache(2)).toBeNull();
    });
  });

  describe('setPermissionTreeCache / getPermissionTreeCache', () => {
    it('设置和读取权限树缓存', () => {
      const tree = [{ id: 1, code: 'system', children: [] }];
      setPermissionTreeCache(tree);
      expect(getPermissionTreeCache()).toEqual(tree);
    });

    it('未缓存时返回 null', () => {
      expect(getPermissionTreeCache()).toBeNull();
    });
  });

  describe('invalidatePermissionTreeCache', () => {
    it('清除权限树缓存', () => {
      setPermissionTreeCache([{ id: 1 }]);
      expect(getPermissionTreeCache()).not.toBeNull();

      invalidatePermissionTreeCache();
      expect(getPermissionTreeCache()).toBeNull();
    });
  });
});
