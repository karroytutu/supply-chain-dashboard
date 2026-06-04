import { Request, Response } from 'express';
import {
  getGoodsReturnRulesController,
  getGoodsReturnRuleStatsController,
  createGoodsReturnRuleController,
  updateGoodsReturnRuleController,
  batchSetGoodsReturnRulesController,
  checkGoodsReturnRuleController,
} from './goods-return-rules.controller';
import * as goodsReturnRulesService from '../services/goods-return-rules';

jest.mock('../services/goods-return-rules');
jest.mock('../utils/logger', () => ({
  createLogger: () => ({ warn: jest.fn(), info: jest.fn(), error: jest.fn() }),
}));

describe('Goods Return Rules Controller', () => {
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

  describe('getGoodsReturnRulesController', () => {
    it('should return goods return rules', async () => {
      req.query = { keyword: 'test', canReturnToSupplier: 'true', page: '1', pageSize: '20' };
      const mockResult = { list: [], total: 0 };
      (goodsReturnRulesService.getGoodsReturnRules as jest.Mock).mockResolvedValue(mockResult);

      await getGoodsReturnRulesController(req as Request, res as Response);

      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ code: 200, data: mockResult })
      );
    });

    it('should handle error', async () => {
      (goodsReturnRulesService.getGoodsReturnRules as jest.Mock).mockRejectedValue(new Error('Error'));

      await getGoodsReturnRulesController(req as Request, res as Response);

      expect(res.status).toHaveBeenCalledWith(500);
    });
  });

  describe('getGoodsReturnRuleStatsController', () => {
    it('should return stats', async () => {
      const mockStats = { total: 100 };
      (goodsReturnRulesService.getGoodsReturnRuleStats as jest.Mock).mockResolvedValue(mockStats);

      await getGoodsReturnRuleStatsController(req as Request, res as Response);

      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ code: 200, data: mockStats })
      );
    });

    it('should handle error', async () => {
      (goodsReturnRulesService.getGoodsReturnRuleStats as jest.Mock).mockRejectedValue(new Error('Error'));

      await getGoodsReturnRuleStatsController(req as Request, res as Response);

      expect(res.status).toHaveBeenCalledWith(500);
    });
  });

  describe('createGoodsReturnRuleController', () => {
    it('should return 401 if no userId', async () => {
      req.user = undefined;

      await createGoodsReturnRuleController(req as Request, res as Response);

      expect(res.status).toHaveBeenCalledWith(401);
    });

    it('should create rule successfully', async () => {
      req.body = { goodsId: 1 };
      (goodsReturnRulesService.createGoodsReturnRule as jest.Mock).mockResolvedValue({ id: 1 });

      await createGoodsReturnRuleController(req as Request, res as Response);

      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ code: 200 })
      );
    });

    it('should handle error', async () => {
      (goodsReturnRulesService.createGoodsReturnRule as jest.Mock).mockRejectedValue(new Error('Error'));

      await createGoodsReturnRuleController(req as Request, res as Response);

      expect(res.status).toHaveBeenCalledWith(500);
    });
  });

  describe('updateGoodsReturnRuleController', () => {
    it('should return 401 if no userId', async () => {
      req.user = undefined;

      await updateGoodsReturnRuleController(req as Request, res as Response);

      expect(res.status).toHaveBeenCalledWith(401);
    });

    it('should update rule successfully', async () => {
      req.params = { id: '1' };
      req.body = { canReturnToSupplier: true };
      (goodsReturnRulesService.updateGoodsReturnRule as jest.Mock).mockResolvedValue({ id: 1 });

      await updateGoodsReturnRuleController(req as Request, res as Response);

      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ code: 200 })
      );
    });

    it('should handle error', async () => {
      req.params = { id: '1' };
      (goodsReturnRulesService.updateGoodsReturnRule as jest.Mock).mockRejectedValue(new Error('Error'));

      await updateGoodsReturnRuleController(req as Request, res as Response);

      expect(res.status).toHaveBeenCalledWith(500);
    });
  });

  describe('batchSetGoodsReturnRulesController', () => {
    it('should return 401 if no userId', async () => {
      req.user = undefined;

      await batchSetGoodsReturnRulesController(req as Request, res as Response);

      expect(res.status).toHaveBeenCalledWith(401);
    });

    it('should batch set rules successfully', async () => {
      req.body = { goodsIds: [1, 2], canReturnToSupplier: true };
      (goodsReturnRulesService.batchSetGoodsReturnRules as jest.Mock).mockResolvedValue({ updated: 2 });

      await batchSetGoodsReturnRulesController(req as Request, res as Response);

      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ code: 200 })
      );
    });

    it('should handle error', async () => {
      (goodsReturnRulesService.batchSetGoodsReturnRules as jest.Mock).mockRejectedValue(new Error('Error'));

      await batchSetGoodsReturnRulesController(req as Request, res as Response);

      expect(res.status).toHaveBeenCalledWith(500);
    });
  });

  describe('checkGoodsReturnRuleController', () => {
    it('should check rule successfully', async () => {
      req.params = { goodsId: '1' };
      (goodsReturnRulesService.checkGoodsReturnRule as jest.Mock).mockResolvedValue({ canReturn: true });

      await checkGoodsReturnRuleController(req as Request, res as Response);

      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ code: 200 })
      );
    });

    it('should handle error', async () => {
      req.params = { goodsId: '1' };
      (goodsReturnRulesService.checkGoodsReturnRule as jest.Mock).mockRejectedValue(new Error('Error'));

      await checkGoodsReturnRuleController(req as Request, res as Response);

      expect(res.status).toHaveBeenCalledWith(500);
    });
  });
});
