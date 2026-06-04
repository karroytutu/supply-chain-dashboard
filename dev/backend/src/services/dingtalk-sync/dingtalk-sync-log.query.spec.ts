jest.mock('../../db/appPool', () => ({
  appQuery: jest.fn(),
}));

import { appQuery } from '../../db/appPool';
import {
  createSyncLog,
  updateSyncLog,
  getSyncLogs,
  getSyncLogById,
  hasRunningSync,
  getLatestCompletedSync,
  getSyncStatus,
} from './dingtalk-sync-log.query';

const mockAppQuery = appQuery as jest.Mock;

describe('dingtalk-sync-log.query', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('createSyncLog', () => {
    it('creates a sync log and returns id', async () => {
      mockAppQuery.mockResolvedValue({ rows: [{ id: 42 }] });
      const id = await createSyncLog({ sync_type: 'full', trigger_type: 'manual', triggered_by: 1 });
      expect(id).toBe(42);
      expect(mockAppQuery).toHaveBeenCalled();
    });

    it('handles null triggered_by', async () => {
      mockAppQuery.mockResolvedValue({ rows: [{ id: 43 }] });
      const id = await createSyncLog({ sync_type: 'incremental', trigger_type: 'scheduled' });
      expect(id).toBe(43);
    });
  });

  describe('updateSyncLog', () => {
    it('updates with provided fields', async () => {
      mockAppQuery.mockResolvedValue({ rows: [] });
      await updateSyncLog(1, { status: 'completed', users_created: 5 });
      expect(mockAppQuery).toHaveBeenCalled();
      const sql = mockAppQuery.mock.calls[0][0];
      expect(sql).toContain('status = $1');
      expect(sql).toContain('users_created = $2');
    });

    it('skips update when no fields provided', async () => {
      await updateSyncLog(1, {});
      expect(mockAppQuery).not.toHaveBeenCalled();
    });
  });

  describe('getSyncLogs', () => {
    it('returns paginated logs without filters', async () => {
      mockAppQuery
        .mockResolvedValueOnce({ rows: [{ total: '10' }] })
        .mockResolvedValueOnce({ rows: [{ id: 1 }] });
      const result = await getSyncLogs({ page: 1, pageSize: 10 });
      expect(result.total).toBe(10);
      expect(result.list).toHaveLength(1);
    });

    it('filters by status and sync_type', async () => {
      mockAppQuery
        .mockResolvedValueOnce({ rows: [{ total: '5' }] })
        .mockResolvedValueOnce({ rows: [] });
      await getSyncLogs({ page: 1, pageSize: 10, status: 'completed', sync_type: 'full' });
      const sql = mockAppQuery.mock.calls[0][0];
      expect(sql).toContain('status = $1');
      expect(sql).toContain('sync_type = $2');
    });
  });

  describe('getSyncLogById', () => {
    it('returns log when found', async () => {
      mockAppQuery.mockResolvedValue({ rows: [{ id: 1, status: 'completed' }] });
      const log = await getSyncLogById(1);
      expect(log).toMatchObject({ id: 1 });
    });

    it('returns null when not found', async () => {
      mockAppQuery.mockResolvedValue({ rows: [] });
      const log = await getSyncLogById(999);
      expect(log).toBeNull();
    });
  });

  describe('hasRunningSync', () => {
    it('returns running=false when no running tasks', async () => {
      mockAppQuery.mockResolvedValue({ rows: [] });
      const result = await hasRunningSync();
      expect(result).toEqual({ running: false });
    });

    it('returns running=true for recent running task', async () => {
      mockAppQuery.mockResolvedValue({
        rows: [{ id: 10, started_at: new Date().toISOString() }],
      });
      const result = await hasRunningSync();
      expect(result).toEqual({ running: true });
    });

    it('returns stuckLogId for task running > 30 min', async () => {
      const thirtyOneMinAgo = new Date(Date.now() - 31 * 60 * 1000).toISOString();
      mockAppQuery.mockResolvedValue({
        rows: [{ id: 11, started_at: thirtyOneMinAgo }],
      });
      const result = await hasRunningSync();
      expect(result.running).toBe(true);
      expect(result.stuckLogId).toBe(11);
    });
  });

  describe('getLatestCompletedSync', () => {
    it('returns latest completed log', async () => {
      mockAppQuery.mockResolvedValue({ rows: [{ id: 5, status: 'completed' }] });
      const log = await getLatestCompletedSync();
      expect(log).toMatchObject({ id: 5 });
    });

    it('returns null when none', async () => {
      mockAppQuery.mockResolvedValue({ rows: [] });
      expect(await getLatestCompletedSync()).toBeNull();
    });
  });

  describe('getSyncStatus', () => {
    it('returns is_running=false when no running tasks', async () => {
      mockAppQuery
        .mockResolvedValueOnce({ rows: [] }) // hasRunningSync
        .mockResolvedValueOnce({ rows: [] }); // getLatestCompletedSync
      const status = await getSyncStatus();
      expect(status.is_running).toBe(false);
    });

    it('marks stuck task as failed and returns not running', async () => {
      const thirtyOneMinAgo = new Date(Date.now() - 31 * 60 * 1000).toISOString();
      mockAppQuery
        .mockResolvedValueOnce({ rows: [{ id: 11, started_at: thirtyOneMinAgo }] }) // hasRunningSync
        .mockResolvedValueOnce({ rows: [] }) // updateSyncLog
        .mockResolvedValueOnce({ rows: [{ id: 10, status: 'completed' }] }); // getLatestCompletedSync
      const status = await getSyncStatus();
      expect(status.is_running).toBe(false);
    });

    it('returns current_log when running', async () => {
      const recentTime = new Date().toISOString();
      mockAppQuery
        .mockResolvedValueOnce({ rows: [{ id: 12, started_at: recentTime }] }) // hasRunningSync
        .mockResolvedValueOnce({ rows: [{ id: 12, status: 'running' }] }) // current_log query
        .mockResolvedValueOnce({ rows: [] }); // getLatestCompletedSync
      const status = await getSyncStatus();
      expect(status.is_running).toBe(true);
      expect(status.current_log).toMatchObject({ id: 12 });
    });
  });
});
