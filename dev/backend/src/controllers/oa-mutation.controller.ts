/**
 * OA操作控制器
 * @module controllers/oa-mutation.controller
 */
import { createLogger } from '../utils/logger';
const log = createLogger('OaMutation');

import { Request, Response } from 'express';
import { getFormTypeByCodeQuery } from '../services/oa/oa-form-type.query';
import {
  submitApproval,
  approveApproval,
  rejectApproval,
  transferApproval,
  countersignApproval,
  withdrawApproval,
  markCcRead,
} from '../services/oa/oa.mutation';
import { buildSuccessResponse, buildErrorResponse } from '../utils/response';

/** 提交审批 */
export async function submit(req: Request, res: Response): Promise<void> {
  try {
    const user = req.user;
    if (!user) {
      res.status(401).json(buildErrorResponse(401, '未登录'));
      return;
    }

    const { formTypeCode, formData, title } = req.body;
    if (!formTypeCode || !formData || !title) {
      res.status(400).json(buildErrorResponse(400, '缺少必要参数'));
      return;
    }

    const formType = await getFormTypeByCodeQuery(formTypeCode);
    if (!formType) {
      res.status(400).json(buildErrorResponse(400, '表单类型不存在'));
      return;
    }

    const result = await submitApproval(
      { formTypeCode, formData, title },
      formType,
      user.userId,
      user.name,
      ((user as unknown as Record<string, unknown>).department_name as string | null) ?? null
    );

    res.json(buildSuccessResponse(result, '提交成功'));
  } catch (error) {
    log.error('提交审批失败:', error);
    const message = error instanceof Error ? error.message : '提交审批失败';
    res.status(400).json(buildErrorResponse(400, message));
  }
}

/** 同意审批 */
export async function approve(req: Request, res: Response): Promise<void> {
  try {
    const user = req.user;
    if (!user) {
      res.status(401).json(buildErrorResponse(401, '未登录'));
      return;
    }

    const instanceId = parseInt(req.params.id);
    const { comment, inputData } = req.body;
    const result = await approveApproval(instanceId, user.userId, user.name, comment, inputData);
    if (result.status === 'processing') {
      res
        .status(202)
        .json(buildSuccessResponse({ status: 'processing' }, '审批已通过，系统处理中'));
    } else {
      res.json(buildSuccessResponse(null, '审批通过'));
    }
  } catch (error) {
    log.error('同意审批失败:', error);
    const message = error instanceof Error ? error.message : '同意审批失败';
    res.status(400).json(buildErrorResponse(400, message));
  }
}

/** 拒绝审批 */
export async function reject(req: Request, res: Response): Promise<void> {
  try {
    const user = req.user;
    if (!user) {
      res.status(401).json(buildErrorResponse(401, '未登录'));
      return;
    }

    const instanceId = parseInt(req.params.id);
    const { comment } = req.body;
    if (!comment) {
      res.status(400).json(buildErrorResponse(400, '请填写拒绝原因'));
      return;
    }

    await rejectApproval(instanceId, user.userId, user.name, comment);
    res.json(buildSuccessResponse(null, '已拒绝'));
  } catch (error) {
    log.error('拒绝审批失败:', error);
    const message = error instanceof Error ? error.message : '拒绝审批失败';
    res.status(400).json(buildErrorResponse(400, message));
  }
}

/** 转交审批 */
export async function transfer(req: Request, res: Response): Promise<void> {
  try {
    const user = req.user;
    if (!user) {
      res.status(401).json(buildErrorResponse(401, '未登录'));
      return;
    }

    const instanceId = parseInt(req.params.id);
    const { transferToUserId, comment } = req.body;
    if (!transferToUserId) {
      res.status(400).json(buildErrorResponse(400, '请选择转交对象'));
      return;
    }

    await transferApproval(instanceId, user.userId, user.name, transferToUserId, comment);
    res.json(buildSuccessResponse(null, '转交成功'));
  } catch (error) {
    log.error('转交审批失败:', error);
    const message = error instanceof Error ? error.message : '转交审批失败';
    res.status(400).json(buildErrorResponse(400, message));
  }
}

/** 加签 */
export async function countersign(req: Request, res: Response): Promise<void> {
  try {
    const user = req.user;
    if (!user) {
      res.status(401).json(buildErrorResponse(401, '未登录'));
      return;
    }

    const instanceId = parseInt(req.params.id);
    const { countersignType, countersignUserIds, comment } = req.body;
    if (!countersignType || !countersignUserIds || countersignUserIds.length === 0) {
      res.status(400).json(buildErrorResponse(400, '请选择加签类型和加签人'));
      return;
    }

    await countersignApproval(
      instanceId,
      user.userId,
      user.name,
      countersignType,
      countersignUserIds,
      comment
    );
    res.json(buildSuccessResponse(null, '加签成功'));
  } catch (error) {
    log.error('加签失败:', error);
    const message = error instanceof Error ? error.message : '加签失败';
    res.status(400).json(buildErrorResponse(400, message));
  }
}

/** 撤回审批 */
export async function withdraw(req: Request, res: Response): Promise<void> {
  try {
    const user = req.user;
    if (!user) {
      res.status(401).json(buildErrorResponse(401, '未登录'));
      return;
    }

    const instanceId = parseInt(req.params.id);
    await withdrawApproval(instanceId, user.userId, user.name);
    res.json(buildSuccessResponse(null, '撤回成功'));
  } catch (error) {
    log.error('撤回审批失败:', error);
    const message = error instanceof Error ? error.message : '撤回审批失败';
    res.status(400).json(buildErrorResponse(400, message));
  }
}

/** 标记抄送已读 */
export async function markCcAsRead(req: Request, res: Response): Promise<void> {
  try {
    const user = req.user;
    if (!user) {
      res.status(401).json(buildErrorResponse(401, '未登录'));
      return;
    }

    const instanceId = parseInt(req.params.id);
    await markCcRead(instanceId, user.userId);
    res.json(buildSuccessResponse(null, '已标记已读'));
  } catch (error) {
    log.error('标记抄送已读失败:', error);
    const message = error instanceof Error ? error.message : '标记已读失败';
    res.status(400).json(buildErrorResponse(400, message));
  }
}

/** 更新实例表单数据（操作型节点，不推进流程） */
export async function updateInstance(req: Request, res: Response): Promise<void> {
  try {
    const user = req.user;
    if (!user) {
      res.status(401).json(buildErrorResponse(401, '未登录'));
      return;
    }

    const instanceId = parseInt(req.params.id);
    const { formData, comment } = req.body;
    if (!formData || typeof formData !== 'object') {
      res.status(400).json(buildErrorResponse(400, '缺少 formData 参数'));
      return;
    }

    const { updateInstanceFormData } = await import('../services/oa/mutations/update-instance');
    await updateInstanceFormData(instanceId, user.userId, user.name, formData, comment);
    res.json(buildSuccessResponse(null, '数据已更新'));
  } catch (error) {
    log.error('更新实例数据失败:', error);
    const message = error instanceof Error ? error.message : '更新数据失败';
    res.status(400).json(buildErrorResponse(400, message));
  }
}
