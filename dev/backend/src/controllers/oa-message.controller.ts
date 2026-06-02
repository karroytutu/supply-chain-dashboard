/**
 * OA站内消息控制器
 * @module controllers/oa-message.controller
 */

import { Request, Response } from 'express';
import {
  getMessages,
  getUnreadMessageCount,
} from '../services/oa/oa.query';
import {
  markMessageRead,
  markAllMessagesRead,
} from '../services/oa/oa.mutation';
import { buildSuccessResponse, buildErrorResponse, buildPagedResponse } from '../utils/response';

/**
 * 获取站内消息列表
 * GET /api/oa/messages
 */
export async function listMessages(req: Request, res: Response): Promise<void> {
  try {
    const userId = (req as any).user?.userId;
    if (!userId) {
      res.status(401).json(buildErrorResponse(401, '未登录'));
      return;
    }

    const page = parseInt(req.query.page as string) || 1;
    const pageSize = parseInt((req.query.page_size as string) || (req.query.pageSize as string)) || 20;

    const result = await getMessages(userId, page, pageSize);
    res.json(buildPagedResponse(result.list, result.total, page, pageSize));
  } catch (error) {
    console.error('获取消息列表失败:', error);
    res.status(500).json(buildErrorResponse(500, '获取消息列表失败'));
  }
}

/**
 * 获取未读消息数量
 * GET /api/oa/messages/unread-count
 */
export async function getUnreadCount(req: Request, res: Response): Promise<void> {
  try {
    const userId = (req as any).user?.userId;
    if (!userId) {
      res.status(401).json(buildErrorResponse(401, '未登录'));
      return;
    }

    const count = await getUnreadMessageCount(userId);
    res.json(buildSuccessResponse({ count }));
  } catch (error) {
    console.error('获取未读消息数量失败:', error);
    res.status(500).json(buildErrorResponse(500, '获取未读消息数量失败'));
  }
}

/**
 * 标记消息已读
 * POST /api/oa/messages/:id/read
 */
export async function readMessage(req: Request, res: Response): Promise<void> {
  try {
    const userId = (req as any).user?.userId;
    if (!userId) {
      res.status(401).json(buildErrorResponse(401, '未登录'));
      return;
    }

    const messageId = parseInt(req.params.id);
    await markMessageRead(messageId, userId);

    res.json(buildSuccessResponse(null, '已标记已读'));
  } catch (error) {
    console.error('标记已读失败:', error);
    res.status(500).json(buildErrorResponse(500, '标记已读失败'));
  }
}

/**
 * 标记所有消息已读
 * POST /api/oa/messages/read-all
 */
export async function readAllMessages(req: Request, res: Response): Promise<void> {
  try {
    const userId = (req as any).user?.userId;
    if (!userId) {
      res.status(401).json(buildErrorResponse(401, '未登录'));
      return;
    }

    await markAllMessagesRead(userId);

    res.json(buildSuccessResponse(null, '已全部标记已读'));
  } catch (error) {
    console.error('标记全部已读失败:', error);
    res.status(500).json(buildErrorResponse(500, '标记全部已读失败'));
  }
}
