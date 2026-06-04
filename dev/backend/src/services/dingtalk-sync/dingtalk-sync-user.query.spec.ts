jest.mock('../../utils/logger', () => ({
  createLogger: () => ({ warn: jest.fn(), info: jest.fn(), error: jest.fn() }),
}));

jest.mock('../../db/appPool', () => ({
  appQuery: jest.fn(),
}));

jest.mock('../dingtalk.service', () => ({
  getAccessToken: jest.fn().mockResolvedValue('mock_token'),
  RETRYABLE_ERROR_CODES: [88001, 90002],
}));

jest.mock('https', () => ({
  request: jest.fn(),
}));

import { appQuery } from '../../db/appPool';
import {
  computeSyncHash,
  getAllLocalDingtalkUsers,
  fetchDingtalkUserDetail,
  fetchDingtalkUsersByDept,
} from './dingtalk-sync-user.query';

const mockAppQuery = appQuery as jest.Mock;

describe('dingtalk-sync-user.query', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('computeSyncHash', () => {
    it('returns md5 hash for user data', () => {
      const hash = computeSyncHash({
        userid: 'u1',
        unionid: 'un1',
        name: '张三',
        mobile: '13800138000',
        email: 'a@b.com',
        dept_id_list: [1, 2],
        title: '经理',
      });
      expect(hash).toMatch(/^[a-f0-9]{32}$/);
    });

    it('returns same hash for same data', () => {
      const user = { userid: 'u1', unionid: 'un1', name: '李四', dept_id_list: [1], mobile: '', email: '', title: '' };
      expect(computeSyncHash(user)).toBe(computeSyncHash(user));
    });

    it('returns different hash for different name', () => {
      const base = { userid: 'u1', unionid: 'un1', dept_id_list: [1], mobile: '', email: '', title: '' };
      expect(computeSyncHash({ ...base, name: 'A' })).not.toBe(computeSyncHash({ ...base, name: 'B' }));
    });

    it('sorts dept_id_list for consistent hashing', () => {
      const base = { userid: 'u1', unionid: 'un1', name: 'A', mobile: '', email: '', title: '' };
      expect(computeSyncHash({ ...base, dept_id_list: [2, 1] })).toBe(
        computeSyncHash({ ...base, dept_id_list: [1, 2] })
      );
    });

    it('handles missing optional fields', () => {
      const hash = computeSyncHash({
        userid: 'u1',
        unionid: 'un1',
        name: 'test',
        dept_id_list: [],
      });
      expect(hash).toMatch(/^[a-f0-9]{32}$/);
    });
  });

  describe('getAllLocalDingtalkUsers', () => {
    it('returns a map keyed by dingtalk_user_id', async () => {
      mockAppQuery.mockResolvedValue({
        rows: [
          { id: 1, dingtalk_user_id: 'dt_001', name: '张三' },
          { id: 2, dingtalk_user_id: 'dt_002', name: '李四' },
        ],
      });
      const map = await getAllLocalDingtalkUsers();
      expect(map.size).toBe(2);
      expect(map.get('dt_001')).toMatchObject({ id: 1, name: '张三' });
      expect(map.get('dt_002')).toMatchObject({ id: 2, name: '李四' });
    });

    it('returns empty map when no users', async () => {
      mockAppQuery.mockResolvedValue({ rows: [] });
      const map = await getAllLocalDingtalkUsers();
      expect(map.size).toBe(0);
    });
  });
});
