/**
 * OA 异步任务服务
 * @module services/oa/oa-async-task.service
 *
 * 用于失败补偿与削峰：创建壳实例、发送通知、自动环节回调、完成/取消钉钉待办等
 * 非核心路径操作先写入任务表，再由定时 worker 消费。
 */

import { createLogger } from '../../utils/logger';
const log = createLogger('OA');

import { appQuery } from '../../db/appPool';
import { withAdvisoryLock } from '../../utils/distributed-lock';
// TODO: 适配器/端口层为下个迭代骨架代码，当前未接入事件发布，暂不加载
// import './adapters/dingtalk-adapter';
import {
  createProcessInstance,
  finalizeProcessInstance,
  createApprovalTodo,
  completeApprovalTodo,
  completeAllPendingTodos,
} from './oa-process-centre';
import {
  notifyPendingApproval,
  notifyApproved,
  notifyRejected,
  notifyTransferred,
  notifyCountersign,
  notifyWithdrawn,
  notifyCc,
} from './oa-notify';
import { executeAutoNodeCallback } from './mutations/auto-node-operations';
import { getFormTypeByCode } from './form-types';
import type { FormSchema, OaNodeRow } from './oa.types';
import { getInstanceNotifyData } from './mutations/shared-utils';

export type OaAsyncTaskType =
  | 'create_process_instance'
  | 'finalize_process_instance'
  | 'create_approval_todo'
  | 'complete_approval_todo'
  | 'complete_all_pending_todos'
  | 'send_approval_notification'
  | 'execute_auto_node';

export interface OaAsyncTaskEnqueueOptions {
  /** 首次执行延迟（分钟） */
  delayMinutes?: number;
  /** 最大重试次数，默认 5 */
  maxRetries?: number;
}

/** 任务表行类型 */
interface OaAsyncTaskRow {
  id: number;
  type: OaAsyncTaskType;
  payload: Record<string, unknown>;
  status: 'pending' | 'processing' | 'completed' | 'failed' | 'dead_letter';
  retries: number;
  max_retries: number;
  next_retry_at: Date;
  error: string | null;
  dedup_key: string | null;
}

const MAX_RETRY_BACKOFF_MINUTES = 60;

// =====================================================
// 便捷入队函数
// =====================================================

export async function enqueueCreateProcessInstance(
  instanceId: number,
  formTypeCode: string,
  formTypeName: string,
  applicantUserId: number,
  title: string,
  formSchema?: FormSchema,
  formData?: Record<string, unknown>,
  baseUrlOverride?: string
): Promise<void> {
  await enqueueOaAsyncTask(
    'create_process_instance',
    {
      instanceId,
      formTypeCode,
      formTypeName,
      applicantUserId,
      title,
      formSchema,
      formData,
      baseUrlOverride,
    },
    { delayMinutes: 0 }
  );
}

export async function enqueueFinalizeProcessInstance(
  instanceId: number,
  result: 'agree' | 'refuse'
): Promise<void> {
  await enqueueOaAsyncTask('finalize_process_instance', { instanceId, result });
}

/**
 * 预留接口：当前通过通知链路间接调用（notifyPendingApproval 内部调用 createApprovalTodo）
 * 若后续需要将待办创建与通知解耦（如通知失败时待办仍可独立创建），可直接使用此函数
 */
export async function enqueueCreateApprovalTodo(
  instanceId: number,
  instanceNo: string,
  title: string,
  formTypeName: string,
  applicantName: string,
  approverUserId: number,
  formSchema?: FormSchema,
  formData?: Record<string, unknown>,
  nodeOrder?: number,
  baseUrlOverride?: string
): Promise<void> {
  await enqueueOaAsyncTask('create_approval_todo', {
    instanceId,
    instanceNo,
    title,
    formTypeName,
    applicantName,
    approverUserId,
    formSchema,
    formData,
    nodeOrder,
    baseUrlOverride,
  });
}

