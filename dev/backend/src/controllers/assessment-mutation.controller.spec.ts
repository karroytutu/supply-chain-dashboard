import { Request, Response } from 'express';
import { handleAction, handleAppeal, handleCalculate } from './assessment-mutation.controller';
import * as assessmentService from '../services/assessment';

jest.mock('../services/assessment');
jest.mock('../utils/logger', () => ({
  createLogger: () => ({ warn: jest.fn(), info: jest.fn(), error: jest.fn() }),
}));

describe('Assessment Mutation Controller', () => {
  let req: Partial<Request>;
  let res: Partial<Response>;

  beforeEach(() => {
    req = {
      user: { userId: 1, dingtalkUserId: '1', name: 'Test', roles: [], permissions: [] },
      params: {},
      body: {},
    };
    res = {
      json: jest.fn().mockReturnThis(),
      status: jest.fn().mockReturnThis(),
    };
    jest.clearAllMocks();
  });

  describe('handleAction', () => {
    it('should return 400 for invalid id', async () => {
      req.params = { id: 'invalid' };
      await handleAction(req as Request, res as Response);
      expect(res.status).toHaveBeenCalledWith(400);
    });

    it('should return 400 for invalid action', async () => {
      req.params = { id: '1' };
      req.body = { action: 'invalid' };
      await handleAction(req as Request, res as Response);
      expect(res.status).toHaveBeenCalledWith(400);
    });

    it('should handle action successfully', async () => {
      req.params = { id: '1' };
      req.body = { action: 'confirm' };
      (assessmentService.handleAssessment as jest.Mock).mockResolvedValue({ id: 1 });
      await handleAction(req as Request, res as Response);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ code: 200 }));
    });

    it('should handle error', async () => {
      req.params = { id: '1' };
      req.body = { action: 'confirm' };
      (assessmentService.handleAssessment as jest.Mock).mockRejectedValue(new Error('Error'));
      await handleAction(req as Request, res as Response);
      expect(res.status).toHaveBeenCalledWith(400);
    });
  });

  describe('handleAppeal', () => {
    it('should return 400 for invalid id', async () => {
      req.params = { id: 'invalid' };
      await handleAppeal(req as Request, res as Response);
      expect(res.status).toHaveBeenCalledWith(400);
    });

    it('should return 400 for empty reason', async () => {
      req.params = { id: '1' };
      req.body = { reason: '' };
      await handleAppeal(req as Request, res as Response);
      expect(res.status).toHaveBeenCalledWith(400);
    });

    it('should submit appeal successfully', async () => {
      req.params = { id: '1' };
      req.body = { reason: 'Test reason' };
      (assessmentService.submitAppeal as jest.Mock).mockResolvedValue({ id: 1 });
      await handleAppeal(req as Request, res as Response);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ code: 200 }));
    });

    it('should handle error', async () => {
      req.params = { id: '1' };
      req.body = { reason: 'Test reason' };
      (assessmentService.submitAppeal as jest.Mock).mockRejectedValue(new Error('Error'));
      await handleAppeal(req as Request, res as Response);
      expect(res.status).toHaveBeenCalledWith(400);
    });
  });

  describe('handleCalculate', () => {
    it('should trigger calculation successfully', async () => {
      req.body = { category: 'test' };
      (assessmentService.triggerCalculation as jest.Mock).mockResolvedValue({ calculated: 10 });
      await handleCalculate(req as Request, res as Response);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ code: 200 }));
    });

    it('should handle error', async () => {
      (assessmentService.triggerCalculation as jest.Mock).mockRejectedValue(new Error('Error'));
      await handleCalculate(req as Request, res as Response);
      expect(res.status).toHaveBeenCalledWith(500);
    });
  });
});
