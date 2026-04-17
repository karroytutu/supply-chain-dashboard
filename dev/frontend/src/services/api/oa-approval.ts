/**
 * OA审批 API 服务
 * @module services/api/oa-approval
 */

import request from './request';
import {
  FormTypeDefinition,
  FormCategory,
  ApprovalInstance,
  ApprovalDetail,
  ApprovalStats,
  ApprovalListParams,
  SubmitApprovalRequest,
  ApprovalActionRequest,
  InAppMessage,
  ViewMode,
  ApprovalNode,
  ApprovalAction,
} from '@/types/oa-approval';

// =====================================================
// 表单类型接口
// =====================================================

/**
 * 获取所有表单类型
 */
export async function getFormTypes(): Promise<{ data: FormTypeDefinition[] }> {
  const res = await request<{ success: boolean; data: FormTypeDefinition[] }>(
    '/oa-approval/form-types'
  );
  return { data: res.data };
}

/**
 * 获取按分类分组的表单类型
 */
export async function getFormTypesGrouped(): Promise<{ data: Record<FormCategory, FormTypeDefinition[]> }> {
  const res = await request<{ success: boolean; data: Record<FormCategory, FormTypeDefinition[]> }>(
    '/oa-approval/form-types/grouped'
  );
  return { data: res.data };
}

/**
 * 获取单个表单类型
 */
export async function getFormType(code: string): Promise<{ data: FormTypeDefinition }> {
  const res = await request<{ success: boolean; data: FormTypeDefinition }>(
    `/oa-approval/form-types/${code}`
  );
  return { data: res.data };
}

// =====================================================
// 审批实例接口
// =====================================================

interface ApprovalListResponse {
  success: boolean;
  data: ApprovalInstance[];
  total: number;
  page: number;
  pageSize: number;
}

/**
 * 获取审批列表
 */
export async function getApprovalList(
  params: ApprovalListParams
): Promise<{ data: ApprovalInstance[]; total: number }> {
  const res = await request<ApprovalListResponse>('/oa-approval/instances', {
    params: {
      viewMode: params.viewMode,
      formTypeCode: params.formTypeCode,
      status: params.status,
      urgency: params.urgency,
      startDate: params.startDate,
      endDate: params.endDate,
      page: params.page,
      pageSize: params.pageSize,
    },
  });
  return { data: res.data, total: res.total };
}

/**
 * 获取审批统计
 */
export async function getStats(): Promise<{ data: ApprovalStats }> {
  const res = await request<{ success: boolean; data: ApprovalStats }>(
    '/oa-approval/instances/stats'
  );
  return { data: res.data };
}

/**
 * 获取审批详情
 */
export async function getDetail(id: number): Promise<{ data: ApprovalDetail }> {
  const res = await request<{ success: boolean; data: ApprovalDetail }>(
    `/oa-approval/instances/${id}`
  );
  return { data: res.data };
}

/**
 * 获取审批节点
 */
export async function getNodes(instanceId: number): Promise<{ data: ApprovalNode[] }> {
  const res = await request<{ success: boolean; data: ApprovalNode[] }>(
    `/oa-approval/instances/${instanceId}/nodes`
  );
  return { data: res.data };
}

/**
 * 获取审批操作记录
 */
export async function getActions(instanceId: number): Promise<{ data: ApprovalAction[] }> {
  const res = await request<{ success: boolean; data: ApprovalAction[] }>(
    `/oa-approval/instances/${instanceId}/actions`
  );
  return { data: res.data };
}

/**
 * 提交审批
 */
export async function submitApproval(data: SubmitApprovalRequest): Promise<{
  data: { instanceId: number; instanceNo: string };
}> {
  const res = await request<{
    success: boolean;
    data: { instanceId: number; instanceNo: string };
    message: string;
  }>('/oa-approval/instances', {
    method: 'POST',
    body: data,
  });
  return { data: res.data };
}

/**
 * 同意审批
 */
export async function approve(
  instanceId: number,
  data?: { comment?: string }
): Promise<void> {
  await request<{ success: boolean; message: string }>(
    `/oa-approval/instances/${instanceId}/approve`,
    {
      method: 'POST',
      body: data || {},
    }
  );
}

