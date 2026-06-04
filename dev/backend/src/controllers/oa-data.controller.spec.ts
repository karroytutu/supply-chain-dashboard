import { Request, Response } from 'express';
import { getDataList, exportData } from './oa-data.controller';
import * as oaQuery from '../services/oa/oa.query';

jest.mock('../services/oa/oa.query');
jest.mock('../utils/logger', () => ({
  createLogger: () => ({ warn: jest.fn(), info: jest.fn(), error: jest.fn() }),
}));

describe('OA Data Controller', () => {
  let req: Partial<Request>;
  let res: Partial<Response>;

  beforeEach(() => {
    req = {
      user: { userId: 1, dingtalkUserId: '1', name: 'Test', roles: [], permissions: [] },
      query: {},
    };
    res = {
      json: jest.fn().mockReturnThis(),
      status: jest.fn().mockReturnThis(),
    };
    jest.clearAllMocks();
  });

  describe('getDataList', () => {
    it('should return 401 if no userId', async () => {
      req.user = undefined;
      await getDataList(req as Request, res as Response);
      expect(res.status).toHaveBeenCalledWith(401);
    });

    it('should return data list', async () => {
      req.query = { page: '1', page_size: '20' };
      (oaQuery.getDataListAll as jest.Mock).mockResolvedValue({ list: [], total: 0 });
      await getDataList(req as Request, res as Response);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ code: 200 }));
    });

    it('should handle invalid pageSize', async () => {
      req.query = { page_size: '0' };
      (oaQuery.getDataListAll as jest.Mock).mockResolvedValue({ list: [], total: 0 });
      await getDataList(req as Request, res as Response);
      expect(res.json).toHaveBeenCalled();
    });

    it('should handle error', async () => {
      (oaQuery.getDataListAll as jest.Mock).mockRejectedValue(new Error('Error'));
      await getDataList(req as Request, res as Response);
      expect(res.status).toHaveBeenCalledWith(500);
    });
  });

  describe('exportData', () => {
    it('should return 401 if no userId', async () => {
      req.user = undefined;
      await exportData(req as Request, res as Response);
      expect(res.status).toHaveBeenCalledWith(401);
    });

    it('should return export message', async () => {
      await exportData(req as Request, res as Response);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ code: 200 }));
    });
  });
});
