/**
 * 钉钉服务 - 流程中心(ProcessCentre) API 封装
 * 基于钉钉自有OA审批集成模式（fakeMode），提供模板、壳实例、待办、状态更新能力
 *
 * API 体系说明：
 * - 旧版 oapi（/topapi/*）：模板创建、壳实例创建/更新 → 使用 oapiRequest
 * - 新版 v1.0（/v1.0/workflow/*）：待办创建/更新/取消 → 使用 apiRequest + x-acs-dingtalk-access-token
 *
 * @module services/dingtalk-process-centre.service
 */

import { config } from '../config';
import { getAccessToken, apiRequest } from './dingtalk-client';

// =====================================================
// 类型定义
// =====================================================

/** 表单组件定义（用于创建模板） */
export interface ProcessFormComponent {
  componentType: string;    // 钉钉控件名，如 'TextField'、'TextareaField'
  props: {
    componentId: string;    // 组件ID，如 'TextField-xxx'
    label: string;          // 字段标签
    required?: boolean;
    placeholder?: string;
  };
}

/** 表单组件值（用于创建壳实例时传递摘要数据） */
export interface FormComponentValue {
  name: string;            // 字段名（对应模板组件的 label）
  value: string;           // 字段值
  componentType?: string;  // 控件类型，如 'TextField'
}

/** 流程中心待办任务参数 */
export interface PcTaskParam {
  userId: string;       // 钉钉企业内 userId
  url: string;          // 详情页跳转URL（需适配移动端和PC端）
  customData?: string;  // 自定义数据（可选，跳转时回传）
}

/** 流程中心待办任务状态 */
export type PcTaskStatus = 'COMPLETED' | 'CANCELED';
export type PcTaskResult = 'AGREE' | 'REFUSE';

// =====================================================
// 内部辅助
// =====================================================

/** 构建 v1.0 API 请求头（含 access token） */
async function buildHeaders(): Promise<Record<string, string>> {
  const token = await getAccessToken();
  return { 'x-acs-dingtalk-access-token': token };
}

// =====================================================
// 模板管理（v1.0 API）
// =====================================================

/**
 * 创建或更新流程中心审批模板
 * POST /v1.0/workflow/processCentres/schemas
 *
 * @param name - 模板名称（如 "其他付款申请"）
 * @param formComponents - 表单组件定义
 * @param detailUrl - 审批详情页URL（用于 TASK_EXECUTE 跳转）
 * @returns processCode - 模板编码
 */
export async function saveProcessTemplate(
  name: string,
  formComponents: ProcessFormComponent[],
  detailUrl: string
): Promise<string> {
  const headers = await buildHeaders();

  const result = await apiRequest(
    'POST',
    '/v1.0/workflow/processCentres/schemas',
    {
      name,
      formComponents,
      processFeatureConfig: {
        features: [
          {
            name: 'TASK_EXECUTE',
            runType: 'REDIRECT',
            pcUrl: detailUrl,
            mobileUrl: detailUrl,
          },
        ],
      },
    },
    headers
  );

  const processCode = result?.result?.processCode || result?.processCode;
  if (!processCode) {
    throw new Error(`[ProcessCentre] 模板创建失败: 未返回 processCode, response=${JSON.stringify(result)}`);
  }

  console.log('[ProcessCentre] 模板创建成功:', { name, processCode });
  return processCode;
}

// =====================================================
// 壳实例管理（v1.0 API）
// =====================================================

/**
 * 创建流程中心壳实例
 * POST /v1.0/workflow/processCentres/instances
 *
 * @param processCode - 模板编码
 * @param originatorUserId - 发起人的 dingtalk_user_id
 * @param formComponentValues - 表单摘要（用于钉钉展示）
 * @param url - 详情页URL
 * @returns processInstanceId - 壳实例ID
 */
export async function createWorkrecordInstance(
  processCode: string,
  originatorUserId: string,
  formComponentValues: FormComponentValue[],
  url: string
): Promise<string> {
  const headers = await buildHeaders();

  const result = await apiRequest(
    'POST',
    '/v1.0/workflow/processCentres/instances',
    {
      processCode,
      originatorUserId,
      formComponentValueList: formComponentValues.map(v => ({
        name: v.name,
        value: v.value,
        componentType: v.componentType || 'TextField',
      })),
      url,
    },
    headers
  );

  const processInstanceId = result?.result?.processInstanceId || result?.processInstanceId;
  if (!processInstanceId) {
    throw new Error(`[ProcessCentre] 壳实例创建失败: 未返回 processInstanceId, response=${JSON.stringify(result)}`);
  }

  console.log('[ProcessCentre] 壳实例创建成功:', { processCode, processInstanceId });
  return processInstanceId;
}

