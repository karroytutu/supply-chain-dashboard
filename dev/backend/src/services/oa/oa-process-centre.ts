/**
 * OA - 钉钉流程中心(ProcessCentre)业务逻辑
 * 替代旧版 oa-todo.ts，管理壳实例创建和流程中心待办的全生命周期
 *
 * 错误处理：各环节失败时记录日志，不阻塞审批流程
 * - 模板/壳实例创建失败 → oa_process_instance_mapping status='failed'，待办跳过
 * - 待办创建/更新/取消失败 → 记录日志，不影响审批
 *
 * @module services/oa/oa-process-centre
 */
import { createLogger } from '../../utils/logger';
const log = createLogger('OA');

import { appQuery as query } from '../../db/appPool';
import { config } from '../../config';
import type { PoolClient } from 'pg';
import {
  saveProcessTemplate,
  createWorkrecordInstance,
  createPcTasks,
  updatePcTaskStatus,
  cancelPcTasks,
  updateWorkrecordStatus,
  ProcessFormComponent,
  FormComponentValue,
} from '../dingtalk-process-centre.service';
import { extractFormSummary } from './oa-form-summary';
import { getFormTypeByCode } from './form-types';
import type { FormSchema } from './oa.types';
import {
  OA_PC_ACTIVITY_ID_SEPARATOR,
  DINGTALK_PROCESS_TEMPLATE_PREFIX,
  CACHE_TTL_OA_PROCESS_CODE,
} from '../../utils/constants';
import { withAdvisoryLock } from '../../utils/distributed-lock';

// =====================================================
// 模板管理（Lazy Init + 内存缓存）
// =====================================================

/** processCode 内存缓存：formTypeCode → { processCode, expiredAt } */
const processCodeCache = new Map<string, { code: string; expiredAt: number }>();

/** 清空模板缓存（仅供测试使用） */
export function _clearProcessCodeCache(): void {
  processCodeCache.clear();
}

/** 获取缓存的 processCode（带 TTL 校验） */
function getCachedProcessCode(formTypeCode: string): string | undefined {
  const cached = processCodeCache.get(formTypeCode);
  if (!cached) return undefined;
  if (Date.now() > cached.expiredAt) {
    processCodeCache.delete(formTypeCode);
    return undefined;
  }
  return cached.code;
}

/** 设置缓存的 processCode */
function setProcessCodeCache(formTypeCode: string, processCode: string): void {
  processCodeCache.set(formTypeCode, {
    code: processCode,
    expiredAt: Date.now() + CACHE_TTL_OA_PROCESS_CODE,
  });
}

/**
 * 获取或创建钉钉流程中心模板 processCode
 * 优先从内存缓存 → 数据库 → 钉钉API 依次获取
 */
async function getOrCreateProcessCode(formTypeCode: string, formTypeName: string): Promise<string> {
  // L1: 内存缓存（TTL 5 分钟）
  const cached = getCachedProcessCode(formTypeCode);
  if (cached) return cached;

  // L2: 数据库（唯一可信源）
  const dbResult = await query<{ dingtalk_process_code: string }>(
    `SELECT dingtalk_process_code FROM oa_process_template_mapping
     WHERE form_type_code = $1`,
    [formTypeCode]
  );
  if (dbResult.rows.length > 0) {
    const code = dbResult.rows[0].dingtalk_process_code;
    setProcessCodeCache(formTypeCode, code);
    return code;
  }

  // L3: 钉钉API创建（使用 PostgreSQL advisory lock 防止多实例并发）
  return withAdvisoryLock(`oa:template:${formTypeCode}`, async (client) => {
    // 锁内再次检查数据库（其他进程可能已创建），使用锁所在事务的 client
    const dbResult2 = await client.query<{ dingtalk_process_code: string }>(
      `SELECT dingtalk_process_code FROM oa_process_template_mapping
       WHERE form_type_code = $1`,
      [formTypeCode]
    );
    if (dbResult2.rows.length > 0) {
      const code = dbResult2.rows[0].dingtalk_process_code;
      setProcessCodeCache(formTypeCode, code);
      return code;
    }
    return createAndSaveTemplate(formTypeCode, formTypeName, client);
  });
}

