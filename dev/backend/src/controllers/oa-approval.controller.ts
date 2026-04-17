/**
 * OA审批控制器
 * @module controllers/oa-approval.controller
 */

import { Request, Response } from 'express';
import {
  getActiveFormTypes,
  getFormTypeByCodeQuery,
  getFormTypesGroupedByCategory,
} from '../services/oa-approval/oa-form-type.query';
import {
  getApprovalList,
  getApprovalStats,
  getApprovalDetail,
  getMessages,
  getUnreadMessageCount,
  getDataListAll,
} from '../services/oa-approval/oa-approval.query';
import {
  submitApproval,
  approveApproval,
  rejectApproval,
  transferApproval,
  countersignApproval,
  withdrawApproval,
  markMessageRead,
  markAllMessagesRead,
  markCcRead,
} from '../services/oa-approval/oa-approval.mutation';
import { getFormTypeByCode } from '../services/oa-approval/form-types';
import { ApprovalListParams } from '../services/oa-approval/oa-approval.types';

// =====================================================
// 表单类型接口
// =====================================================

/**
 * 获取所有表单类型
 * GET /api/oa-approval/form-types
 */
export async function listFormTypes(req: Request, res: Response): Promise<void> {
  try {
    const formTypes = await getActiveFormTypes();
    res.json({
      success: true,
      data: formTypes,
    });
  } catch (error) {
    console.error('获取表单类型失败:', error);
    res.status(500).json({
      success: false,
      message: '获取表单类型失败',
    });
  }
}

/**
 * 获取按分类分组的表单类型
 * GET /api/oa-approval/form-types/grouped
 */
export async function listFormTypesGrouped(req: Request, res: Response): Promise<void> {
  try {
    const grouped = await getFormTypesGroupedByCategory();
    res.json({
      success: true,
      data: grouped,
    });
  } catch (error) {
    console.error('获取表单类型分组失败:', error);
    res.status(500).json({
      success: false,
      message: '获取表单类型分组失败',
    });
  }
}

/**
 * 获取单个表单类型
 * GET /api/oa-approval/form-types/:code
 */
export async function getFormType(req: Request, res: Response): Promise<void> {
  try {
    const { code } = req.params;
    const formType = await getFormTypeByCodeQuery(code);

    if (!formType) {
      res.status(404).json({
        success: false,
        message: '表单类型不存在',
      });
      return;
    }

    res.json({
      success: true,
      data: formType,
    });
  } catch (error) {
    console.error('获取表单类型失败:', error);
    res.status(500).json({
      success: false,
      message: '获取表单类型失败',
    });
  }
}

// =====================================================
// 审批实例接口
// =====================================================

/**
 * 获取审批列表
 * GET /api/oa-approval/instances
 */
export async function listApprovals(req: Request, res: Response): Promise<void> {
  try {
    const userId = (req as any).user?.userId;
    if (!userId) {
      res.status(401).json({
        success: false,
        message: '未登录',
      });
      return;
    }

    const params: ApprovalListParams = {
      viewMode: (req.query.viewMode as ApprovalListParams['viewMode']) || 'pending',
      formTypeCode: req.query.formTypeCode as string,
      status: req.query.status as ApprovalListParams['status'],
      urgency: req.query.urgency as ApprovalListParams['urgency'],
      startDate: req.query.startDate as string,
      endDate: req.query.endDate as string,
      page: parseInt(req.query.page as string) || 1,
      pageSize: parseInt(req.query.pageSize as string) || 20,
    };

    const result = await getApprovalList(params, userId);
    res.json({
      success: true,
      data: result.list,
      total: result.total,
      page: params.page,
      pageSize: params.pageSize,
    });
  } catch (error) {
    console.error('获取审批列表失败:', error);
    res.status(500).json({
      success: false,
      message: '获取审批列表失败',
    });
  }
}

/**
 * 获取审批统计
 * GET /api/oa-approval/instances/stats
 */