export async function enqueueCompleteApprovalTodo(
  instanceId: number,
  userId: number,
  result?: 'AGREE' | 'REFUSE'
): Promise<void> {
  await enqueueOaAsyncTask('complete_approval_todo', { instanceId, userId, result });
}

export async function enqueueCompleteAllPendingTodos(
  instanceId: number,
  result?: 'agree' | 'refuse'
): Promise<void> {
  await enqueueOaAsyncTask('complete_all_pending_todos', { instanceId, result });
}

export async function enqueueSendApprovalNotification(
  notificationType: 'pending' | 'approved' | 'rejected' | 'transferred' | 'countersign' | 'withdrawn' | 'cc',
  instanceId: number,
  extra: Record<string, unknown> = {}
): Promise<void> {
  await enqueueOaAsyncTask('send_approval_notification', {
    notificationType,
    instanceId,
    ...extra,
  });
}

export async function enqueueExecuteAutoNode(instanceId: number, nodeId: number): Promise<void> {
  await enqueueOaAsyncTask('execute_auto_node', { instanceId, nodeId });
}

/**
 * 生成去重 key
 * 包含 userId 和 notificationType 维度，确保：
 * - 会签场景下不同审批人的任务不会被误判为重复
 * - 同一实例的不同通知类型（rejected/transferred/countersign 等）不会碰撞
 */
export function buildOaAsyncTaskDedupKey(
  type: OaAsyncTaskType,
  instanceId: number,
  nodeOrder?: number | null,
  userId?: number | null,
  notificationType?: string | null
): string {
  return `oa:${type}:${instanceId}:${nodeOrder ?? 0}:${userId ?? 0}:${notificationType ?? ''}`;
}

/**
 * 入队异步任务
 * 重复 key 的 pending 任务会被忽略（幂等入队）
 */
export async function enqueueOaAsyncTask(
  type: OaAsyncTaskType,
  payload: Record<string, unknown>,
  options: OaAsyncTaskEnqueueOptions = {}
): Promise<void> {
  const { delayMinutes = 0, maxRetries = 5 } = options;
  const instanceId = typeof payload.instanceId === 'number' ? payload.instanceId : 0;
  const nodeOrder = typeof payload.nodeOrder === 'number' ? payload.nodeOrder : null;
  const userId = typeof payload.userId === 'number' ? payload.userId : null;
  const notificationType = typeof payload.notificationType === 'string' ? payload.notificationType : null;
  const dedupKey = buildOaAsyncTaskDedupKey(type, instanceId, nodeOrder, userId, notificationType);

  try {
    await appQuery(
      `INSERT INTO oa_async_tasks (type, payload, status, retries, max_retries, next_retry_at, dedup_key)
       VALUES ($1, $2, 'pending', 0, $3, NOW() + ($4 || ' minutes')::interval, $5)
       ON CONFLICT (dedup_key) WHERE status = 'pending' DO NOTHING`,
      [type, JSON.stringify(payload), maxRetries, delayMinutes, dedupKey]
    );
  } catch (error) {
    log.error('OA 异步任务入队失败:', { type, instanceId, error: (error as Error)?.message });
    throw error;
  }
}

/**
 * 消费异步任务（两阶段处理）
 * Phase 1: advisory lock 内快速领取任务并标记为 processing，提交事务释放锁和连接
 * Phase 2: 在事务外逐条执行任务，每条独立更新状态，避免长事务占用连接
 */
