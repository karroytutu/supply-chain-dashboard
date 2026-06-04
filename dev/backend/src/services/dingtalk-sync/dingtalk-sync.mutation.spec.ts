/**
 * 钉钉同步变更模块测试
 */

jest.mock('../../utils/logger', () => ({
  createLogger: () => ({
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  }),
}));

jest.mock('../../utils/errorUtils', () => ({
  getErrorMessage: (e: any) => (e instanceof Error ? e.message : String(e)),
}));

jest.mock('../../db/appPool', () => ({
  getAppClient: jest.fn(),
}));

jest.mock('../permission-cache.service', () => ({
  invalidateUserPermissionCache: jest.fn(),
}));

jest.mock('./dingtalk-sync-dept.query', () => ({
  fetchDingtalkDeptTree: jest.fn(),
  getAllLocalDepts: jest.fn(),
}));

jest.mock('./dingtalk-sync-user.query', () => ({
  fetchDingtalkUsersByDept: jest.fn(),
  fetchDingtalkUserDetail: jest.fn(),
  getAllLocalDingtalkUsers: jest.fn(),
  computeSyncHash: jest.fn(),
}));

import { getAppClient } from '../../db/appPool';
import { invalidateUserPermissionCache } from '../permission-cache.service';
import { fetchDingtalkDeptTree, getAllLocalDepts } from './dingtalk-sync-dept.query';
import {
  fetchDingtalkUsersByDept,
  fetchDingtalkUserDetail,
  getAllLocalDingtalkUsers,
  computeSyncHash,
} from './dingtalk-sync-user.query';
import {
  syncDepartments,
  syncUsers,
  incrementalSyncUsers,
  syncUsersByDept,
} from './dingtalk-sync.mutation';

const mockGetAppClient = getAppClient as jest.MockedFunction<typeof getAppClient>;
const mockInvalidateCache = invalidateUserPermissionCache as jest.MockedFunction<typeof invalidateUserPermissionCache>;
const mockFetchDeptTree = fetchDingtalkDeptTree as jest.MockedFunction<typeof fetchDingtalkDeptTree>;
const mockGetAllLocalDepts = getAllLocalDepts as jest.MockedFunction<typeof getAllLocalDepts>;
const mockFetchUsersByDept = fetchDingtalkUsersByDept as jest.MockedFunction<typeof fetchDingtalkUsersByDept>;
const mockFetchUserDetail = fetchDingtalkUserDetail as jest.MockedFunction<typeof fetchDingtalkUserDetail>;
const mockGetAllLocalUsers = getAllLocalDingtalkUsers as jest.MockedFunction<typeof getAllLocalDingtalkUsers>;
const mockComputeHash = computeSyncHash as jest.MockedFunction<typeof computeSyncHash>;

/**
 * 创建模拟的数据库客户端
 */
function createMockClient() {
  const query = jest.fn().mockResolvedValue({ rows: [], rowCount: 0 });
  const release = jest.fn();
  return { query, release };
}