export async function getStats(req: Request, res: Response): Promise<void> {
  try {
    const userId = (req as any).user?.userId;
    if (!userId) {
      res.status(401).json({
        success: false,
        message: '未登录',
      });
      return;
    }

    const stats = await getApprovalStats(userId);
    res.json({
      success: true,
      data: stats,
    });
  } catch (error) {
    console.error('获取审批统计失败:', error);
    res.status(500).json({
      success: false,
      message: '获取审批统计失败',
    });
  }
}

/**
 * 获取审批详情
 * GET /api/oa-approval/instances/:id
 */
export async function getDetail(req: Request, res: Response): Promise<void> {
  try {
    const instanceId = parseInt(req.params.id);
    if (isNaN(instanceId)) {
      res.status(400).json({
        success: false,
        message: '无效的审批ID',
      });
      return;
    }

    const detail = await getApprovalDetail(instanceId);
    if (!detail) {
      res.status(404).json({
        success: false,
        message: '审批实例不存在',
      });
      return;
    }

    res.json({
      success: true,
      data: detail,
    });
  } catch (error) {
    console.error('获取审批详情失败:', error);
    res.status(500).json({
      success: false,
      message: '获取审批详情失败',
    });
  }
}

/**
 * 提交审批
 * POST /api/oa-approval/instances
 */
export async function submit(req: Request, res: Response): Promise<void> {
  try {
    const user = (req as any).user;
    if (!user) {
      res.status(401).json({
        success: false,
        message: '未登录',
      });
      return;
    }

    const { formTypeCode, formData, title, urgency } = req.body;

    if (!formTypeCode || !formData || !title) {
      res.status(400).json({
        success: false,
        message: '缺少必要参数',
      });
      return;
    }

    // 获取表单类型定义
    const formType = await getFormTypeByCodeQuery(formTypeCode);
    if (!formType) {
      res.status(400).json({
        success: false,
        message: '表单类型不存在',
      });
      return;
    }

    const result = await submitApproval(
      { formTypeCode, formData, title, urgency },
      formType,
      user.id,
      user.name,
      user.department_name
    );

    res.json({
      success: true,
      data: result,
      message: '提交成功',
    });
  } catch (error) {
    console.error('提交审批失败:', error);
    const message = error instanceof Error ? error.message : '提交审批失败';
    res.status(400).json({
      success: false,
      message,
    });
  }
}

/**
 * 同意审批
 * POST /api/oa-approval/instances/:id/approve
 */
export async function approve(req: Request, res: Response): Promise<void> {
  try {
    const user = (req as any).user;
    if (!user) {
      res.status(401).json({
        success: false,
        message: '未登录',
      });
      return;
    }

    const instanceId = parseInt(req.params.id);
    const { comment } = req.body;

    await approveApproval(instanceId, user.id, user.name, comment);

    res.json({
      success: true,
      message: '审批通过',
    });
  } catch (error) {
    console.error('同意审批失败:', error);
    const message = error instanceof Error ? error.message : '同意审批失败';
    res.status(400).json({
      success: false,
      message,
    });
  }
}

/**
 * 拒绝审批
 * POST /api/oa-approval/instances/:id/reject
 */
export async function reject(req: Request, res: Response): Promise<void> {
  try {
    const user = (req as any).user;
    if (!user) {
      res.status(401).json({
        success: false,
        message: '未登录',
      });
      return;
    }

    const instanceId = parseInt(req.params.id);
    const { comment } = req.body;

    if (!comment) {
      res.status(400).json({
        success: false,
        message: '请填写拒绝原因',
      });
      return;
    }

    await rejectApproval(instanceId, user.id, user.name, comment);

    res.json({
      success: true,
      message: '已拒绝',
    });
  } catch (error) {
    console.error('拒绝审批失败:', error);
    const message = error instanceof Error ? error.message : '拒绝审批失败';
    res.status(400).json({
      success: false,
      message,
    });
  }
}

/**
 * 转交审批
 * POST /api/oa-approval/instances/:id/transfer
 */