/**
 * 调用钉钉API创建模板并保存到数据库
 * @param client - advisory lock 事务的 client，确保 DB 写入在锁事务内完成
 */
async function createAndSaveTemplate(
  formTypeCode: string,
  formTypeName: string,
  client: PoolClient
): Promise<string> {
  // 构建简单的模板组件（仅用于钉钉展示摘要，不需要还原完整表单）
  const formComponents: ProcessFormComponent[] = [
    {
      componentType: 'TextField',
      props: {
        componentId: 'TextField-title',
        label: '标题',
        required: true,
        placeholder: '请输入',
      },
    },
    {
      componentType: 'TextareaField',
      props: { componentId: 'TextareaField-summary', label: '摘要', placeholder: '请输入' },
    },
  ];

  // detailUrl 用于 processFeatureConfig 的 TASK_EXECUTE 跳转
  const detailUrl = `${config.dingtalk.baseUrl}/oa/detail`;

  const templateName = `${DINGTALK_PROCESS_TEMPLATE_PREFIX}-${formTypeName}`;

  const processCode = await saveProcessTemplate(templateName, formComponents, detailUrl);

  // 保存到数据库（使用锁事务的 client，确保 INSERT 在 advisory lock 事务内提交）
  await client.query(
    `INSERT INTO oa_process_template_mapping (form_type_code, dingtalk_process_code, template_name)
     VALUES ($1, $2, $3)
     ON CONFLICT (form_type_code) DO UPDATE SET
       dingtalk_process_code = EXCLUDED.dingtalk_process_code,
       updated_at = NOW()`,
    [formTypeCode, processCode, templateName]
  );

  setProcessCodeCache(formTypeCode, processCode);
  return processCode;
}

// =====================================================
// 辅助函数
// =====================================================

/**
 * 查询用户系统ID对应的 dingtalk_user_id
 */
async function getDingtalkUserId(userId: number): Promise<string | null> {
  const result = await query<{ dingtalk_user_id: string | null }>(
    `SELECT dingtalk_user_id FROM users WHERE id = $1 AND dingtalk_user_id IS NOT NULL`,
    [userId]
  );
  return result.rows[0]?.dingtalk_user_id ?? null;
}

/**
 * 构建 activityId
 * 格式：{instanceId}:node{nodeOrder}，同一节点含加签人共享
 */
function buildActivityId(instanceId: number, nodeOrder: number): string {
  return `${instanceId}${OA_PC_ACTIVITY_ID_SEPARATOR}node${nodeOrder}`;
}

/**
 * 构建详情页URL
 * @param baseUrlOverride - 可选，覆盖 config.dingtalk.baseUrl（应急用途）
 */
function buildDetailUrl(instanceId: number, baseUrlOverride?: string): string {
  const baseUrl = baseUrlOverride || config.dingtalk.baseUrl;
  return `${baseUrl}/oa/detail/${instanceId}`;
}

/**
 * 将表单摘要转换为钉钉 formComponentValues
 */
function buildFormComponentValues(
  title: string,
  formSchema?: FormSchema,
  formData?: Record<string, unknown>
): FormComponentValue[] {
  const rows = extractFormSummary(formSchema, formData);
  const values: FormComponentValue[] = [{ name: '标题', value: title }];
  if (rows.length > 0) {
    values.push({
      name: '摘要',
      value: rows
        .slice(0, 3)
        .map(r => `${r.key}: ${r.value}`)
        .join('，'),
    });
  }
  return values;
}

/**
 * 获取壳实例映射（仅返回 active 状态的记录）
 */
