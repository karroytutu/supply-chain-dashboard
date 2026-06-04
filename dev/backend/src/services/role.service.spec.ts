jest.mock('../db/appPool', () => ({
  appQuery: jest.fn(),
  getAppClient: jest.fn(),
}));

jest.mock('./permission-cache.service', () => ({
  invalidateRolePermissionCache: jest.fn(),
  invalidateUserPermissionCache: jest.fn(),
}));

import { appQuery, getAppClient } from '../db/appPool';
import {
  getRoleList,
  getAllRoles,
  getRoleById,
  createRole,
  updateRole,
  deleteRole,
  assignRolePermissions,
} from './role.service';
import { invalidateRolePermissionCache } from './permission-cache.service';

const mockAppQuery = appQuery as jest.Mock;
const mockGetClient = getAppClient as jest.Mock;

function mockClient() {
  const client: any = { query: jest.fn(), release: jest.fn() };
  mockGetClient.mockResolvedValue(client);
  return client;
}

describe('role.service', () => {
  beforeEach(() => jest.clearAllMocks());

  describe('getRoleList', () => {
    it('returns roles with permissions', async () => {
      mockAppQuery
        .mockResolvedValueOnce({ rows: [{ count: '1' }] })
        .mockResolvedValueOnce({ rows: [{ id: 1, name: 'Admin', code: 'admin' }] })
        .mockResolvedValueOnce({ rows: [{ role_id: 1, id: 10, code: 'read', name: 'Read' }] });
      const result = await getRoleList({ page: 1, pageSize: 10 });
      expect(result.total).toBe(1);
      expect(result.list[0].permissions).toHaveLength(1);
    });

    it('handles keyword and status filter', async () => {
      mockAppQuery
        .mockResolvedValueOnce({ rows: [{ count: '0' }] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] });
      await getRoleList({ page: 1, pageSize: 10, keyword: 'admin', status: 1 });
      const sql = mockAppQuery.mock.calls[0][0];
      expect(sql).toContain('ILIKE');
      expect(sql).toContain('status');
    });
  });

  describe('getAllRoles', () => {
    it('returns active roles', async () => {
      mockAppQuery.mockResolvedValue({ rows: [{ id: 1, name: 'Admin' }] });
      const roles = await getAllRoles();
      expect(roles).toHaveLength(1);
    });
  });

  describe('getRoleById', () => {
    it('returns role with permissions', async () => {
      mockAppQuery
        .mockResolvedValueOnce({ rows: [{ id: 1, name: 'Admin' }] })
        .mockResolvedValueOnce({ rows: [{ id: 10, code: 'read', name: 'Read' }] });
      const role = await getRoleById(1);
      expect(role).not.toBeNull();
      expect(role!.permissions).toHaveLength(1);
    });

    it('returns null when not found', async () => {
      mockAppQuery.mockResolvedValue({ rows: [] });
      expect(await getRoleById(999)).toBeNull();
    });
  });

  describe('createRole', () => {
    it('creates and returns role', async () => {
      mockAppQuery.mockResolvedValue({ rows: [{ id: 2, code: 'new', name: 'New' }] });
      const role = await createRole({ code: 'new', name: 'New' });
      expect(role.id).toBe(2);
    });
  });

  describe('updateRole', () => {
    it('returns null when role not found', async () => {
      mockAppQuery.mockResolvedValue({ rows: [] });
      expect(await updateRole(999, { name: 'X' })).toBeNull();
    });

    it('updates non-system role name', async () => {
      mockAppQuery
        .mockResolvedValueOnce({ rows: [{ is_system: false }] })
        .mockResolvedValueOnce({ rows: [{ id: 1, name: 'Updated' }] });
      const role = await updateRole(1, { name: 'Updated' });
      expect(role).not.toBeNull();
    });

    it('limits system role to description only', async () => {
      mockAppQuery
        .mockResolvedValueOnce({ rows: [{ is_system: true }] })
        .mockResolvedValueOnce({ rows: [{ id: 1, description: 'Updated desc' }] });
      const role = await updateRole(1, { name: 'ignored', description: 'Updated desc' });
      expect(role).not.toBeNull();
      const updateSql = mockAppQuery.mock.calls[1][0];
      expect(updateSql).toContain('description');
      expect(updateSql).not.toContain('name');
    });

    it('returns existing role when no fields to update', async () => {
      mockAppQuery
        .mockResolvedValueOnce({ rows: [{ is_system: false }] })
        .mockResolvedValueOnce({ rows: [{ id: 1, name: 'Admin' }] })
        .mockResolvedValueOnce({ rows: [] });
      const result = await updateRole(1, {});
      // calls getRoleById
      expect(result).not.toBeNull();
    });
  });

  describe('deleteRole', () => {
    it('returns false when role not found', async () => {
      mockAppQuery.mockResolvedValue({ rows: [] });
      expect(await deleteRole(999)).toBe(false);
    });

    it('throws for system role', async () => {
      mockAppQuery.mockResolvedValue({ rows: [{ is_system: true }] });
      await expect(deleteRole(1)).rejects.toThrow('系统角色不能删除');
    });

    it('deletes role and clears cache', async () => {
      mockAppQuery.mockResolvedValue({ rows: [{ is_system: false }] });
      const client = mockClient();
      (invalidateRolePermissionCache as jest.Mock).mockResolvedValue(undefined);
      const result = await deleteRole(1);
      expect(result).toBe(true);
      expect(client.query).toHaveBeenCalledWith('COMMIT');
      expect(client.release).toHaveBeenCalled();
    });

    it('rolls back on error', async () => {
      mockAppQuery.mockResolvedValue({ rows: [{ is_system: false }] });
      const client = mockClient();
      client.query.mockImplementation((sql: string) => {
        if (sql === 'BEGIN') return Promise.resolve();
        if (sql === 'DELETE FROM role_permissions WHERE role_id = $1') throw new Error('fail');
        return Promise.resolve();
      });
      await expect(deleteRole(1)).rejects.toThrow('fail');
      expect(client.query).toHaveBeenCalledWith('ROLLBACK');
      expect(client.release).toHaveBeenCalled();
    });
  });

  describe('assignRolePermissions', () => {
    it('throws for invalid permission ids', async () => {
      mockAppQuery.mockResolvedValue({ rows: [{ id: 1 }] });
      await expect(assignRolePermissions(1, [1, 999])).rejects.toThrow('不存在');
    });

    it('assigns permissions and clears cache', async () => {
      mockAppQuery.mockResolvedValue({ rows: [{ id: 1 }, { id: 2 }] });
      const client = mockClient();
      (invalidateRolePermissionCache as jest.Mock).mockResolvedValue(undefined);
      const result = await assignRolePermissions(1, [1, 2]);
      expect(result).toBe(true);
      expect(client.query).toHaveBeenCalledWith('COMMIT');
    });

    it('handles empty permission list', async () => {
      const client = mockClient();
      (invalidateRolePermissionCache as jest.Mock).mockResolvedValue(undefined);
      const result = await assignRolePermissions(1, []);
      expect(result).toBe(true);
    });
  });
});
