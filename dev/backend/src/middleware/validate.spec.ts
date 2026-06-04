import { Request, Response, NextFunction } from 'express';
import { validate } from './validate';
import { z } from 'zod';

describe('validate middleware', () => {
  let req: Partial<Request>;
  let res: Partial<Response>;
  let next: jest.Mock;

  beforeEach(() => {
    req = { body: {}, query: {}, params: {} };
    res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
    };
    next = jest.fn();
  });

  it('should call next() when validation passes', () => {
    const schema = z.object({
      body: z.object({ name: z.string() }),
    });
    req.body = { name: 'test' };

    validate(schema)(req as Request, res as Response, next);

    expect(next).toHaveBeenCalled();
  });

  it('should return 400 when validation fails', () => {
    const schema = z.object({
      body: z.object({ name: z.string() }),
    });
    req.body = { name: 123 };

    validate(schema)(req as Request, res as Response, next);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        message: '参数验证失败',
      })
    );
  });

  it('should pass non-ZodError to next()', () => {
    const schema = {
      parse: () => { throw new Error('Unknown error'); },
    } as any;

    validate(schema)(req as Request, res as Response, next);

    expect(next).toHaveBeenCalledWith(expect.any(Error));
  });
});