async function getActiveInstanceMapping(
  instanceId: number
): Promise<{ dingtalk_process_instance_id: string } | null> {
  const result = await query<{ dingtalk_process_instance_id: string }>(
    `SELECT dingtalk_process_instance_id FROM oa_process_instance_mapping
     WHERE instance_id = $1 AND status = 'active' AND dingtalk_process_instance_id IS NOT NULL`,
    [instanceId]
  );
  return result.rows[0] ?? null;
}

// =====================================================
// 壳实例管理
// =====================================================

/**
 * 创建钉钉流程中心壳实例
 * 在 submitApproval 事务提交后调用
 *
 * 失败时不抛出异常，记录 failed 状态到映射表
 */
export async function createProcessInstance(
  instanceId: number,
  formTypeCode: string,
  formTypeName: string,
  applicantUserId: number,
  title: string,
  formSchema?: FormSchema,
  formData?: Record<string, unknown>,
  baseUrlOverride?: string
): Promise<void> {
  try {
    const processCode = await getOrCreateProcessCode(formTypeCode, formTypeName);
    const originatorUserId = await getDingtalkUserId(applicantUserId);

    if (!originatorUserId) {
      log.info('跳过壳实例创建: 申请人无 dingtalk_user_id', { instanceId });
      await query(
        `INSERT INTO oa_process_instance_mapping (instance_id, dingtalk_process_code, status)
         VALUES ($1, $2, 'failed')
         ON CONFLICT (instance_id) DO UPDATE SET status = 'failed', updated_at = NOW()`,
        [instanceId, processCode]
      );
      return;
    }

    const formComponentValues = buildFormComponentValues(title, formSchema, formData);
    const url = buildDetailUrl(instanceId, baseUrlOverride);

    const processInstanceId = await createWorkrecordInstance(
      processCode,
      originatorUserId,
      formComponentValues,
      url
    );

    await query(
      `INSERT INTO oa_process_instance_mapping (instance_id, dingtalk_process_instance_id, dingtalk_process_code, status, originator_user_id)
       VALUES ($1, $2, $3, 'active', $4)
       ON CONFLICT (instance_id) DO UPDATE SET
         dingtalk_process_instance_id = EXCLUDED.dingtalk_process_instance_id,
         status = 'active',
         updated_at = NOW()`,
      [instanceId, processInstanceId, processCode, originatorUserId]
    );
  } catch (error: any) {
    log.error('创建壳实例失败:', { instanceId, error: error?.message });
    // 尝试记录 failed 状态（processCode 可能未知，用空字符串占位）
    await query(
      `INSERT INTO oa_process_instance_mapping (instance_id, dingtalk_process_code, status)
       VALUES ($1, '', 'failed')
       ON CONFLICT (instance_id) DO UPDATE SET status = 'failed', updated_at = NOW()`,
      [instanceId]
    ).catch((innerErr: unknown) => {
      log.error('记录 failed 状态也失败:', {
        instanceId,
        originalError: error?.message,
        innerError: (innerErr as Error)?.message,
      });
    });
  }
}

/**
 * 完成壳实例（审批终态时调用）
 * 在最后一个节点通过、拒绝、撤回时调用
 */
export async function finalizeProcessInstance(
  instanceId: number,
  result: 'agree' | 'refuse'
): Promise<void> {
  try {
    const mapping = await getActiveInstanceMapping(instanceId);
    if (!mapping) return;

    // 先调钉钉 API，成功后再更新本地状态：
    // 若钉钉失败，本地仍保持 active，异步任务/对账可再次补偿
    const pcStatus: 'COMPLETED' | 'TERMINATED' = result === 'agree' ? 'COMPLETED' : 'TERMINATED';
    await updateWorkrecordStatus(mapping.dingtalk_process_instance_id, pcStatus, result);

    const localStatus = result === 'agree' ? 'completed' : 'terminated';
    const updateResult = await query(
      `UPDATE oa_process_instance_mapping SET status = $1, updated_at = NOW()
       WHERE instance_id = $2 AND status = 'active'`,
      [localStatus, instanceId]
    );
    if (updateResult.rowCount === 0) {
      log.info('壳实例已被其他路径终结，跳过', { instanceId });
    }
  } catch (error: any) {
    log.error('更新壳实例状态失败:', { instanceId, result, error: error?.message });
    // 不更新本地状态，保持 active，等待重试/对账补偿
  }
}

