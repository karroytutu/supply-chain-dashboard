jest.mock('../db/appPool', () => ({
  appQuery: jest.fn(),
  getAppClient: jest.fn(),
}));

jest.mock('./permission-cache.service', () => ({
  invalidateUserPermissionCache: jest.fn(),
}));

import { appQuery, getAppClient } from '../db/appPool';
import {
  getUserList,
  getUserById,
  updateUser,
  updateUserStatus,
  assignUserRoles,
  getUserLoginLogs,
  batchUpdateUserStatus,
  batchAssignUserRoles,
} from './user.service';
import { invalidateUserPermissionCache } from './permission-cache.service';

const mockAppQuery = appQuery as jest.Mock;
const mockGetClient = getAppClient as jest.Mock;

function mockClient() {
  const client: any = { query: jest.fn(), release: jest.fn() };
  mockGetClient.mockResolvedValue(client);
  return client;
}

describe('user.service', () => {
  beforeEach(() => jest.clearAllMocks());

  describe('getUserList', () => {
    it('returns users with roles', async () => {
      mockAppQuery
        .mockResolvedValueOnce({ rows: [{ count: '1' }] })
        .mockResolvedValueOnce({ rows: [{ id: 1, name: '张三' }] })
        .mockResolvedValueOnce({ rows: [{ user_id: 1, id: 10, code: 'admin', name: 'Admin' }] });
      const result = await getUserList({ page: 1, pageSize: 10 });
      expect(result.total).toBe(1);
      expect(result.list[0].roles).toHaveLength(1);
    });

    it('filters by keyword, status, and roleId', async () => {
      mockAppQuery
        .mockResolvedValueOnce({ rows: [{ count: '0' }] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] });
      await getUserList({ page: 1, pageSize: 10, keyword: 'test', status: 1, roleId: 5 });
      const sql = mockAppQuery.mock.calls[0][0];
      expect(sql).toContain('ILIKE');
      expect(sql).toContain('status');
      expect(sql).toContain('role_id');
    });
  });

  describe('getUserById', () => {
    it('returns user with roles', async () => {
      mockAppQuery
        .mockResolvedValueOnce({ rows: [{ id: 1, name: '张三' }] })
        .mockResolvedValueOnce({ rows: [{ id: 10, code: 'admin', name: 'Admin' }] });
      const user = await getUserById(1);
      expect(user).not.toBeNull();
      expect(user!.roles).toHaveLength(1);
    });

    it('returns null when not found', async () => {
      mockAppQuery.mockResolvedValue({ rows: [] });
      expect(await getUserById(999)).toBeNull();
    });
  });

  describe('updateUser', () => {
    it('updates user fields', async () => {
      mockAppQuery.mockResolvedValue({ rows: [{ id: 1, name: 'Updated' }] });
      const user = await updateUser(1, { name: 'Updated' });
      expect(user).not.toBeNull();
    });

    it('returns existing user when no fields to update', async () => {
      mockAppQuery
        .mockResolvedValueOnce({ rows: [{ id: 1, name: '张三' }] })
        .mockResolvedValueOnce({ rows: [] });
      const result = await updateUser(1, {});
      expect(result).not.toBeNull();
    });

    it('returns null when user not found', async () => {
      mockAppQuery.mockResolvedValue({ rows: [] });
      const result = await updateUser(999, { name: 'X' });
      expect(result).toBeNull();
    });
  });

  describe('updateUserStatus', () => {
    it('returns true when updated', async () => {
      mockAppQuery.mockResolvedValue({ rowCount: 1 });
      expect(await updateUserStatus(1, 0)).toBe(true);
    });

    it('returns false when not found', async () => {
      mockAppQuery.mockResolvedValue({ rowCount: 0 });
      expect(await updateUserStatus(999, 0)).toBe(false);
    });
  });

  describe('assignUserRoles', () => {
    it('assigns roles and clears cache', async () => {
      const client = mockClient();
      const result = await assignUserRoles(1, [10, 20]);
      expect(result).toBe(true);
      expect(client.query).toHaveBeenCalledWith('COMMIT');
      expect(invalidateUserPermissionCache).toHaveBeenCalledWith(1);
    });

    it('rolls back on error', async () => {
      const client = mockClient();
      client.query.mockImplementation((sql: string) => {
        if (sql === 'BEGIN') return Promise.resolve();
        throw new Error('fail');
      });
      await expect(assignUserRoles(1, [10])).rejects.toThrow('fail');
      expect(client.query).toHaveBeenCalledWith('ROLLBACK');
      expect(client.release).toHaveBeenCalled();
    });
  });

  describe('getUserLoginLogs', () => {
    it('returns paginated logs', async () => {
      mockAppQuery
        .mockResolvedValueOnce({ rows: [{ count: '5' }] })
        .mockResolvedValueOnce({ rows: [{ id: 1 }] });
      const result = await getUserLoginLogs(1, 1, 10);
      expect(result.total).toBe(5);
      expect(result.list).toHaveLength(1);
    });
  });

  describe('batchUpdateUserStatus', () => {
    it('returns count of updated users', async () => {
      mockAppQuery.mockResolvedValue({ rowCount: 3 });
      const count = await batchUpdateUserStatus([1, 2, 3], 0);
      expect(count).toBe(3);
    });
  });

  describe('batchAssignUserRoles', () => {
    it('assigns roles for multiple users', async () => {
      const client = mockClient();
      const result = await batchAssignUserRoles([1, 2], [10]);
      expect(result).toBe(true);
      expect(client.query).toHaveBeenCalledWith('COMMIT');
    });

    it('handles empty roleIds', async () => {
      const client = mockClient();
      const result = await batchAssignUserRoles([1], []);
      expect(result).toBe(true);
    });

    it('rolls back on error', async () => {
      const client = mockClient();
      client.query.mockImplementation((sql: string) => {
        if (sql === 'BEGIN') return Promise.resolve();
        throw new Error('fail');
      });
      await expect(batchAssignUserRoles([1], [10])).rejects.toThrow('fail');
      expect(client.query).toHaveBeenCalledWith('ROLLBACK');
    });
  });
});
