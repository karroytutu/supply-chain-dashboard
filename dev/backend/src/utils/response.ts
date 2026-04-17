/**
 * 统一API响应工具
 * @module utils/response
 */

import { Response } from 'express';

/** 发送成功响应 */
export const sendSuccess = (res: Response, data: any, message: string = 'success') => {
  res.json({ success: true, data, message });
};

/** 发送错误响应 */
export const sendError = (res: Response, status: number, message: string) => {
  res.status(status).json({ success: false, message });
};

/** 发送分页成功响应 */
export const sendPaginatedSuccess = (res: Response, data: any[], total: number, page: number, pageSize: number) => {
  res.json({ success: true, data, total, page, pageSize, totalPages: Math.ceil(total / pageSize) });
};

/**
 * 统一处理 POST 操作错误，根据错误信息返回合适的状态码
 * 用于 ar-collection 等使用 code 风格响应的控制器
 */
export function handleMutationError(res: Response, error: unknown, fallbackMsg: string): void {
  const msg = error instanceof Error ? error.message : fallbackMsg;
  if (msg.includes('不存在')) {
    res.status(404).json({ code: 404, message: msg });
  } else if (msg.includes('不允许') || msg.includes('无权') || msg.includes('已') || msg.includes('不能')) {
    res.status(400).json({ code: 400, message: msg });
  } else {
    console.error('Mutation error:', error);
    res.status(500).json({ code: 500, message: msg });
  }
}