export async function transfer(req: Request, res: Response): Promise<void> {
  try {
    const user = (req as any).user;
    if (!user) {
      res.status(401).json({
        success: false,
        message: '未登录',
      });
      return;
    }

    const instanceId = parseInt(req.params.id);
    const { transferToUserId, comment } = req.body;

    if (!transferToUserId) {
      res.status(400).json({
        success: false,
        message: '请选择转交对象',
      });
      return;
    }

    await transferApproval(instanceId, user.id, user.name, transferToUserId, comment);

    res.json({
      success: true,
      message: '转交成功',
    });
  } catch (error) {
    console.error('转交审批失败:', error);
    const message = error instanceof Error ? error.message : '转交审批失败';
    res.status(400).json({
      success: false,
      message,
    });
  }
}

/**
 * 加签
 * POST /api/oa-approval/instances/:id/countersign
 */
export async function countersign(req: Request, res: Response): Promise<void> {
  try {
    const user = (req as any).user;
    if (!user) {
      res.status(401).json({
        success: false,
        message: '未登录',
      });
      return;
    }

    const instanceId = parseInt(req.params.id);
    const { countersignType, countersignUserIds, comment } = req.body;

    if (!countersignType || !countersignUserIds || countersignUserIds.length === 0) {
      res.status(400).json({
        success: false,
        message: '请选择加签类型和加签人',
      });
      return;
    }

    await countersignApproval(
      instanceId,
      user.id,
      user.name,
      countersignType,
      countersignUserIds,
      comment
    );

    res.json({
      success: true,
      message: '加签成功',
    });
  } catch (error) {
    console.error('加签失败:', error);
    const message = error instanceof Error ? error.message : '加签失败';
    res.status(400).json({
      success: false,
      message,
    });
  }
}

/**
 * 撤回审批
 * POST /api/oa-approval/instances/:id/withdraw
 */
export async function withdraw(req: Request, res: Response): Promise<void> {
  try {
    const user = (req as any).user;
    if (!user) {
      res.status(401).json({
        success: false,
        message: '未登录',
      });
      return;
    }

    const instanceId = parseInt(req.params.id);

    await withdrawApproval(instanceId, user.id, user.name);

    res.json({
      success: true,
      message: '撤回成功',
    });
  } catch (error) {
    console.error('撤回审批失败:', error);
    const message = error instanceof Error ? error.message : '撤回审批失败';
    res.status(400).json({
      success: false,
      message,
    });
  }
}

// =====================================================
// 站内消息接口
// =====================================================

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

// =====================================================
// 数据管理接口
// =====================================================

/**
 * 获取数据列表
 * GET /api/oa-approval/data
 */
export async function getDataList(req: Request, res: Response): Promise<void> {
  try {
    const userId = (req as any).user?.userId;
    if (!userId) {
      res.status(401).json({
        success: false,
        message: '未登录',
      });
      return;
    }

    const params: ApprovalListParams = {
      viewMode: 'my', // 数据管理默认查看所有
      formTypeCode: req.query.formTypeCode as string,
      status: req.query.status as ApprovalListParams['status'],
      startDate: req.query.startDate as string,
      endDate: req.query.endDate as string,
      page: parseInt(req.query.page as string) || 1,
      pageSize: parseInt(req.query.pageSize as string) || 20,
    };

    // 数据管理查看所有审批数据（不限视图模式）
    const result = await getDataListAll(params);

    res.json({
      success: true,
      data: result,
    });
  } catch (error) {
    console.error('获取数据列表失败:', error);
    res.status(500).json({
      success: false,
      message: '获取数据列表失败',
    });
  }
}

/**
 * 导出数据
 * GET /api/oa-approval/data/export
 */
export async function exportData(req: Request, res: Response): Promise<void> {
  try {
    const userId = (req as any).user?.userId;
    if (!userId) {
      res.status(401).json({
        success: false,
        message: '未登录',
      });
      return;
    }

    // 导出功能暂返回提示
    res.json({
      success: true,
      data: {
        message: '导出功能开发中',
      },
    });
  } catch (error) {
    console.error('导出数据失败:', error);
    res.status(500).json({
      success: false,
      message: '导出数据失败',
    });
  }
}
