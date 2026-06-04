import { Request, Response } from 'express';
import {
  supplementLicenseController,
  listMyDeferredUploadsController,
  listDeferredUploadsController,
  getDeferredByInstanceController,
} from './credit-license.controller';
import * as creditLicenseService from '../services/credit-license';
import * as creditUpload from '../middleware/credit-upload';

jest.mock('../services/credit-license');
jest.mock('../middleware/credit-upload');
jest.mock('../utils/logger', () => ({
  createLogger: () => ({ warn: jest.fn(), info: jest.fn(), error: jest.fn() }),
}));

describe('Credit License Controller', () => {
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

  describe('supplementLicenseController', () => {
    it('should return 401 if no userId', async () => {
      req.user = undefined;

      await supplementLicenseController(req as Request, res as Response);

      expect(res.status).toHaveBeenCalledWith(401);
    });

    it('should return 400 for invalid instanceId', async () => {
      req.params = { instanceId: 'invalid' };

      await supplementLicenseController(req as Request, res as Response);

      expect(res.status).toHaveBeenCalledWith(400);
    });

    it('should return 400 for invalid customerId', async () => {
      req.params = { instanceId: '123' };
      req.body = { customerId: 'invalid' };

      await supplementLicenseController(req as Request, res as Response);

      expect(res.status).toHaveBeenCalledWith(400);
    });

    it('should return 400 if no files', async () => {
      req.params = { instanceId: '123' };
      req.body = { customerId: '456' };
      req.files = [];

      await supplementLicenseController(req as Request, res as Response);

      expect(res.status).toHaveBeenCalledWith(400);
    });

    it('should supplement license successfully', async () => {
      req.params = { instanceId: '123' };
      req.body = { customerId: '456' };
      req.files = [{ filename: 'test.jpg' }] as any;
      (creditUpload.resolveLicenseFilePath as jest.Mock).mockReturnValue('/path/to/file');
      (creditLicenseService.supplementLicense as jest.Mock).mockResolvedValue({ id: 1 });

      await supplementLicenseController(req as Request, res as Response);

      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ code: 200, message: '营业执照补交成功' })
      );
    });

    it('should handle error', async () => {
      req.params = { instanceId: '123' };
      req.body = { customerId: '456' };
      req.files = [{ filename: 'test.jpg' }] as any;
      (creditUpload.resolveLicenseFilePath as jest.Mock).mockReturnValue('/path/to/file');
      (creditLicenseService.supplementLicense as jest.Mock).mockRejectedValue(new Error('Error'));

      await supplementLicenseController(req as Request, res as Response);

      expect(res.status).toHaveBeenCalled();
    });
  });

  describe('listMyDeferredUploadsController', () => {
    it('should return 401 if no userId', async () => {
      req.user = undefined;

      await listMyDeferredUploadsController(req as Request, res as Response);

      expect(res.status).toHaveBeenCalledWith(401);
    });

    it('should return deferred uploads', async () => {
      req.query = { page: '1', pageSize: '10' };
      (creditLicenseService.getMyDeferredUploads as jest.Mock).mockResolvedValue({
        list: [],
        total: 0,
        page: 1,
        pageSize: 10,
      });

      await listMyDeferredUploadsController(req as Request, res as Response);

      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ code: 200 })
      );
    });

    it('should handle error', async () => {
      (creditLicenseService.getMyDeferredUploads as jest.Mock).mockRejectedValue(new Error('Error'));

      await listMyDeferredUploadsController(req as Request, res as Response);

      expect(res.status).toHaveBeenCalledWith(500);
    });
  });

  describe('listDeferredUploadsController', () => {
    it('should return all deferred uploads', async () => {
      req.query = { page: '1', pageSize: '10' };
      (creditLicenseService.getDeferredUploads as jest.Mock).mockResolvedValue({
        list: [],
        total: 0,
        page: 1,
        pageSize: 10,
      });

      await listDeferredUploadsController(req as Request, res as Response);

      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ code: 200 })
      );
    });

    it('should handle error', async () => {
      (creditLicenseService.getDeferredUploads as jest.Mock).mockRejectedValue(new Error('Error'));

      await listDeferredUploadsController(req as Request, res as Response);

      expect(res.status).toHaveBeenCalledWith(500);
    });
  });

  describe('getDeferredByInstanceController', () => {
    it('should return 400 for invalid instanceId', async () => {
      req.params = { instanceId: 'invalid' };

      await getDeferredByInstanceController(req as Request, res as Response);

      expect(res.status).toHaveBeenCalledWith(400);
    });

    it('should return 404 if not found', async () => {
      req.params = { instanceId: '123' };
      (creditLicenseService.getDeferredByInstanceId as jest.Mock).mockResolvedValue(null);

      await getDeferredByInstanceController(req as Request, res as Response);

      expect(res.status).toHaveBeenCalledWith(404);
    });

    it('should return deferred record', async () => {
      req.params = { instanceId: '123' };
      (creditLicenseService.getDeferredByInstanceId as jest.Mock).mockResolvedValue({ id: 1 });

      await getDeferredByInstanceController(req as Request, res as Response);

      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ code: 200 })
      );
    });

    it('should handle error', async () => {
      req.params = { instanceId: '123' };
      (creditLicenseService.getDeferredByInstanceId as jest.Mock).mockRejectedValue(new Error('Error'));

      await getDeferredByInstanceController(req as Request, res as Response);

      expect(res.status).toHaveBeenCalledWith(500);
    });
  });
});