/**
 * 拒绝审批
 */
export async function reject(
  instanceId: number,
  data: { comment: string }
): Promise<void> {
  await request<{ success: boolean; message: string }>(
    `/oa-approval/instances/${instanceId}/reject`,
    {
      method: 'POST',
      body: data,
    }
  );
}

/**
 * 转交审批
 */
export async function transfer(
  instanceId: number,
  data: { transferToUserId: number; comment?: string }
): Promise<void> {
  await request<{ success: boolean; message: string }>(
    `/oa-approval/instances/${instanceId}/transfer`,
    {
      method: 'POST',
      body: data,
    }
  );
}

/**
 * 加签
 */
export async function countersign(
  instanceId: number,
  data: { countersignType: 'before' | 'after'; countersignUserIds: number[]; comment?: string }
): Promise<void> {
  await request<{ success: boolean; message: string }>(
    `/oa-approval/instances/${instanceId}/countersign`,
    {
      method: 'POST',
      body: data,
    }
  );
}

/**
 * 撤回审批
 */
export async function withdraw(instanceId: number): Promise<void> {
  await request<{ success: boolean; message: string }>(
    `/oa-approval/instances/${instanceId}/withdraw`,
    {
      method: 'POST',
    }
  );
}

// =====================================================
// 数据管理接口
// =====================================================

interface DataListParams {
  formTypeCode?: string;
  status?: string;
  startDate?: string;
  endDate?: string;
  applicantName?: string;
  keyword?: string;
  page?: number;
  pageSize?: number;
}

/**
 * 获取数据列表
 */
export async function getDataList(
  params: DataListParams
): Promise<{ data: { list: ApprovalInstance[]; total: number } }> {
  const res = await request<{ success: boolean; data: { list: ApprovalInstance[]; total: number } }>(
    '/oa-approval/data',
    { params }
  );
  return { data: res.data };
}

/**
 * 导出数据
 */
export async function exportData(
  params: DataListParams & { exportType: 'excel' | 'pdf' | 'print' }
): Promise<{ data: { url?: string; html?: string } }> {
  const res = await request<{ success: boolean; data: { url?: string; html?: string } }>(
    '/oa-approval/data/export',
    { params }
  );
  return { data: res.data };
}

// =====================================================
// 站内消息接口
// =====================================================

interface MessageListResponse {
  success: boolean;
  data: InAppMessage[];
  total: number;
  page: number;
  pageSize: number;
}

/**
 * 获取站内消息列表
 */
export async function getMessages(
  page: number = 1,
  pageSize: number = 20
): Promise<{ data: InAppMessage[]; total: number }> {
  const res = await request<MessageListResponse>('/oa-approval/messages', {
    params: { page, pageSize },
  });
  return { data: res.data, total: res.total };
}

/**
 * 获取未读消息数量
 */
export async function getUnreadMessageCount(): Promise<{ count: number }> {
  const res = await request<{ success: boolean; data: { count: number } }>(
    '/oa-approval/messages/unread-count'
  );
  return { count: res.data.count };
}

/**
 * 标记消息已读
 */
export async function markMessageRead(messageId: number): Promise<void> {
  await request<{ success: boolean; message: string }>(
    `/oa-approval/messages/${messageId}/read`,
    {
      method: 'POST',
    }
  );
}

/**
 * 标记所有消息已读
 */
export async function markAllMessagesRead(): Promise<void> {
  await request<{ success: boolean; message: string }>(
    '/oa-approval/messages/read-all',
    {
      method: 'POST',
    }
  );
}

// =====================================================
// 导出 API 对象（供页面使用）
// =====================================================

export const oaApprovalApi = {
  getFormTypes,
  getFormTypesGrouped,
  getFormType,
  getApprovalList,
  getStats,
  getDetail,
  getNodes,
  getActions,
  submitApproval,
  approve,
  reject,
  transfer,
  countersign,
  withdraw,
  getDataList,
  exportData,
  getMessages,
  getUnreadMessageCount,
  markMessageRead,
  markAllMessagesRead,
};