// =====================================================
// 待办管理
// =====================================================

/**
 * 为审批人创建流程中心待办
 * 在 notifyPendingApproval / notifyTransferred / notifyCountersign 中调用
 *
 * 失败时不抛出异常，记录 failed 状态
 */
export async function createApprovalTodo(
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
  try {
    // 检查壳实例是否存在
    const mapping = await getActiveInstanceMapping(instanceId);
    if (!mapping) {
      log.info('跳过待办创建: 无活跃壳实例', { instanceId });
      return;
    }

    const dtUserId = await getDingtalkUserId(approverUserId);
    if (!dtUserId) {
      log.info('跳过待办创建: 审批人无 dingtalk_user_id', { instanceId, approverUserId });
      return;
    }

    const activityId = buildActivityId(instanceId, nodeOrder ?? 1);
    const url = buildDetailUrl(instanceId, baseUrlOverride);

    const taskIds = await createPcTasks(mapping.dingtalk_process_instance_id, activityId, [
      { userId: dtUserId, url },
    ]);

    // 保存映射记录
    for (const taskId of taskIds) {
      await query(
        `INSERT INTO oa_process_task_mapping (instance_id, pc_task_id, activity_id, executor_user_id, executor_dingtalk_user_id, status)
         VALUES ($1, $2, $3, $4, $5, 'pending')`,
        [instanceId, taskId, activityId, approverUserId, dtUserId]
      );
    }
  } catch (error: any) {
    log.error('创建待办失败:', { instanceId, approverUserId, error: error?.message });
    await query(
      `INSERT INTO oa_process_task_mapping (instance_id, pc_task_id, activity_id, executor_user_id, executor_dingtalk_user_id, status)
       VALUES ($1, 0, '', $2, '', 'failed')`,
      [instanceId, approverUserId]
    ).catch(() => {});
  }
}

/**
 * 完成某审批人的流程中心待办
 * 在 approve / reject / transfer 后调用
 */
export async function completeApprovalTodo(
  instanceId: number,
  userId: number,
  result?: 'AGREE' | 'REFUSE'
): Promise<void> {
  try {
    const mapping = await getActiveInstanceMapping(instanceId);
    if (!mapping) return;

    const taskResult = await query<{ pc_task_id: number }>(
      `SELECT pc_task_id FROM oa_process_task_mapping
       WHERE instance_id = $1 AND executor_user_id = $2 AND status = 'pending'`,
      [instanceId, userId]
    );

    if (taskResult.rows.length === 0) return;

    const tasks = taskResult.rows.map(row => ({
      taskId: row.pc_task_id,
      status: 'COMPLETED' as const,
      result,
    }));

    await updatePcTaskStatus(mapping.dingtalk_process_instance_id, tasks);

    await query(
      `UPDATE oa_process_task_mapping SET status = 'completed', result = $1, completed_at = NOW()
       WHERE instance_id = $2 AND executor_user_id = $3 AND status = 'pending'`,
      [result || null, instanceId, userId]
    );
  } catch (error: any) {
    log.error('完成待办失败:', { instanceId, userId, error: error?.message });
  }
}

/**
 * 取消某审批实例下所有待处理的流程中心待办
 * 在撤回 / 拒绝场景调用，使用批量取消 API
 */
