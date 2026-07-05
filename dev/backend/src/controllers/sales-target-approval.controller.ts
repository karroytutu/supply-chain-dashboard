/**
 * 目标管理 - 审批控制器
 * POST /api/sales/targets/:id/submit-approval
 */

import { Request, Response } from 'express';
import { createLogger } from '../utils/logger';
const log = createLogger('SalesTarget-Approval-Ctrl');

import { getTarget, changeTargetStatus } from '../services/sales-target';
import { submitApproval } from '../services/oa/oa.mutation';
import { getFormTypeByCodeQuery } from '../services/oa/oa-form-type.query';
import { canEditMarketer, validateTargetForSubmission } from '../services/sales-target/sales-target-utils';
import { updateInstanceStatus } from '../services/oa/repositories/approval-instance.repository';
import { cancelAllPendingNodes } from '../services/oa/repositories/approval-node.repository';
import { getAppClient } from '../db/appPool';

/**
 * 补偿函数：取消已创建但目标状态更新失败的孤立 OA 实例
 */
async function cancelOrphanedOaInstance(instanceId: number): Promise<void> {
  const client = await getAppClient();
  try {
    await client.query('BEGIN');
    await updateInstanceStatus(client, instanceId, 'cancelled', { completedAt: new Date() });
    await cancelAllPendingNodes(client, instanceId);
    await client.query('COMMIT');
    log.info(`孤立 OA 实例已补偿取消: oaInstanceId=${instanceId}`);
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

/**
 * POST /api/sales/targets/:id/submit-approval
 * 提交目标审批
 */
export async function submitApprovalHandler(req: Request, res: Response): Promise<void> {
  const user = req.user;
  if (!user) {
    res.status(401).json({ success: false, message: '未登录' });
    return;
  }

  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) {
    res.status(400).json({ success: false, message: '无效的目标ID' });
    return;
  }

  // 校验目标存在
  const target = await getTarget(id);
  if (!target) {
    res.status(404).json({ success: false, message: '目标不存在' });
    return;
  }

  // 校验状态：仅 draft 和 rejected 可提交
  try {
    validateTargetForSubmission(target);
  } catch (e) {
    res.status(400).json({ success: false, message: e instanceof Error ? e.message : '不允许提交审批' });
    return;
  }

  // 归属校验
  if (!canEditMarketer(user.roles || [], user.userId, target.marketer_id)) {
    res.status(403).json({ success: false, message: '无权提交该营销师的目标' });
    return;
  }

  try {
    // 获取表单类型定义
    const formType = await getFormTypeByCodeQuery('sales_target_approval');
    if (!formType) {
      res.status(500).json({ success: false, message: '表单类型未注册，请先执行数据库迁移' });
      return;
    }

    // 调用 OA 提交审批（beforeSubmit 会校验目标状态并计算摘要数据）
    const result = await submitApproval(
      {
        formTypeCode: 'sales_target_approval',
        formData: { _targetId: id, submitterSignature: req.body.submitterSignature },
        title: `${target.marketer_name} ${target.year}年${target.month}月销售目标审批`,
      },
      formType,
      user.userId,
      user.name,
      ((user as unknown as Record<string, unknown>).department_name as string | null) ?? null
    );

    // OA 实例创建成功后，更新目标状态为 pending 并写入 oa_instance_id
    const updated = await changeTargetStatus(id, 'pending', ['draft', 'rejected'], result.instanceId);
    if (!updated) {
      log.warn(`目标状态已被并发修改，状态更新失败: targetId=${id}, oaInstanceId=${result.instanceId}`);
      // 补偿：将已创建的 OA 实例标记为取消，避免孤立审批流
      await cancelOrphanedOaInstance(result.instanceId).catch(err =>
        log.error(`补偿取消 OA 实例失败: oaInstanceId=${result.instanceId}`, err)
      );
      res.status(409).json({ success: false, message: '目标状态已变更，请刷新页面后重试' });
      return;
    }

    log.info(`目标审批提交成功: targetId=${id}, oaInstanceId=${result.instanceId}`);
    res.json({ success: true, data: { oaInstanceId: result.instanceId, instanceNo: result.instanceNo } });
  } catch (error) {
    log.error('提交目标审批失败:', error);
    const message = error instanceof Error ? error.message : '提交审批失败';
    res.status(400).json({ success: false, message });
  }
}
