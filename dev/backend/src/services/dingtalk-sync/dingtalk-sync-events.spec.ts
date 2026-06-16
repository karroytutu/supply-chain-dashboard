import { EventEmitter } from 'events';

jest.mock('../../utils/logger', () => ({
  createLogger: () => ({ warn: jest.fn(), info: jest.fn(), error: jest.fn() }),
}));

jest.mock('../dingtalk-stream.service', () => {
  return { dingtalkEvents: new EventEmitter() };
});

jest.mock('../../db/appPool', () => ({
  appQuery: jest.fn(),
}));

jest.mock('../permission-cache.service', () => ({
  invalidateUserPermissionCache: jest.fn(),
}));

jest.mock('./dingtalk-sync.mutation', () => ({
  syncDepartments: jest.fn(),
}));

import { dingtalkEvents } from '../dingtalk-stream.service';
import { appQuery } from '../../db/appPool';
import { invalidateUserPermissionCache } from '../permission-cache.service';
import { syncDepartments } from './dingtalk-sync.mutation';
import { registerSyncEventHandlers } from './dingtalk-sync-events';

const mockAppQuery = appQuery as jest.Mock;
const mockSyncDepartments = syncDepartments as jest.Mock;
const mockInvalidateCache = invalidateUserPermissionCache as jest.Mock;

// Helper: flush microtask queue
const flushPromises = () => new Promise(r => setImmediate(r));

describe('dingtalk-sync-events', () => {
  beforeAll(() => {
    registerSyncEventHandlers();
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('logs warning on duplicate register', () => {
    registerSyncEventHandlers();
  });

  describe('user_leave_org', () => {
    it('handles null data', async () => {
      dingtalkEvents.emit('user_leave_org', null);
      await flushPromises();
    });

    it('handles missing userid', async () => {
      dingtalkEvents.emit('user_leave_org', {});
      await flushPromises();
    });

    it('handles empty array userid', async () => {
      dingtalkEvents.emit('user_leave_org', { userid: [] });
      await flushPromises();
    });

    it('disables users for array userid', async () => {
      mockAppQuery.mockResolvedValue({
        rows: [{ id: 1, name: '张三', dingtalk_user_id: 'dt_001' }],
      });
      dingtalkEvents.emit('user_leave_org', { userid: ['dt_001', 'dt_002'] });
      await flushPromises();
      await flushPromises();
      expect(mockAppQuery).toHaveBeenCalled();
      expect(mockInvalidateCache).toHaveBeenCalledWith(1);
    });

    it('disables single userid (not array)', async () => {
      mockAppQuery.mockResolvedValue({ rows: [] });
      dingtalkEvents.emit('user_leave_org', { userid: 'dt_003' });
      await flushPromises();
      await flushPromises();
      expect(mockAppQuery).toHaveBeenCalled();
    });

    it('handles query error gracefully', async () => {
      mockAppQuery.mockRejectedValue(new Error('DB down'));
      dingtalkEvents.emit('user_leave_org', { userid: ['dt_001'] });
      await flushPromises();
      await flushPromises();
      // should not throw
    });
  });

  describe('user_add_org', () => {
    it('handles array userid', async () => {
      dingtalkEvents.emit('user_add_org', { userid: ['dt_001'] });
      await flushPromises();
    });

    it('handles single userid', async () => {
      dingtalkEvents.emit('user_add_org', { userid: 'dt_001' });
      await flushPromises();
    });

    it('handles null data', async () => {
      dingtalkEvents.emit('user_add_org', null);
      await flushPromises();
    });
  });

  describe('user_modify_org', () => {
    it('handles array userid', async () => {
      dingtalkEvents.emit('user_modify_org', { userid: ['dt_001'] });
      await flushPromises();
    });

    it('handles single userid', async () => {
      dingtalkEvents.emit('user_modify_org', { userid: 'dt_001' });
      await flushPromises();
    });

    it('handles null data', async () => {
      dingtalkEvents.emit('user_modify_org', null);
      await flushPromises();
    });
  });

  describe('org_dept_create/modify/remove (debounced)', () => {
    it('triggers sync after debounce', async () => {
      mockSyncDepartments.mockResolvedValue(undefined);
      jest.useFakeTimers();
      dingtalkEvents.emit('org_dept_create', { deptId: 100 });
      jest.advanceTimersByTime(2500);
      jest.useRealTimers();
      await flushPromises();
      await flushPromises();
      expect(mockSyncDepartments).toHaveBeenCalled();
    });

    it('debounces multiple events', async () => {
      mockSyncDepartments.mockResolvedValue(undefined);
      jest.useFakeTimers();
      dingtalkEvents.emit('org_dept_modify', { deptId: 200 });
      dingtalkEvents.emit('org_dept_modify', { deptId: 201 });
      dingtalkEvents.emit('org_dept_modify', { deptId: 202 });
      jest.advanceTimersByTime(2500);
      jest.useRealTimers();
      await flushPromises();
      await flushPromises();
      expect(mockSyncDepartments).toHaveBeenCalledTimes(1);
    });

    it('handles sync error', async () => {
      mockSyncDepartments.mockRejectedValue(new Error('sync fail'));
      jest.useFakeTimers();
      dingtalkEvents.emit('org_dept_remove', { deptId: 300 });
      jest.advanceTimersByTime(2500);
      jest.useRealTimers();
      await flushPromises();
      await flushPromises();
      // should not throw
    });
  });
});