export async function completeAllPendingTodos(
  instanceId: number,
  instanceResult?: 'agree' | 'refuse'
): Promise<void> {
  try {
    const mapping = await getActiveInstanceMapping(instanceId);
    if (!mapping) return;

    // 获取所有 pending 状态的 activityId
    const activityResult = await query<{ activity_id: string }>(
      `SELECT DISTINCT activity_id FROM oa_process_task_mapping
       WHERE instance_id = $1 AND status = 'pending' AND activity_id != ''`,
      [instanceId]
    );

    if (activityResult.rows.length > 0) {
      const activityIds = activityResult.rows.map(r => r.activity_id);
      const primaryActivityId = activityIds[0];
      const restActivityIds = activityIds.slice(1);

      await cancelPcTasks(
        mapping.dingtalk_process_instance_id,
        primaryActivityId,
        restActivityIds.length > 0 ? restActivityIds : undefined
      );
    }

    // 更新本地映射状态
    await query(
      `UPDATE oa_process_task_mapping SET status = 'canceled', completed_at = NOW()
       WHERE instance_id = $1 AND status = 'pending'`,
      [instanceId]
    );

    // 同时更新壳实例状态：先调钉钉 API，成功后再更新本地
    if (instanceResult) {
      try {
        const pcStatus: 'COMPLETED' | 'TERMINATED' =
          instanceResult === 'agree' ? 'COMPLETED' : 'TERMINATED';
        await updateWorkrecordStatus(
          mapping.dingtalk_process_instance_id,
          pcStatus,
          instanceResult
        );

        const localStatus = instanceResult === 'agree' ? 'completed' : 'terminated';
        const updateResult = await query(
          `UPDATE oa_process_instance_mapping SET status = $1, updated_at = NOW()
           WHERE instance_id = $2 AND status = 'active'`,
          [localStatus, instanceId]
        );
        if (updateResult.rowCount === 0) {
          log.info('壳实例已被其他路径终结，跳过', { instanceId });
        }
      } catch (err: any) {
        log.error('批量取消待办时更新壳实例状态失败:', {
          instanceId,
          instanceResult,
          error: err?.message,
        });
        // 保持本地 active，等待重试/对账补偿
      }
    }
  } catch (error: any) {
    log.error('批量取消待办失败:', { instanceId, error: error?.message });
  }
}

/**
 * 对账：扫描壳实例与 OA 实例状态不一致的记录，双向补偿
 * 每 30 分钟执行一次，兜底钉钉 API 失败导致的状态不一致
 *
 * 正向对账：壳 active + OA 终态 → 补偿关闭壳
 * 反向对账：壳 completed/terminated + OA 仍在途 → 重建壳 + 补建当前节点待办
 */