/**
 * 更新壳实例状态（审批终态时调用）
 * PUT /v1.0/workflow/processCentres/instances
 *
 * @param processInstanceId - 壳实例ID
 * @param status - 'COMPLETED' | 'TERMINATED'
 * @param result - 'agree' | 'refuse'
 */
export async function updateWorkrecordStatus(
  processInstanceId: string,
  status: 'COMPLETED' | 'TERMINATED',
  result: 'agree' | 'refuse'
): Promise<void> {
  const headers = await buildHeaders();

  const apiResult = await apiRequest(
    'PUT',
    '/v1.0/workflow/processCentres/instances',
    { processInstanceId, status, result },
    headers
  );

  if (!apiResult?.success) {
    throw new Error(`[ProcessCentre] 壳实例状态更新失败: ${JSON.stringify(apiResult)}`);
  }

  console.log('[ProcessCentre] 壳实例状态更新成功:', { processInstanceId, status, result });
}

// =====================================================
// 待办任务管理（新版 v1.0 API）
// =====================================================

/**
 * 创建流程中心待办任务
 * POST /v1.0/workflow/processCentres/tasks
 *
 * @param processInstanceId - 壳实例ID
 * @param activityId - 待办组ID（自定义，用于批量取消），格式建议：{instanceId}:node{nodeOrder}
 * @param tasks - 待办任务列表
 * @returns taskId[] - 创建成功的任务ID列表
 */
export async function createPcTasks(
  processInstanceId: string,
  activityId: string,
  tasks: PcTaskParam[]
): Promise<number[]> {
  const headers = await buildHeaders();

  const result = await apiRequest(
    'POST',
    '/v1.0/workflow/processCentres/tasks',
    {
      processInstanceId,
      activityId,
      tasks,
    },
    headers
  );

  if (!result?.success) {
    throw new Error(`[ProcessCentre] 待办创建失败: ${JSON.stringify(result)}`);
  }

  const taskIds: number[] = (result.result || []).map((t: { taskId: number }) => t.taskId);
  console.log('[ProcessCentre] 待办创建成功:', { processInstanceId, activityId, taskCount: taskIds.length });
  return taskIds;
}

/**
 * 更新流程中心待办任务状态
 * PUT /v1.0/workflow/processCentres/tasks
 *
 * @param processInstanceId - 壳实例ID
 * @param tasks - 任务状态列表
 */
export async function updatePcTaskStatus(
  processInstanceId: string,
  tasks: Array<{ taskId: number; status: PcTaskStatus; result?: PcTaskResult }>
): Promise<void> {
  const headers = await buildHeaders();

  const result = await apiRequest(
    'PUT',
    '/v1.0/workflow/processCentres/tasks',
    { processInstanceId, tasks },
    headers
  );

  if (!result?.success) {
    throw new Error(`[ProcessCentre] 待办状态更新失败: ${JSON.stringify(result)}`);
  }

  console.log('[ProcessCentre] 待办状态更新成功:', { processInstanceId, count: tasks.length });
}

/**
 * 批量取消流程中心待办任务
 * POST /v1.0/workflow/processCentres/tasks/cancel
 *
 * @param processInstanceId - 壳实例ID
 * @param activityId - 主待办组ID（必填）
 * @param activityIds - 额外待办组ID列表（可选）
 */
export async function cancelPcTasks(
  processInstanceId: string,
  activityId: string,
  activityIds?: string[]
): Promise<void> {
  const headers = await buildHeaders();

  const body: Record<string, unknown> = { processInstanceId, activityId };
  if (activityIds && activityIds.length > 0) {
    body.activityIds = activityIds;
  }

  const result = await apiRequest(
    'POST',
    '/v1.0/workflow/processCentres/tasks/cancel',
    body,
    headers
  );

  if (!result?.success) {
    throw new Error(`[ProcessCentre] 待办批量取消失败: ${JSON.stringify(result)}`);
  }

  console.log('[ProcessCentre] 待办批量取消成功:', { processInstanceId, activityId, activityIds });
}
