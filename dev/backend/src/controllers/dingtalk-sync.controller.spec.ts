import { Request, Response } from 'express';
import {
  triggerFullSync,
  triggerDeptSync,
  listSyncLogs,
  getSyncLogDetail,
  getCurrentSyncStatus,
} from './dingtalk-sync.controller';
import * as dingtalkSyncService from '../services/dingtalk-sync';
import * as syncLogQuery from '../services/dingtalk-sync/dingtalk-sync-log.query';

jest.mock('../services/dingtalk-sync');
jest.mock('../services/dingtalk-sync/dingtalk-sync-log.query');
jest.mock('../utils/logger', () => ({
  createLogger: () => ({ warn: jest.fn(), info: jest.fn(), error: jest.fn() }),
}));

describe('Dingtalk Sync Controller', () => {
  let req: Partial<Request>;
  let res: Partial<Response>;

  beforeEach(() => {
    req = {
      user: { userId: 1, dingtalkUserId: '1', name: 'Test', roles: [], permissions: [] },
      params: {},
      query: {},
      body: {},
    };
    res = {
      json: jest.fn().mockReturnThis(),
      status: jest.fn().mockReturnThis(),
    };
    jest.clearAllMocks();
  });

  describe('triggerFullSync', () => {
    it('should return 409 if sync is running', async () => {
      (syncLogQuery.hasRunningSync as jest.Mock).mockResolvedValue({ running: true, stuckLogId: null });

      await triggerFullSync(req as Request, res as Response);

      expect(res.status).toHaveBeenCalledWith(409);
    });

    it('should trigger full sync successfully', async () => {
      (syncLogQuery.hasRunningSync as jest.Mock).mockResolvedValue({ running: false, stuckLogId: null });
      (dingtalkSyncService.createSyncLog as jest.Mock).mockResolvedValue(1);
      (dingtalkSyncService.syncUsers as jest.Mock).mockResolvedValue({ created: 1, updated: 0, disabled: 0, unchanged: 0 });
      (dingtalkSyncService.updateSyncLog as jest.Mock).mockResolvedValue(undefined);

      await triggerFullSync(req as Request, res as Response);

      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ code: 200 })
      );
    });

    it('should handle sync error', async () => {
      (syncLogQuery.hasRunningSync as jest.Mock).mockResolvedValue({ running: false, stuckLogId: null });
      (dingtalkSyncService.createSyncLog as jest.Mock).mockResolvedValue(1);
      (dingtalkSyncService.syncUsers as jest.Mock).mockRejectedValue(new Error('Sync failed'));
      (dingtalkSyncService.updateSyncLog as jest.Mock).mockResolvedValue(undefined);

      await triggerFullSync(req as Request, res as Response);

      expect(res.status).toHaveBeenCalledWith(500);
    });
  });

  describe('triggerDeptSync', () => {
    it('should return 409 if sync is running', async () => {
      (syncLogQuery.hasRunningSync as jest.Mock).mockResolvedValue({ running: true });

      await triggerDeptSync(req as Request, res as Response);

      expect(res.status).toHaveBeenCalledWith(409);
    });

    it('should return 400 if no deptId', async () => {
      (syncLogQuery.hasRunningSync as jest.Mock).mockResolvedValue({ running: false });
      req.params = {};

      await triggerDeptSync(req as Request, res as Response);

      expect(res.status).toHaveBeenCalledWith(400);
    });

    it('should trigger dept sync successfully', async () => {
      (syncLogQuery.hasRunningSync as jest.Mock).mockResolvedValue({ running: false });
      req.params = { deptId: '123' };
      (dingtalkSyncService.createSyncLog as jest.Mock).mockResolvedValue(1);
      (dingtalkSyncService.syncUsersByDept as jest.Mock).mockResolvedValue({ created: 1, updated: 0, disabled: 0, unchanged: 0 });
      (dingtalkSyncService.updateSyncLog as jest.Mock).mockResolvedValue(undefined);

      await triggerDeptSync(req as Request, res as Response);

      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ code: 200 })
      );
    });

    it('should handle dept sync error', async () => {
      (syncLogQuery.hasRunningSync as jest.Mock).mockResolvedValue({ running: false });
      req.params = { deptId: '123' };
      (dingtalkSyncService.createSyncLog as jest.Mock).mockResolvedValue(1);
      (dingtalkSyncService.syncUsersByDept as jest.Mock).mockRejectedValue(new Error('Sync failed'));
      (dingtalkSyncService.updateSyncLog as jest.Mock).mockResolvedValue(undefined);

      await triggerDeptSync(req as Request, res as Response);

      expect(res.status).toHaveBeenCalledWith(500);
    });
  });

  describe('listSyncLogs', () => {
    it('should return sync logs', async () => {
      req.query = { page: '1', pageSize: '10' };
      (dingtalkSyncService.getSyncLogs as jest.Mock).mockResolvedValue({ list: [], total: 0 });

      await listSyncLogs(req as Request, res as Response);

      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ code: 200 })
      );
    });

    it('should handle error', async () => {
      (dingtalkSyncService.getSyncLogs as jest.Mock).mockRejectedValue(new Error('Error'));

      await listSyncLogs(req as Request, res as Response);

      expect(res.status).toHaveBeenCalledWith(500);
    });
  });

  describe('getSyncLogDetail', () => {
    it('should return 400 for invalid id', async () => {
      req.params = { id: 'invalid' };

      await getSyncLogDetail(req as Request, res as Response);

      expect(res.status).toHaveBeenCalledWith(400);
    });

    it('should return 404 if log not found', async () => {
      req.params = { id: '1' };
      (dingtalkSyncService.getSyncLogById as jest.Mock).mockResolvedValue(null);

      await getSyncLogDetail(req as Request, res as Response);

      expect(res.status).toHaveBeenCalledWith(404);
    });

    it('should return sync log detail', async () => {
      req.params = { id: '1' };
      (dingtalkSyncService.getSyncLogById as jest.Mock).mockResolvedValue({ id: 1 });

      await getSyncLogDetail(req as Request, res as Response);

      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ code: 200 })
      );
    });

    it('should handle error', async () => {
      req.params = { id: '1' };
      (dingtalkSyncService.getSyncLogById as jest.Mock).mockRejectedValue(new Error('Error'));

      await getSyncLogDetail(req as Request, res as Response);

      expect(res.status).toHaveBeenCalledWith(500);
    });
  });

  describe('getCurrentSyncStatus', () => {
    it('should return sync status', async () => {
      (dingtalkSyncService.getSyncStatus as jest.Mock).mockResolvedValue({ running: false });

      await getCurrentSyncStatus(req as Request, res as Response);

      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ code: 200 })
      );
    });

    it('should handle error', async () => {
      (dingtalkSyncService.getSyncStatus as jest.Mock).mockRejectedValue(new Error('Error'));

      await getCurrentSyncStatus(req as Request, res as Response);

      expect(res.status).toHaveBeenCalledWith(500);
    });
  });
});
