/**
 * OA站内消息控制器
 * @module controllers/oa-message.controller
 */

import { Request, Response } from 'express';
import {
  getMessages,
  getUnreadMessageCount,
} from '../services/oa-approval/oa-approval.query';
import {
  markMessageRead,
  markAllMessagesRead,
} from '../services/oa-approval/oa-approval.mutation';

/**
 * 获取站内消息列表
 * GET /api/oa-approval/messages
 */
export async function listMessages(req: Request, res: Response): Promise<void> {
  try {
    const userId = (req as any).user?.userId;
    if (!userId) {
      res.status(401).json({
        success: false,
        message: '未登录',
      });
      return;
    }

    const page = parseInt(req.query.page as string) || 1;
    const pageSize = parseInt(req.query.pageSize as string) || 20;

    const result = await getMessages(userId, page, pageSize);
    res.json({
      success: true,
      data: result.list,
      total: result.total,
      page,
      pageSize,
    });
  } catch (error) {
    console.error('获取消息列表失败:', error);
    res.status(500).json({
      success: false,
      message: '获取消息列表失败',
    });
  }
}

/**
 * 获取未读消息数量
 * GET /api/oa-approval/messages/unread-count
 */
export async function getUnreadCount(req: Request, res: Response): Promise<void> {
  try {
    const userId = (req as any).user?.userId;
    if (!userId) {
      res.status(401).json({
        success: false,
        message: '未登录',
      });
      return;
    }

    const count = await getUnreadMessageCount(userId);
    res.json({
      success: true,
      data: { count },
    });
  } catch (error) {
    console.error('获取未读消息数量失败:', error);
    res.status(500).json({
      success: false,
      message: '获取未读消息数量失败',
    });
  }
}

/**
 * 标记消息已读
 * POST /api/oa-approval/messages/:id/read
 */
export async function readMessage(req: Request, res: Response): Promise<void> {
  try {
    const userId = (req as any).user?.userId;
    if (!userId) {
      res.status(401).json({
        success: false,
        message: '未登录',
      });
      return;
    }

    const messageId = parseInt(req.params.id);
    await markMessageRead(messageId, userId);

    res.json({
      success: true,
      message: '已标记已读',
    });
  } catch (error) {
    console.error('标记已读失败:', error);
    res.status(500).json({
      success: false,
      message: '标记已读失败',
    });
  }
}

/**
 * 标记所有消息已读
 * POST /api/oa-approval/messages/read-all
 */
export async function readAllMessages(req: Request, res: Response): Promise<void> {
  try {
    const userId = (req as any).user?.userId;
    if (!userId) {
      res.status(401).json({
        success: false,
        message: '未登录',
      });
      return;
    }

    await markAllMessagesRead(userId);

    res.json({
      success: true,
      message: '已全部标记已读',
    });
  } catch (error) {
    console.error('标记全部已读失败:', error);
    res.status(500).json({
      success: false,
      message: '标记全部已读失败',
    });
  }
}