export async function processOaAsyncTasks(
  batchSize = 50
): Promise<{ processed: number; failed: number; deadLetter: number }> {
  // Phase 1: 在 advisory lock 内领取任务并标记为 processing
  const claimedTasks = await withAdvisoryLock('oa:async-task:consumer', async (client) => {
    const result = await client.query<OaAsyncTaskRow>(
      `UPDATE oa_async_tasks
       SET status = 'processing', updated_at = NOW()
       WHERE id IN (
         SELECT id FROM oa_async_tasks
         WHERE status = 'pending' AND next_retry_at <= NOW()
         ORDER BY next_retry_at ASC, id ASC
         LIMIT $1
         FOR UPDATE SKIP LOCKED
       )
       RETURNING *`,
      [batchSize]
    );
    return result.rows;
  }); // 锁在此释放，连接归还

  // Phase 2: 在事务外逐条执行，每条任务使用独立 DB 调用
  let processed = 0;
  let failed = 0;
  let deadLetter = 0;

  for (const task of claimedTasks) {
    try {
      await executeOaAsyncTask(task.type, task.payload);

      await appQuery(
        `UPDATE oa_async_tasks SET status = 'completed', updated_at = NOW() WHERE id = $1`,
        [task.id]
      );
      processed++;
    } catch (error) {
      const errMsg = (error as Error)?.message || String(error);
      const nextRetries = task.retries + 1;
      const nextStatus = nextRetries >= task.max_retries ? 'dead_letter' : 'pending';
      if (nextStatus === 'dead_letter') deadLetter++;
      const backoffMinutes = Math.min(
        Math.pow(2, nextRetries),
        MAX_RETRY_BACKOFF_MINUTES
      );

      await appQuery(
        `UPDATE oa_async_tasks
         SET status = $1,
             retries = $2,
             next_retry_at = NOW() + ($3 || ' minutes')::interval,
             error = $4,
             updated_at = NOW()
         WHERE id = $5`,
        [nextStatus, nextRetries, backoffMinutes, errMsg, task.id]
      );

      failed++;
      log.error('OA 异步任务执行失败:', {
        taskId: task.id,
        type: task.type,
        retries: nextRetries,
        status: nextStatus,
        error: errMsg,
      });
    }
  }

  return { processed, failed, deadLetter };
}

/**
 * 执行单个任务
 */
async function executeOaAsyncTask(
  type: OaAsyncTaskType,
  payload: Record<string, unknown>
): Promise<void> {
  switch (type) {
    case 'create_process_instance':
      await handleCreateProcessInstance(payload);
      break;
    case 'finalize_process_instance':
      await handleFinalizeProcessInstance(payload);
      break;
    case 'create_approval_todo':
      await handleCreateApprovalTodo(payload);
      break;
    case 'complete_approval_todo':
      await handleCompleteApprovalTodo(payload);
      break;
    case 'complete_all_pending_todos':
      await handleCompleteAllPendingTodos(payload);
      break;
    case 'send_approval_notification':
      await handleSendApprovalNotification(payload);
      break;
    case 'execute_auto_node':
      await handleExecuteAutoNode(payload);
      break;
    default:
      throw new Error(`未知异步任务类型: ${type}`);
  }
}

async function handleCreateProcessInstance(payload: Record<string, unknown>): Promise<void> {
  const instanceId = Number(payload.instanceId);
  const formTypeCode = String(payload.formTypeCode);
  const formTypeName = String(payload.formTypeName);
  const applicantUserId = Number(payload.applicantUserId);
  const title = String(payload.title);
  const formSchema = payload.formSchema as FormSchema | undefined;
  const formData = payload.formData as Record<string, unknown> | undefined;
  const baseUrlOverride = payload.baseUrlOverride as string | undefined;

  await createProcessInstance(
    instanceId,
    formTypeCode,
    formTypeName,
    applicantUserId,
    title,
    formSchema,
    formData,
    baseUrlOverride
  );
}

async function handleFinalizeProcessInstance(payload: Record<string, unknown>): Promise<void> {
  const instanceId = Number(payload.instanceId);
  const result = payload.result as 'agree' | 'refuse';
  await finalizeProcessInstance(instanceId, result);
}

