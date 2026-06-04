import { Request, Response } from 'express';
import { getWorkspaceDataController } from './workspace.controller';
import * as workspaceService from '../services/workspace/workspace.service';

jest.mock('../services/workspace/workspace.service');
jest.mock('../utils/logger', () => ({
  createLogger: () => ({ warn: jest.fn(), info: jest.fn(), error: jest.fn() }),
}));

describe('Workspace Controller', () => {
  let req: Partial<Request>;
  let res: Partial<Response>;

  beforeEach(() => {
    req = {
      user: { userId: 1, dingtalkUserId: '1', name: 'Test', roles: [], permissions: [] },
    };
    res = {
      json: jest.fn().mockReturnThis(),
      status: jest.fn().mockReturnThis(),
    };
    jest.clearAllMocks();
  });

  describe('getWorkspaceDataController', () => {
    it('should return 401 if no userId', async () => {
      req.user = undefined;
      await getWorkspaceDataController(req as Request, res as Response);
      expect(res.status).toHaveBeenCalledWith(401);
    });

    it('should return workspace data', async () => {
      (workspaceService.getWorkspaceData as jest.Mock).mockResolvedValue({ tasks: [] });
      await getWorkspaceDataController(req as Request, res as Response);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ code: 200 }));
    });

    it('should handle error', async () => {
      (workspaceService.getWorkspaceData as jest.Mock).mockRejectedValue(new Error('Error'));
      await getWorkspaceDataController(req as Request, res as Response);
      expect(res.status).toHaveBeenCalledWith(500);
    });
  });
});