describe('dingtalk-sync.mutation', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('syncDepartments', () => {
    it('should create new departments when local has none', async () => {
      const mockClient = createMockClient();
      mockGetAppClient.mockResolvedValue(mockClient as any);
      mockFetchDeptTree.mockResolvedValue([
        { dept_id: 100, name: '技术部', parent_id: 1, auto_add_user: true },
        { dept_id: 200, name: '市场部', parent_id: 1, auto_add_user: false },
      ]);
      mockGetAllLocalDepts.mockResolvedValue(new Map());

      const result = await syncDepartments();

      expect(result.created).toBe(2);
      expect(result.updated).toBe(0);
      expect(result.total).toBe(2);
      expect(mockClient.query).toHaveBeenCalledWith('BEGIN');
      expect(mockClient.query).toHaveBeenCalledWith('COMMIT');
      expect(mockClient.release).toHaveBeenCalled();
    });

    it('should update departments when name or parent changed', async () => {
      const mockClient = createMockClient();
      mockGetAppClient.mockResolvedValue(mockClient as any);
      mockFetchDeptTree.mockResolvedValue([
        { dept_id: 100, name: '技术部-新', parent_id: 1, auto_add_user: true },
      ]);

      const localMap = new Map();
      localMap.set('100', { id: 1, name: '技术部', parent_id: '1' });
      mockGetAllLocalDepts.mockResolvedValue(localMap);

      const result = await syncDepartments();

      expect(result.created).toBe(0);
      expect(result.updated).toBe(1);
      expect(result.total).toBe(1);
    });

    it('should skip unchanged departments', async () => {
      const mockClient = createMockClient();
      mockGetAppClient.mockResolvedValue(mockClient as any);
      mockFetchDeptTree.mockResolvedValue([
        { dept_id: 100, name: '技术部', parent_id: 1, auto_add_user: true },
      ]);

      const localMap = new Map();
      localMap.set('100', { id: 1, name: '技术部', parent_id: '1' });
      mockGetAllLocalDepts.mockResolvedValue(localMap);

      const result = await syncDepartments();

      expect(result.created).toBe(0);
      expect(result.updated).toBe(0);
      expect(result.total).toBe(1);
    });

    it('should rollback and throw on database error', async () => {
      const mockClient = createMockClient();
      mockGetAppClient.mockResolvedValue(mockClient as any);
      mockFetchDeptTree.mockResolvedValue([
        { dept_id: 100, name: '技术部', parent_id: 1, auto_add_user: true },
      ]);
      mockGetAllLocalDepts.mockResolvedValue(new Map());

      // BEGIN succeeds, but INSERT fails
      mockClient.query
        .mockResolvedValueOnce({ rows: [], rowCount: 0 }) // BEGIN
        .mockRejectedValueOnce(new Error('DB connection lost')); // INSERT fails

      await expect(syncDepartments()).rejects.toThrow('DB connection lost');
      expect(mockClient.query).toHaveBeenCalledWith('ROLLBACK');
      expect(mockClient.release).toHaveBeenCalled();
    });

    it('should release client even on success', async () => {
      const mockClient = createMockClient();
      mockGetAppClient.mockResolvedValue(mockClient as any);
      mockFetchDeptTree.mockResolvedValue([]);
      mockGetAllLocalDepts.mockResolvedValue(new Map());

      await syncDepartments();

      expect(mockClient.release).toHaveBeenCalled();
    });
  });

  describe('syncUsers', () => {
    it('should create new users when they do not exist locally', async () => {
      const mockClient = createMockClient();
      mockGetAppClient.mockResolvedValue(mockClient as any);

      // syncDepartments mocks
      mockFetchDeptTree.mockResolvedValue([]);
      mockGetAllLocalDepts.mockResolvedValue(new Map([
        ['100', { id: 1, name: '技术部', parent_id: null }],
      ]));

      // syncUsers mocks
      mockGetAllLocalUsers.mockResolvedValue(new Map());
      mockFetchUsersByDept.mockResolvedValue([{ userid: 'user1', name: '张三' }]);
      mockFetchUserDetail.mockResolvedValue({
        userid: 'user1', unionid: 'u1', name: '张三',
        avatar: '', mobile: '13800000000', email: 'z@test.com',
        dept_id_list: [100], title: '工程师',
      });
      mockComputeHash.mockReturnValue('hash1');

      // createNewUser queries: BEGIN, INSERT RETURNING, SELECT role, INSERT role, DELETE user_depts, INSERT user_dept, COMMIT
      mockClient.query
        .mockResolvedValueOnce({ rows: [], rowCount: 0 })      // BEGIN (syncDepartments)
        .mockResolvedValueOnce({ rows: [], rowCount: 0 })      // COMMIT (syncDepartments - no depts to sync)
        .mockResolvedValueOnce({ rows: [], rowCount: 0 })      // BEGIN (createNewUser)
        .mockResolvedValueOnce({ rows: [{ id: 42 }], rowCount: 1 }) // INSERT user RETURNING id
        .mockResolvedValueOnce({ rows: [{ id: 5 }], rowCount: 1 })  // SELECT viewer role
        .mockResolvedValueOnce({ rows: [], rowCount: 0 })      // INSERT user_roles
        .mockResolvedValueOnce({ rows: [], rowCount: 0 })      // DELETE user_departments
        .mockResolvedValueOnce({ rows: [], rowCount: 0 })      // INSERT user_departments
        .mockResolvedValueOnce({ rows: [], rowCount: 0 });     // COMMIT

      const result = await syncUsers();

      expect(result.created).toBe(1);
      expect(result.updated).toBe(0);
      expect(result.errors).toBe(0);
    });

    it('should update users when hash differs', async () => {
      const mockClient = createMockClient();
      mockGetAppClient.mockResolvedValue(mockClient as any);

      mockFetchDeptTree.mockResolvedValue([]);
      mockGetAllLocalDepts.mockResolvedValue(new Map([
        ['100', { id: 1, name: '技术部', parent_id: null }],
      ]));

      const localUser = {
        id: 10, dingtalk_user_id: 'user1', dingtalk_union_id: 'u1',
        name: '张三', avatar: '', mobile: '13800000000', email: 'z@test.com',
        department_id: '100', department_name: '技术部', position: '',
        status: 1, dingtalk_last_synced_at: '2026-01-01', dingtalk_sync_hash: 'old_hash',
        department_ids: '100',
      };
      mockGetAllLocalUsers.mockResolvedValue(new Map([['user1', localUser]]));
      mockFetchUsersByDept.mockResolvedValue([{ userid: 'user1', name: '张三' }]);
      mockFetchUserDetail.mockResolvedValue({
        userid: 'user1', unionid: 'u1', name: '张三丰',
        avatar: '', mobile: '13800000000', email: 'z@test.com',
        dept_id_list: [100], title: '高级工程师',
      });
      mockComputeHash.mockReturnValue('new_hash');

      // syncDepartments: BEGIN, COMMIT
      // updateExistingUser: BEGIN, UPDATE, DELETE user_depts, INSERT user_dept, COMMIT
      mockClient.query
        .mockResolvedValueOnce({ rows: [], rowCount: 0 })      // BEGIN (syncDepartments)
        .mockResolvedValueOnce({ rows: [], rowCount: 0 })      // COMMIT (syncDepartments)
        .mockResolvedValueOnce({ rows: [], rowCount: 0 })      // BEGIN (updateExistingUser)
        .mockResolvedValueOnce({ rows: [], rowCount: 1 })      // UPDATE users
        .mockResolvedValueOnce({ rows: [], rowCount: 0 })      // DELETE user_departments
        .mockResolvedValueOnce({ rows: [], rowCount: 0 })      // INSERT user_departments
        .mockResolvedValueOnce({ rows: [], rowCount: 0 });     // COMMIT

      const result = await syncUsers();

      expect(result.created).toBe(0);
      expect(result.updated).toBe(1);
      expect(mockInvalidateCache).toHaveBeenCalledWith(10);
    });

    it('should skip users when hash matches (unchanged)', async () => {
      const mockClient = createMockClient();
      mockGetAppClient.mockResolvedValue(mockClient as any);

      mockFetchDeptTree.mockResolvedValue([]);
      mockGetAllLocalDepts.mockResolvedValue(new Map([
        ['100', { id: 1, name: '技术部', parent_id: null }],
      ]));

      const localUser = {
        id: 10, dingtalk_user_id: 'user1', dingtalk_union_id: 'u1',
        name: '张三', avatar: '', mobile: '138', email: '',
        department_id: '100', department_name: '技术部', position: '',
        status: 1, dingtalk_last_synced_at: '2026-01-01', dingtalk_sync_hash: 'same_hash',
        department_ids: '100',
      };
      mockGetAllLocalUsers.mockResolvedValue(new Map([['user1', localUser]]));
      mockFetchUsersByDept.mockResolvedValue([{ userid: 'user1', name: '张三' }]);
      mockFetchUserDetail.mockResolvedValue({
        userid: 'user1', unionid: 'u1', name: '张三',
        avatar: '', mobile: '138', email: '',
        dept_id_list: [100], title: '',
      });
      mockComputeHash.mockReturnValue('same_hash');

      // syncDepartments: BEGIN, COMMIT
      // updateSyncTimestamp: UPDATE (standalone client)
      const tsClient = createMockClient();
      mockGetAppClient
        .mockResolvedValueOnce(mockClient as any)  // syncDepartments
        .mockResolvedValueOnce(tsClient as any);   // updateSyncTimestamp

      mockClient.query
        .mockResolvedValueOnce({ rows: [], rowCount: 0 })  // BEGIN
        .mockResolvedValueOnce({ rows: [], rowCount: 0 }); // COMMIT

      tsClient.query.mockResolvedValue({ rows: [], rowCount: 1 }); // UPDATE timestamp

      const result = await syncUsers();

      expect(result.unchanged).toBe(1);
      expect(result.created).toBe(0);
      expect(result.updated).toBe(0);
    });

    it('should count errors when user detail fetch fails', async () => {
      const mockClient = createMockClient();
      mockGetAppClient.mockResolvedValue(mockClient as any);

      mockFetchDeptTree.mockResolvedValue([]);
      mockGetAllLocalDepts.mockResolvedValue(new Map([
        ['100', { id: 1, name: '技术部', parent_id: null }],
      ]));
      mockGetAllLocalUsers.mockResolvedValue(new Map());
      mockFetchUsersByDept.mockResolvedValue([{ userid: 'user1', name: '张三' }]);
      mockFetchUserDetail.mockResolvedValue(null);

      mockClient.query
        .mockResolvedValueOnce({ rows: [], rowCount: 0 })  // BEGIN (syncDepartments)
        .mockResolvedValueOnce({ rows: [], rowCount: 0 }); // COMMIT (syncDepartments)

      const result = await syncUsers();

      expect(result.errors).toBe(1);
      expect(result.created).toBe(0);
    });
  });

  describe('incrementalSyncUsers', () => {
    it('should skip users synced recently with valid hash', async () => {
      const mockClient = createMockClient();
      mockGetAppClient.mockResolvedValue(mockClient as any);

      mockFetchDeptTree.mockResolvedValue([]);
      mockGetAllLocalDepts.mockResolvedValue(new Map([
        ['100', { id: 1, name: '技术部', parent_id: null }],
      ]));

      const recentDate = new Date().toISOString();
      const localUser = {
        id: 10, dingtalk_user_id: 'user1', dingtalk_union_id: 'u1',
        name: '张三', avatar: '', mobile: '138', email: '',
        department_id: '100', department_name: '技术部', position: '',
        status: 1, dingtalk_last_synced_at: recentDate, dingtalk_sync_hash: 'valid_hash',
        department_ids: '100',
      };
      mockGetAllLocalUsers.mockResolvedValue(new Map([['user1', localUser]]));
      mockFetchUsersByDept.mockResolvedValue([{ userid: 'user1', name: '张三' }]);

      mockClient.query
        .mockResolvedValueOnce({ rows: [], rowCount: 0 })  // BEGIN (syncDepartments)
        .mockResolvedValueOnce({ rows: [], rowCount: 0 }); // COMMIT (syncDepartments)

      const result = await incrementalSyncUsers();

      expect(result.unchanged).toBe(1);
      expect(mockFetchUserDetail).not.toHaveBeenCalled();
    });

    it('should fetch detail for users with missing hash', async () => {
      const mockClient = createMockClient();
      mockGetAppClient.mockResolvedValue(mockClient as any);

      mockFetchDeptTree.mockResolvedValue([]);
      mockGetAllLocalDepts.mockResolvedValue(new Map([
        ['100', { id: 1, name: '技术部', parent_id: null }],
      ]));

      const localUser = {
        id: 10, dingtalk_user_id: 'user1', dingtalk_union_id: 'u1',
        name: '张三', avatar: '', mobile: '138', email: '',
        department_id: '100', department_name: '技术部', position: '',
        status: 1, dingtalk_last_synced_at: new Date().toISOString(),
        dingtalk_sync_hash: null, // missing hash
        department_ids: '100',
      };
      mockGetAllLocalUsers.mockResolvedValue(new Map([['user1', localUser]]));
      mockFetchUsersByDept.mockResolvedValue([{ userid: 'user1', name: '张三' }]);
      mockFetchUserDetail.mockResolvedValue({
        userid: 'user1', unionid: 'u1', name: '张三',
        avatar: '', mobile: '138', email: '',
        dept_id_list: [100], title: '',
      });
      mockComputeHash.mockReturnValue('new_hash');

      // syncDepartments: BEGIN, COMMIT
      // updateExistingUser: BEGIN, UPDATE, DELETE, INSERT, COMMIT
      mockClient.query
        .mockResolvedValueOnce({ rows: [], rowCount: 0 })   // BEGIN (syncDepartments)
        .mockResolvedValueOnce({ rows: [], rowCount: 0 })   // COMMIT (syncDepartments)
        .mockResolvedValueOnce({ rows: [], rowCount: 0 })   // BEGIN (updateExistingUser)
        .mockResolvedValueOnce({ rows: [], rowCount: 1 })   // UPDATE users
        .mockResolvedValueOnce({ rows: [], rowCount: 0 })   // DELETE user_departments
        .mockResolvedValueOnce({ rows: [], rowCount: 0 })   // INSERT user_departments
        .mockResolvedValueOnce({ rows: [], rowCount: 0 });  // COMMIT

      const result = await incrementalSyncUsers();

      expect(result.updated).toBe(1);
      expect(mockFetchUserDetail).toHaveBeenCalledWith('user1');
    });

    it('should fetch detail for users not synced in 7+ days', async () => {
      const mockClient = createMockClient();
      mockGetAppClient.mockResolvedValue(mockClient as any);

      mockFetchDeptTree.mockResolvedValue([]);
      mockGetAllLocalDepts.mockResolvedValue(new Map([
        ['100', { id: 1, name: '技术部', parent_id: null }],
      ]));

      const oldDate = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000).toISOString();
      const localUser = {
        id: 10, dingtalk_user_id: 'user1', dingtalk_union_id: 'u1',
        name: '张三', avatar: '', mobile: '138', email: '',
        department_id: '100', department_name: '技术部', position: '',
        status: 1, dingtalk_last_synced_at: oldDate, dingtalk_sync_hash: 'old_hash',
        department_ids: '100',
      };
      mockGetAllLocalUsers.mockResolvedValue(new Map([['user1', localUser]]));
      mockFetchUsersByDept.mockResolvedValue([{ userid: 'user1', name: '张三' }]);
      mockFetchUserDetail.mockResolvedValue({
        userid: 'user1', unionid: 'u1', name: '张三',
        avatar: '', mobile: '138', email: '',
        dept_id_list: [100], title: '',
      });
      mockComputeHash.mockReturnValue('old_hash'); // same hash

      // syncDepartments: BEGIN, COMMIT
      // updateSyncTimestamp: standalone client
      const tsClient = createMockClient();
      mockGetAppClient
        .mockResolvedValueOnce(mockClient as any)   // syncDepartments
        .mockResolvedValueOnce(tsClient as any);    // updateSyncTimestamp

      mockClient.query
        .mockResolvedValueOnce({ rows: [], rowCount: 0 })   // BEGIN
        .mockResolvedValueOnce({ rows: [], rowCount: 0 });  // COMMIT

      tsClient.query.mockResolvedValue({ rows: [], rowCount: 1 });

      const result = await incrementalSyncUsers();

      // hash matches after fetch -> unchanged
      expect(result.unchanged).toBe(1);
      expect(mockFetchUserDetail).toHaveBeenCalledWith('user1');
    });

    it('should create new users not found locally', async () => {
      const mockClient = createMockClient();
      mockGetAppClient.mockResolvedValue(mockClient as any);

      mockFetchDeptTree.mockResolvedValue([]);
      mockGetAllLocalDepts.mockResolvedValue(new Map([
        ['100', { id: 1, name: '技术部', parent_id: null }],
      ]));
      mockGetAllLocalUsers.mockResolvedValue(new Map());
      mockFetchUsersByDept.mockResolvedValue([{ userid: 'newuser', name: '新人' }]);
      mockFetchUserDetail.mockResolvedValue({
        userid: 'newuser', unionid: 'nu1', name: '新人',
        avatar: '', mobile: '', email: '',
        dept_id_list: [100], title: '',
      });
      mockComputeHash.mockReturnValue('hash_new');

      // syncDepartments: BEGIN, COMMIT
      // createNewUser: BEGIN, INSERT RETURNING, SELECT role, INSERT role, DELETE, INSERT dept, COMMIT
      mockClient.query
        .mockResolvedValueOnce({ rows: [], rowCount: 0 })         // BEGIN (syncDepartments)
        .mockResolvedValueOnce({ rows: [], rowCount: 0 })         // COMMIT (syncDepartments)
        .mockResolvedValueOnce({ rows: [], rowCount: 0 })         // BEGIN (createNewUser)
        .mockResolvedValueOnce({ rows: [{ id: 99 }], rowCount: 1 }) // INSERT user
        .mockResolvedValueOnce({ rows: [{ id: 5 }], rowCount: 1 }) // SELECT viewer role
        .mockResolvedValueOnce({ rows: [], rowCount: 0 })         // INSERT user_roles
        .mockResolvedValueOnce({ rows: [], rowCount: 0 })         // DELETE user_departments
        .mockResolvedValueOnce({ rows: [], rowCount: 0 })         // INSERT user_departments
        .mockResolvedValueOnce({ rows: [], rowCount: 0 });        // COMMIT

      const result = await incrementalSyncUsers();

      expect(result.created).toBe(1);
    });
  });

  describe('syncUsersByDept', () => {
    it('should sync users for a specific department', async () => {
      const mockClient = createMockClient();
      mockGetAppClient.mockResolvedValue(mockClient as any);

      mockGetAllLocalDepts.mockResolvedValue(new Map([
        ['100', { id: 1, name: '技术部', parent_id: null }],
      ]));
      mockGetAllLocalUsers.mockResolvedValue(new Map());
      mockFetchUsersByDept.mockResolvedValue([
        { userid: 'u1', name: '用户1' },
        { userid: 'u2', name: '用户2' },
      ]);
      mockFetchUserDetail.mockResolvedValue({
        userid: 'u1', unionid: 'uid1', name: '用户1',
        avatar: '', mobile: '', email: '',
        dept_id_list: [100], title: '',
      });
      mockComputeHash.mockReturnValue('h1');

      // 2 users, first creates successfully; second also creates
      // createNewUser for u1: BEGIN, INSERT, SELECT role, INSERT role, DELETE, INSERT dept, COMMIT
      // createNewUser for u2: same pattern
      mockClient.query
        // u1 createNewUser
        .mockResolvedValueOnce({ rows: [], rowCount: 0 })         // BEGIN
        .mockResolvedValueOnce({ rows: [{ id: 1 }], rowCount: 1 }) // INSERT user
        .mockResolvedValueOnce({ rows: [{ id: 5 }], rowCount: 1 }) // SELECT role
        .mockResolvedValueOnce({ rows: [], rowCount: 0 })         // INSERT role
        .mockResolvedValueOnce({ rows: [], rowCount: 0 })         // DELETE user_depts
        .mockResolvedValueOnce({ rows: [], rowCount: 0 })         // INSERT user_depts
        .mockResolvedValueOnce({ rows: [], rowCount: 0 })         // COMMIT
        // u2 createNewUser
        .mockResolvedValueOnce({ rows: [], rowCount: 0 })         // BEGIN
        .mockResolvedValueOnce({ rows: [{ id: 2 }], rowCount: 1 }) // INSERT user
        .mockResolvedValueOnce({ rows: [{ id: 5 }], rowCount: 1 }) // SELECT role
        .mockResolvedValueOnce({ rows: [], rowCount: 0 })         // INSERT role
        .mockResolvedValueOnce({ rows: [], rowCount: 0 })         // DELETE user_depts
        .mockResolvedValueOnce({ rows: [], rowCount: 0 })         // INSERT user_depts
        .mockResolvedValueOnce({ rows: [], rowCount: 0 });        // COMMIT

      const result = await syncUsersByDept('100');

      expect(result.created).toBe(2);
      expect(mockFetchUsersByDept).toHaveBeenCalledWith(100);
    });

    it('should handle user detail fetch errors gracefully', async () => {
      const mockClient = createMockClient();
      mockGetAppClient.mockResolvedValue(mockClient as any);

      mockGetAllLocalDepts.mockResolvedValue(new Map());
      mockGetAllLocalUsers.mockResolvedValue(new Map());
      mockFetchUsersByDept.mockResolvedValue([{ userid: 'u1', name: '用户1' }]);
      mockFetchUserDetail.mockResolvedValue(null); // returns null = error

      const result = await syncUsersByDept('100');

      expect(result.errors).toBe(1);
      expect(result.created).toBe(0);
    });

    it('should skip unchanged users in dept sync', async () => {
      const mockClient = createMockClient();
      mockGetAppClient.mockResolvedValue(mockClient as any);

      mockGetAllLocalDepts.mockResolvedValue(new Map([
        ['100', { id: 1, name: '技术部', parent_id: null }],
      ]));

      const localUser = {
        id: 10, dingtalk_user_id: 'u1', dingtalk_union_id: 'uid1',
        name: '用户1', avatar: '', mobile: '', email: '',
        department_id: '100', department_name: '技术部', position: '',
        status: 1, dingtalk_last_synced_at: '2026-01-01', dingtalk_sync_hash: 'h1',
        department_ids: '100',
      };
      mockGetAllLocalUsers.mockResolvedValue(new Map([['u1', localUser]]));
      mockFetchUsersByDept.mockResolvedValue([{ userid: 'u1', name: '用户1' }]);
      mockFetchUserDetail.mockResolvedValue({
        userid: 'u1', unionid: 'uid1', name: '用户1',
        avatar: '', mobile: '', email: '',
        dept_id_list: [100], title: '',
      });
      mockComputeHash.mockReturnValue('h1');

      const tsClient = createMockClient();
      mockGetAppClient
        .mockResolvedValueOnce(mockClient as any)   // will not be used for dept sync itself
        .mockResolvedValueOnce(tsClient as any);    // updateSyncTimestamp

      tsClient.query.mockResolvedValue({ rows: [], rowCount: 1 });

      const result = await syncUsersByDept('100');

      expect(result.unchanged).toBe(1);
      expect(result.created).toBe(0);
      expect(result.updated).toBe(0);
    });
  });
});