export async function reconcileProcessInstanceStatus(): Promise<{ processed: number; failed: number }> {
  let processed = 0;
  let failed = 0;

  try {
    // =====================================================
    // 正向对账：壳 active + OA 终态 → 补偿关闭壳
    // =====================================================
    const forwardResult = await query<{
      instance_id: number;
      status: string;
    }>(
      `SELECT m.instance_id, i.status
       FROM oa_process_instance_mapping m
       JOIN oa_approval_instances i ON i.id = m.instance_id
       WHERE m.status = 'active'
         AND i.status IN ('approved', 'rejected', 'withdrawn', 'cancelled')
         AND m.updated_at < NOW() - interval '30 minutes'
       LIMIT 100`
    );

    for (const row of forwardResult.rows) {
      try {
        const resultType = row.status === 'approved' ? 'agree' : 'refuse';
        await finalizeProcessInstance(row.instance_id, resultType);
        processed++;
      } catch (err: any) {
        failed++;
        log.error('壳实例正向对账失败:', {
          instanceId: row.instance_id,
          error: err?.message,
        });
      }
    }

    // =====================================================
    // 反向对账：壳 completed/terminated + OA 仍在途 → 重建壳 + 补建待办
    // =====================================================
    const reverseResult = await query<{
      instance_id: number;
      instance_no: string;
      title: string;
      form_type_code: string;
      form_type_name: string;
      applicant_id: number;
      applicant_name: string;
      current_node_order: number;
      form_data: Record<string, unknown>;
    }>(
      `SELECT m.instance_id, i.instance_no, i.title,
              ft.code as form_type_code, ft.name as form_type_name,
              i.applicant_id, i.applicant_name,
              i.current_node_order, i.form_data
       FROM oa_process_instance_mapping m
       JOIN oa_approval_instances i ON i.id = m.instance_id
       JOIN oa_form_types ft ON ft.id = i.form_type_id
       WHERE m.status IN ('completed', 'terminated')
         AND i.status IN ('pending', 'processing')
         AND m.updated_at < NOW() - interval '30 minutes'
       LIMIT 100`
    );

    // 钉钉 API 熔断：连续失败达 5 次时提前终止，避免在钉钉降级时持续施压
    let consecutiveFailures = 0;

    for (const row of reverseResult.rows) {
      try {
        log.info('反向对账: 重建壳实例', { instanceId: row.instance_id });

        // 0. 清理旧 pending task_mapping，避免旧 pc_task_id 与新壳实例冲突
        await query(
          `UPDATE oa_process_task_mapping SET status = 'canceled', completed_at = NOW()
           WHERE instance_id = $1 AND status = 'pending'`,
          [row.instance_id]
        );

        // 1. 从代码级定义获取表单结构（DB 中的 form_schema 已被迁移 110 废弃清空）
        const formType = getFormTypeByCode(row.form_type_code);
        const formSchema = formType?.formSchema;

        // 2. 重建壳实例（createProcessInstance 内部会 UPSERT mapping 为 active）
        await createProcessInstance(
          row.instance_id,
          row.form_type_code,
          row.form_type_name,
          row.applicant_id,
          row.title,
          formSchema,
          row.form_data
        );

        // 3. 验证壳实例是否成功创建为 active（createProcessInstance 内部 catch 不抛异常）
        const mappingCheck = await query<{ status: string }>(
          `SELECT status FROM oa_process_instance_mapping WHERE instance_id = $1`,
          [row.instance_id]
        );
        if (mappingCheck.rows[0]?.status !== 'active') {
          log.warn('反向对账: 壳实例重建失败，跳过待办补建', {
            instanceId: row.instance_id,
            mappingStatus: mappingCheck.rows[0]?.status,
          });
          failed++;
          consecutiveFailures++;
          if (consecutiveFailures >= 5) {
            log.error('反向对账: 连续钉钉失败达 5 次，提前终止', { consecutiveFailures });
            break;
          }
          continue;
        }

        // 4. 获取当前 pending 的人工节点，补建钉钉待办
        const pendingNodeResult = await query<{
          assigned_user_ids: number[] | null;
          node_order: number;
        }>(
          `SELECT DISTINCT ON (node_order) assigned_user_ids, node_order
           FROM oa_approval_nodes
           WHERE instance_id = $1
             AND status = 'pending'
             AND node_type IN ('approval', 'handle')
           ORDER BY node_order, round DESC
           LIMIT 1`,
          [row.instance_id]
        );

        if (pendingNodeResult.rows.length > 0) {
          const node = pendingNodeResult.rows[0];
          const approverIds = node.assigned_user_ids ?? [];
          for (const approverId of approverIds) {
            await createApprovalTodo(
              row.instance_id,
              row.instance_no,
              row.title,
              row.form_type_name,
              row.applicant_name,
              approverId,
              formSchema,
              row.form_data,
              node.node_order
            );
          }
        }

        processed++;
        consecutiveFailures = 0; // 成功时重置连续失败计数
      } catch (err: any) {
        failed++;
        consecutiveFailures++;
        log.error('壳实例反向对账失败:', {
          instanceId: row.instance_id,
          error: err?.message,
        });
        if (consecutiveFailures >= 5) {
          log.error('反向对账: 连续钉钉失败达 5 次，提前终止', { consecutiveFailures });
          break;
        }
      }
    }

    if (processed > 0 || failed > 0) {
      log.info('壳实例状态对账完成:', { processed, failed });
    }
    return { processed, failed };
  } catch (error: any) {
    log.error('壳实例状态对账异常:', { error: error?.message });
    throw error; // 向上抛出异常，让 scheduler 感知并记录错误，避免静默失败
  }
}