async function handleCreateApprovalTodo(payload: Record<string, unknown>): Promise<void> {
  const instanceId = Number(payload.instanceId);
  const instanceNo = String(payload.instanceNo);
  const title = String(payload.title);
  const formTypeName = String(payload.formTypeName);
  const applicantName = String(payload.applicantName);
  const approverUserId = Number(payload.approverUserId);
  const formSchema = payload.formSchema as FormSchema | undefined;
  const formData = payload.formData as Record<string, unknown> | undefined;
  const nodeOrder = payload.nodeOrder ? Number(payload.nodeOrder) : undefined;
  const baseUrlOverride = payload.baseUrlOverride as string | undefined;

  await createApprovalTodo(
    instanceId,
    instanceNo,
    title,
    formTypeName,
    applicantName,
    approverUserId,
    formSchema,
    formData,
    nodeOrder,
    baseUrlOverride
  );
}

async function handleCompleteApprovalTodo(payload: Record<string, unknown>): Promise<void> {
  const instanceId = Number(payload.instanceId);
  const userId = Number(payload.userId);
  const result = payload.result as 'AGREE' | 'REFUSE' | undefined;
  await completeApprovalTodo(instanceId, userId, result);
}

async function handleCompleteAllPendingTodos(payload: Record<string, unknown>): Promise<void> {
  const instanceId = Number(payload.instanceId);
  const result = payload.result as 'agree' | 'refuse' | undefined;
  await completeAllPendingTodos(instanceId, result);
}

async function handleSendApprovalNotification(payload: Record<string, unknown>): Promise<void> {
  const notificationType = String(payload.notificationType);
  const instanceId = Number(payload.instanceId);

  const data = await getInstanceNotifyData(instanceId);
  if (!data) {
    // 区分“实例不存在”与“查询暂时失败”：后者应抛出异常触发重试
    const existsResult = await appQuery(
      `SELECT 1 FROM oa_approval_instances WHERE id = $1`,
      [instanceId]
    );
    if (existsResult.rows.length > 0) {
      throw new Error(`实例 ${instanceId} 存在但通知数据获取失败，等待重试`);
    }
    return; // 实例已不存在，放弃通知
  }

  const { instance, formTypeName, formType } = data;
  const formSchema = formType?.formSchema;
  const formData = instance.form_data as Record<string, unknown>;

  switch (notificationType) {
    case 'pending': {
      const approverIds = (payload.approverIds as number[]) || [];
      const nodeName = String(payload.nodeName);
      const nodeOrder = Number(payload.nodeOrder);
      if (approverIds.length > 0) {
        await notifyPendingApproval(
          {
            instanceId,
            instanceNo: instance.instance_no,
            title: instance.title,
            formTypeName,
            applicantName: instance.applicant_name,
            nodeName,
            nodeOrder,
            formSchema,
            formData,
          },
          approverIds
        );
      }
      break;
    }
    case 'approved': {
      await notifyApproved(
        {
          instanceId,
          instanceNo: instance.instance_no,
          title: instance.title,
          formTypeName,
          applicantName: instance.applicant_name,
          formSchema,
          formData,
        },
        instance.applicant_id
      );
      break;
    }
    case 'rejected': {
      const rejectUserName = String(payload.rejectUserName);
      const reason = String(payload.reason);
      await notifyRejected(
        {
          instanceId,
          instanceNo: instance.instance_no,
          title: instance.title,
          formTypeName,
          applicantName: instance.applicant_name,
          reason,
          rejectUserName,
          formSchema,
          formData,
        },
        instance.applicant_id,
        reason,
        rejectUserName
      );
      break;
    }
    case 'transferred': {
      const transferToUserId = Number(payload.transferToUserId);
      const fromUserName = String(payload.fromUserName);
      let nodeName = String(payload.nodeName || '');
      let nodeOrder = Number(payload.nodeOrder || 0);
      // 若未传入节点信息，从当前待处理节点中查询
      if (!nodeName) {
        const nodeResult = await appQuery<{ node_name: string; node_order: number }>(
          `SELECT node_name, node_order FROM oa_approval_nodes
           WHERE instance_id = $1 AND $2 = ANY(assigned_user_ids) AND status = 'pending'
           ORDER BY node_order LIMIT 1`,
          [instanceId, transferToUserId]
        );
        if (nodeResult.rows.length > 0) {
          nodeName = nodeResult.rows[0].node_name;
          nodeOrder = nodeResult.rows[0].node_order;
        }
      }
      await notifyTransferred(
        {
          instanceId,
          instanceNo: instance.instance_no,
          title: instance.title,
          formTypeName,
          applicantName: instance.applicant_name,
          fromUserName,
          nodeName,
          nodeOrder,
          formSchema,
          formData,
        },
        transferToUserId
      );
      break;
    }
    case 'countersign': {
      const countersignUserIds = (payload.countersignUserIds as number[]) || [];
      const fromUserName = String(payload.fromUserName);
      if (countersignUserIds.length > 0) {
        await notifyCountersign(
          {
            instanceId,
            instanceNo: instance.instance_no,
            title: instance.title,
            formTypeName,
            applicantName: instance.applicant_name,
            fromUserName,
            formSchema,
            formData,
          },
          countersignUserIds
        );
      }
      break;
    }
    case 'withdrawn': {
      let approverIds = (payload.approverIds as number[]) || [];
      // 若未传入审批人列表，从已取消节点中查询
      if (approverIds.length === 0) {
        const nodeResult = await appQuery<{ user_id: number }>(
          `SELECT DISTINCT unnest(assigned_user_ids) AS user_id FROM oa_approval_nodes
           WHERE instance_id = $1 AND status = 'cancelled' AND assigned_user_ids IS NOT NULL`,
          [instanceId]
        );
        approverIds = nodeResult.rows.map(r => r.user_id);
      }
      const applicantName = String(payload.applicantName);
      if (approverIds.length > 0) {
        await notifyWithdrawn(
          {
            instanceId,
            instanceNo: instance.instance_no,
            title: instance.title,
            formTypeName,
            applicantName,
            formSchema,
            formData,
          },
          approverIds
        );
      }
      break;
    }
    case 'cc': {
      const ccUserIds = (payload.ccUserIds as number[]) || [];
      if (ccUserIds.length > 0) {
        await notifyCc(
          {
            instanceId,
            instanceNo: instance.instance_no,
            title: instance.title,
            formTypeName,
            applicantName: instance.applicant_name,
            formSchema,
            formData,
          },
          ccUserIds
        );
      }
      break;
    }
    default:
      throw new Error(`未知通知类型: ${notificationType}`);
  }
}

