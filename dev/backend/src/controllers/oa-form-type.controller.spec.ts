import { Request, Response } from 'express';
import { listFormTypes, listFormTypesGrouped, getFormType } from './oa-form-type.controller';
import * as oaFormTypeQuery from '../services/oa/oa-form-type.query';

jest.mock('../services/oa/oa-form-type.query');
jest.mock('../utils/logger', () => ({
  createLogger: () => ({ warn: jest.fn(), info: jest.fn(), error: jest.fn() }),
}));

describe('OA Form Type Controller', () => {
  let req: Partial<Request>;
  let res: Partial<Response>;

  beforeEach(() => {
    req = { params: {} };
    res = {
      json: jest.fn().mockReturnThis(),
      status: jest.fn().mockReturnThis(),
    };
    jest.clearAllMocks();
  });

  describe('listFormTypes', () => {
    it('should return form types', async () => {
      (oaFormTypeQuery.getActiveFormTypes as jest.Mock).mockResolvedValue([{ code: 'test' }]);
      await listFormTypes(req as Request, res as Response);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ code: 200 }));
    });

    it('should handle error', async () => {
      (oaFormTypeQuery.getActiveFormTypes as jest.Mock).mockRejectedValue(new Error('Error'));
      await listFormTypes(req as Request, res as Response);
      expect(res.status).toHaveBeenCalledWith(500);
    });
  });

  describe('listFormTypesGrouped', () => {
    it('should return grouped form types', async () => {
      (oaFormTypeQuery.getFormTypesGroupedByCategory as jest.Mock).mockResolvedValue({});
      await listFormTypesGrouped(req as Request, res as Response);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ code: 200 }));
    });

    it('should handle error', async () => {
      (oaFormTypeQuery.getFormTypesGroupedByCategory as jest.Mock).mockRejectedValue(new Error('Error'));
      await listFormTypesGrouped(req as Request, res as Response);
      expect(res.status).toHaveBeenCalledWith(500);
    });
  });

  describe('getFormType', () => {
    it('should return 404 if not found', async () => {
      req.params = { code: 'test' };
      (oaFormTypeQuery.getFormTypeByCodeQuery as jest.Mock).mockResolvedValue(null);
      await getFormType(req as Request, res as Response);
      expect(res.status).toHaveBeenCalledWith(404);
    });

    it('should return form type', async () => {
      req.params = { code: 'test' };
      (oaFormTypeQuery.getFormTypeByCodeQuery as jest.Mock).mockResolvedValue({ code: 'test' });
      await getFormType(req as Request, res as Response);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ code: 200 }));
    });

    it('should handle error', async () => {
      req.params = { code: 'test' };
      (oaFormTypeQuery.getFormTypeByCodeQuery as jest.Mock).mockRejectedValue(new Error('Error'));
      await getFormType(req as Request, res as Response);
      expect(res.status).toHaveBeenCalledWith(500);
    });
  });
});
