import { Request, Response } from 'express';
import {
  getStrategicProductsController,
  getStrategicProductStatsController,
  getCategoryTreeController,
  getProductsForSelectionController,
} from './strategic-product-query.controller';
import * as strategicProductService from '../services/strategic-product';

jest.mock('../services/strategic-product');
jest.mock('../utils/logger', () => ({
  createLogger: () => ({ warn: jest.fn(), info: jest.fn(), error: jest.fn() }),
}));

describe('Strategic Product Query Controller', () => {
  let req: Partial<Request>;
  let res: Partial<Response>;

  beforeEach(() => {
    req = { query: {} };
    res = {
      json: jest.fn().mockReturnThis(),
      status: jest.fn().mockReturnThis(),
    };
    jest.clearAllMocks();
  });

  describe('getStrategicProductsController', () => {
    it('should return strategic products', async () => {
      req.query = { page: '1', pageSize: '20' };
      (strategicProductService.getStrategicProducts as jest.Mock).mockResolvedValue({ list: [], total: 0 });
      await getStrategicProductsController(req as Request, res as Response);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ code: 200 }));
    });

    it('should handle error', async () => {
      (strategicProductService.getStrategicProducts as jest.Mock).mockRejectedValue(new Error('Error'));
      await getStrategicProductsController(req as Request, res as Response);
      expect(res.status).toHaveBeenCalledWith(500);
    });
  });

  describe('getStrategicProductStatsController', () => {
    it('should return stats', async () => {
      (strategicProductService.getStrategicProductStats as jest.Mock).mockResolvedValue({ total: 100 });
      await getStrategicProductStatsController(req as Request, res as Response);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ code: 200 }));
    });

    it('should handle error', async () => {
      (strategicProductService.getStrategicProductStats as jest.Mock).mockRejectedValue(new Error('Error'));
      await getStrategicProductStatsController(req as Request, res as Response);
      expect(res.status).toHaveBeenCalledWith(500);
    });
  });

  describe('getCategoryTreeController', () => {
    it('should return category tree', async () => {
      (strategicProductService.getCategoryTree as jest.Mock).mockResolvedValue([]);
      await getCategoryTreeController(req as Request, res as Response);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ code: 200 }));
    });

    it('should handle error', async () => {
      (strategicProductService.getCategoryTree as jest.Mock).mockRejectedValue(new Error('Error'));
      await getCategoryTreeController(req as Request, res as Response);
      expect(res.status).toHaveBeenCalledWith(500);
    });
  });

  describe('getProductsForSelectionController', () => {
    it('should return products for selection', async () => {
      req.query = { page: '1', pageSize: '50' };
      (strategicProductService.getProductsForSelection as jest.Mock).mockResolvedValue({ list: [], total: 0 });
      await getProductsForSelectionController(req as Request, res as Response);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ code: 200 }));
    });

    it('should handle error', async () => {
      (strategicProductService.getProductsForSelection as jest.Mock).mockRejectedValue(new Error('Error'));
      await getProductsForSelectionController(req as Request, res as Response);
      expect(res.status).toHaveBeenCalledWith(500);
    });
  });
});