async function handleExecuteAutoNode(payload: Record<string, unknown>): Promise<void> {
  const instanceId = Number(payload.instanceId);
  const nodeId = Number(payload.nodeId);

  // 重新查询实例、节点和表单类型（任务执行时可能已过去一段时间）
  const instanceResult = await appQuery<
    import('./oa.types').OaInstanceRow
  >(`SELECT * FROM oa_approval_instances WHERE id = $1`, [instanceId]);
  const instance = instanceResult.rows[0];
  if (!instance) throw new Error('审批实例不存在');

  const nodeResult = await appQuery<OaNodeRow>(
    `SELECT * FROM oa_approval_nodes WHERE id = $1 AND instance_id = $2`,
    [nodeId, instanceId]
  );
  const node = nodeResult.rows[0];
  if (!node) throw new Error('自动节点不存在');

  const ftResult = await appQuery<{ code: string }>(
    `SELECT code FROM oa_form_types WHERE id = $1`,
    [instance.form_type_id]
  );
  const formType = ftResult.rows[0] ? getFormTypeByCode(ftResult.rows[0].code) : undefined;
  if (!formType) {
    throw new Error('未找到表单类型定义');
  }

  // auto 节点需要 onApproved 回调，cc 节点不需要
  if (node.node_type === 'auto' && !formType.onApproved) {
    throw new Error('auto 节点缺少 onApproved 回调');
  }

  const formData = (instance.form_data || {}) as Record<string, unknown>;
  await executeAutoNodeCallback(instanceId, node, formType, instance, formData);
}
