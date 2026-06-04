import { Request, Response } from 'express';
import { listApprovals, getStats, getDetail } from './oa.controller';
import * as oaQuery from '../services/oa/oa.query';

jest.mock('../services/oa/oa.query');
jest.mock('../utils/logger', () => ({
  createLogger: () => ({ warn: jest.fn(), info: jest.fn(), error: jest.fn() }),
}));

describe('OA Controller', () => {
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

  describe('listApprovals', () => {
    it('should return 401 if no userId', async () => {
      req.user = undefined;

      await listApprovals(req as Request, res as Response);

      expect(res.status).toHaveBeenCalledWith(401);
    });

    it('should return approval list', async () => {
      req.query = { page: '1', page_size: '20' };
      (oaQuery.getApprovalList as jest.Mock).mockResolvedValue({ list: [], total: 0 });

      await listApprovals(req as Request, res as Response);

      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ code: 200 })
      );
    });

    it('should handle invalid viewMode', async () => {
      req.query = { view_mode: 'invalid' };
      (oaQuery.getApprovalList as jest.Mock).mockResolvedValue({ list: [], total: 0 });

      await listApprovals(req as Request, res as Response);

      expect(res.json).toHaveBeenCalled();
    });

    it('should handle error', async () => {
      (oaQuery.getApprovalList as jest.Mock).mockRejectedValue(new Error('Error'));

      await listApprovals(req as Request, res as Response);

      expect(res.status).toHaveBeenCalledWith(500);
    });
  });

  describe('getStats', () => {
    it('should return 401 if no userId', async () => {
      req.user = undefined;

      await getStats(req as Request, res as Response);

      expect(res.status).toHaveBeenCalledWith(401);
    });

    it('should return stats', async () => {
      (oaQuery.getApprovalStats as jest.Mock).mockResolvedValue({ pending: 5 });

      await getStats(req as Request, res as Response);

      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ code: 200 })
      );
    });

    it('should handle error', async () => {
      (oaQuery.getApprovalStats as jest.Mock).mockRejectedValue(new Error('Error'));

      await getStats(req as Request, res as Response);

      expect(res.status).toHaveBeenCalledWith(500);
    });
  });

  describe('getDetail', () => {
    it('should return 400 for invalid id', async () => {
      req.params = { id: 'invalid' };

      await getDetail(req as Request, res as Response);

      expect(res.status).toHaveBeenCalledWith(400);
    });

    it('should return 404 if not found', async () => {
      req.params = { id: '1' };
      (oaQuery.getApprovalDetail as jest.Mock).mockResolvedValue(null);

      await getDetail(req as Request, res as Response);

      expect(res.status).toHaveBeenCalledWith(404);
    });

    it('should return approval detail', async () => {
      req.params = { id: '1' };
      (oaQuery.getApprovalDetail as jest.Mock).mockResolvedValue({ id: 1 });

      await getDetail(req as Request, res as Response);

      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ code: 200 })
      );
    });

    it('should handle error', async () => {
      req.params = { id: '1' };
      (oaQuery.getApprovalDetail as jest.Mock).mockRejectedValue(new Error('Error'));

      await getDetail(req as Request, res as Response);

      expect(res.status).toHaveBeenCalledWith(500);
    });
  });
});
