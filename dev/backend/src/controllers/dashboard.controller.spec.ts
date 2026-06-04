import { Request, Response } from 'express';
import {
  healthCheck,
  getDashboard,
  getWarningProductsController,
  getCategoryTreeController,
  getCategoryOutOfStockController,
} from './dashboard.controller';
import * as dashboardService from '../services/dashboard.service';
import * as response from '../utils/response';

jest.mock('../services/dashboard.service');
jest.mock('../utils/logger', () => ({
  createLogger: () => ({ warn: jest.fn(), info: jest.fn(), error: jest.fn() }),
}));

describe('Dashboard Controller', () => {
  let req: Partial<Request>;
  let res: Partial<Response>;

  beforeEach(() => {
    req = {};
    res = {
      json: jest.fn().mockReturnThis(),
      status: jest.fn().mockReturnThis(),
    };
    jest.clearAllMocks();
  });

  describe('healthCheck', () => {
    it('should return status ok', () => {
      healthCheck(req as Request, res as Response);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          code: 200,
          data: expect.objectContaining({ status: 'ok' }),
        })
      );
    });
  });

  describe('getDashboard', () => {
    it('should return dashboard data on success', async () => {
      const mockData = { totalProducts: 100 };
      (dashboardService.getDashboardData as jest.Mock).mockResolvedValue(mockData);

      await getDashboard(req as Request, res as Response);

      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ code: 200, data: mockData })
      );
    });

    it('should return 500 on error', async () => {
      (dashboardService.getDashboardData as jest.Mock).mockRejectedValue(new Error('DB error'));

      await getDashboard(req as Request, res as Response);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ code: 500 })
      );
    });
  });

  describe('getWarningProductsController', () => {
    it('should return warning products', async () => {
      req.params = { type: 'out-of-stock' };
      req.query = { page: '1', pageSize: '20' };
      const mockProducts = { list: [], total: 0 };
      (dashboardService.getWarningProducts as jest.Mock).mockResolvedValue(mockProducts);

      await getWarningProductsController(req as Request, res as Response);

      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ code: 200, data: mockProducts })
      );
    });

    it('should return 400 for invalid strategicLevel', async () => {
      req.params = { type: 'out-of-stock' };
      req.query = { strategicLevel: 'invalid' };

      await getWarningProductsController(req as Request, res as Response);

      expect(res.status).toHaveBeenCalledWith(400);
    });

    it('should handle error', async () => {
      req.params = { type: 'out-of-stock' };
      req.query = {};
      (dashboardService.getWarningProducts as jest.Mock).mockRejectedValue(new Error('Error'));

      await getWarningProductsController(req as Request, res as Response);

      expect(res.status).toHaveBeenCalledWith(500);
    });
  });

  describe('getCategoryTreeController', () => {
    it('should return category tree', async () => {
      const mockTree = { categories: [] };
      (dashboardService.getCategoryTreeData as jest.Mock).mockResolvedValue(mockTree);

      await getCategoryTreeController(req as Request, res as Response);

      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ code: 200, data: mockTree })
      );
    });

    it('should handle error', async () => {
      (dashboardService.getCategoryTreeData as jest.Mock).mockRejectedValue(new Error('Error'));

      await getCategoryTreeController(req as Request, res as Response);

      expect(res.status).toHaveBeenCalledWith(500);
    });
  });

  describe('getCategoryOutOfStockController', () => {
    it('should return out of stock products', async () => {
      req.query = { categoryPath: 'electronics', page: '1', pageSize: '20' };
      const mockResult = { list: [], total: 0 };
      (dashboardService.getOutOfStockProductsByCategory as jest.Mock).mockResolvedValue(mockResult);

      await getCategoryOutOfStockController(req as Request, res as Response);

      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ code: 200, data: mockResult })
      );
    });

    it('should return 400 if categoryPath missing', async () => {
      req.query = {};

      await getCategoryOutOfStockController(req as Request, res as Response);

      expect(res.status).toHaveBeenCalledWith(400);
    });

    it('should handle error', async () => {
      req.query = { categoryPath: 'electronics' };
      (dashboardService.getOutOfStockProductsByCategory as jest.Mock).mockRejectedValue(
        new Error('Error')
      );

      await getCategoryOutOfStockController(req as Request, res as Response);

      expect(res.status).toHaveBeenCalledWith(500);
    });
  });
});
