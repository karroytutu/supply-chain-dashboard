import { Request, Response, NextFunction } from 'express';
import { errorHandler, requestLogger } from './errorHandler';

jest.mock('../utils/logger', () => ({
  createLogger: () => ({ warn: jest.fn(), info: jest.fn(), error: jest.fn(), http: jest.fn() }),
}));

describe('errorHandler middleware', () => {
  let req: Partial<Request>;
  let res: Partial<Response>;
  let next: jest.Mock;

  beforeEach(() => {
    req = { method: 'GET', path: '/test' };
    res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
      on: jest.fn((event: string, cb: Function) => {
        if (event === 'finish') cb();
      }) as any,
      statusCode: 200,
    };
    next = jest.fn();
    process.env.NODE_ENV = 'test';
  });

  describe('errorHandler', () => {
    it('should return 500 with generic message in production', () => {
      process.env.NODE_ENV = 'production';
      const error = new Error('Secret error');

      errorHandler(error, req as Request, res as Response, next);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: '服务器内部错误',
          message: '请稍后重试',
        })
      );
    });

    it('should return 500 with error message in development', () => {
      process.env.NODE_ENV = 'development';
      const error = new Error('Dev error');

      errorHandler(error, req as Request, res as Response, next);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: '服务器内部错误',
          message: 'Dev error',
        })
      );
    });
  });

  describe('requestLogger', () => {
    it('should call next()', () => {
      requestLogger(req as Request, res as Response, next);
      expect(next).toHaveBeenCalled();
    });
  });
});
