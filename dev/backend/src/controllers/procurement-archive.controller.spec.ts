import { Request, Response } from 'express';
import { getArchiveList, generateArchive } from './procurement-archive.controller';
import * as procurementArchiveService from '../services/procurement-archive';

jest.mock('../services/procurement-archive');
jest.mock('../utils/logger', () => ({
  createLogger: () => ({ warn: jest.fn(), info: jest.fn(), error: jest.fn() }),
}));

describe('Procurement Archive Controller', () => {
  let req: Partial<Request>;
  let res: Partial<Response>;

  beforeEach(() => {
    req = {
      query: {},
      body: {},
    };
    res = {
      json: jest.fn().mockReturnThis(),
      status: jest.fn().mockReturnThis(),
    };
    jest.clearAllMocks();
  });

  describe('getArchiveList', () => {
    it('should return archive list', async () => {
      req.query = { page: '1', pageSize: '12' };
      const mockResult = { records: [], total: 0, page: 1, pageSize: 12 };
      (procurementArchiveService.getMonthlyArchiveList as jest.Mock).mockResolvedValue(mockResult);

      await getArchiveList(req as Request, res as Response);

      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ code: 200 })
      );
    });

    it('should handle error', async () => {
      (procurementArchiveService.getMonthlyArchiveList as jest.Mock).mockRejectedValue(new Error('Error'));

      await getArchiveList(req as Request, res as Response);

      expect(res.status).toHaveBeenCalledWith(500);
    });
  });

  describe('generateArchive', () => {
    it('should generate archive for specified month', async () => {
      req.body = { year: 2026, month: 5 };
      (procurementArchiveService.saveMonthlyArchive as jest.Mock).mockResolvedValue(undefined);

      await generateArchive(req as Request, res as Response);

      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ code: 200 })
      );
    });

    it('should generate archive for last month by default', async () => {
      req.body = {};
      (procurementArchiveService.saveMonthlyArchive as jest.Mock).mockResolvedValue(undefined);

      await generateArchive(req as Request, res as Response);

      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ code: 200 })
      );
    });

    it('should handle error', async () => {
      (procurementArchiveService.saveMonthlyArchive as jest.Mock).mockRejectedValue(new Error('Error'));

      await generateArchive(req as Request, res as Response);

      expect(res.status).toHaveBeenCalledWith(500);
    });
  });
});
