import { Request, Response, NextFunction } from 'express';
import logger from '../utils/logger';

/**
 * 错误处理中间件
 */
export const errorHandler = (err: Error, req: Request, res: Response, next: NextFunction) => {
  logger.error('服务器错误:', err);

  res.status(500).json({
    error: '服务器内部错误',
    message: process.env.NODE_ENV === 'development' ? err.message : '请稍后重试',
  });
};

/**
 * 请求日志中间件
 */
export const requestLogger = (req: Request, res: Response, next: NextFunction) => {
  const start = Date.now();
  
  res.on('finish', () => {
    const duration = Date.now() - start;
    logger.http(`${req.method} ${req.path} - ${res.statusCode} - ${duration}ms`);
  });
  
  next();
};
