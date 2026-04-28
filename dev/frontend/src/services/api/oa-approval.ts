/**
 * OA审批 API 服务
 * @module services/api/oa-approval
 */

import request, { requestFormData } from './request';
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
  WorkflowNodeDef,
} from '@/types/oa-approval';

// =====================================================
// 表单类型接口
// =====================================================

/**
 * 获取所有表单类型
 */
export async function getFormTypes(): Promise<{ data: FormTypeDefinition[] }> {
  const res = await request<FormTypeDefinition[]>(
    '/oa-approval/form-types'
  );
  return { data: res };
}

/**
 * 获取按分类分组的表单类型
 */
export async function getFormTypesGrouped(): Promise<{ data: Record<FormCategory, FormTypeDefinition[]> }> {
  const res = await request<Record<FormCategory, FormTypeDefinition[]>>(
    '/oa-approval/form-types/grouped'
  );
  return { data: res };
}

/**
 * 获取单个表单类型
 */
export async function getFormType(code: string): Promise<{ data: FormTypeDefinition }> {
  const res = await request<FormTypeDefinition>(
    `/oa-approval/form-types/${code}`
  );
  return { data: res };
}

/** 预解析审批人结果 */
export interface PreviewApprover {
  nodeOrder: number;
  approverId: number | null;
  approverName: string | null;
  approverAvatar: string | null;
}

/**
 * 预解析表单类型的审批人（发起审批时预览用）
 */
export async function previewApprovers(code: string): Promise<{ data: PreviewApprover[] }> {
  const res = await request<PreviewApprover[]>(
    `/oa-approval/form-types/${code}/preview-approvers`
  );
  return { data: res };
}

/** 动态流程预览结果 */
export interface WorkflowPreviewResult {
  visibleNodes: WorkflowNodeDef[];
  approvers: PreviewApprover[];
}

/**
 * 动态流程预览（根据表单数据实时计算可见节点和审批人）
 * 用于表单填写阶段的流程预览，随着用户输入动态更新
 */
export async function previewWorkflow(
  code: string,
  formData: Record<string, unknown>
): Promise<WorkflowPreviewResult> {
  const res = await request<WorkflowPreviewResult>(
    `/oa-approval/form-types/${code}/preview-workflow`,
    { method: 'POST', body: { formData } }
  );
  return res;
}

// =====================================================
// 审批实例接口
// =====================================================

interface ApprovalListResponse {
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
  const res = await request<ApprovalStats>(
    '/oa-approval/instances/stats'
  );
  return { data: res };
}

/**
 * 获取审批详情
 */
export async function getDetail(id: number): Promise<{ data: ApprovalDetail }> {
  const res = await request<ApprovalDetail>(
    `/oa-approval/instances/${id}`
  );
  return { data: res };
}

/**
 * 获取审批节点
 */
export async function getNodes(instanceId: number): Promise<{ data: ApprovalNode[] }> {
  const res = await request<ApprovalNode[]>(
    `/oa-approval/instances/${instanceId}/nodes`
  );
  return { data: res };
}

/**
 * 获取审批操作记录
 */
export async function getActions(instanceId: number): Promise<{ data: ApprovalAction[] }> {
  const res = await request<ApprovalAction[]>(
    `/oa-approval/instances/${instanceId}/actions`
  );
  return { data: res };
}

/**
 * 提交审批
 */
export async function submitApproval(data: SubmitApprovalRequest): Promise<{
  data: { instanceId: number; instanceNo: string };
}> {
  const res = await request<{ instanceId: number; instanceNo: string; message: string }>('/oa-approval/instances', {
    method: 'POST',
    body: data,
  });
  return { data: res };
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
  const res = await request<{ list: ApprovalInstance[]; total: number }>(
    '/oa-approval/data',
    { params }
  );
  return { data: res };
}

/**
 * 导出数据
 */
export async function exportData(
  params: DataListParams & { exportType: 'excel' | 'pdf' | 'print' }
): Promise<{ data: { url?: string; html?: string } }> {
  const res = await request<{ url?: string; html?: string }>(
    '/oa-approval/data/export',
    { params }
  );
  return { data: res };
}

// =====================================================
// 站内消息接口
// =====================================================

interface MessageListResponse {
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
  const res = await request<{ count: number }>(
    '/oa-approval/messages/unread-count'
  );
  return { count: res.count };
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
// ERP 参考数据接口
// =====================================================

export type ErpReferenceType = 'assets' | 'departments' | 'staff' | 'payment-accounts' | 'asset-categories' | 'customers' | 'settlement-orders';

/** ERP ID 解析结果项 */
export interface ErpResolvedItem {
  id: number;
  label: string;
}

/**
 * 获取ERP参考数据
 * 用于表单中 asset_search、erp_department、erp_customer 等字段类型的数据源
 */
export async function getErpReference(
  type: ErpReferenceType,
  keyword?: string,
  extraParams?: Record<string, string>,
  signal?: AbortSignal
): Promise<unknown[]> {
  const params: Record<string, string> = {};
  if (keyword) {
    params.keyword = keyword;
  }
  if (extraParams) {
    Object.assign(params, extraParams);
  }
  const res = await request<unknown[]>(
    `/oa-approval/erp-reference/${type}`,
    { params, signal }
  );
  return res;
}

/**
 * 解析 ERP ID → 名称
 * 用于详情页将存储的 ERP ID 解析为可读标签
 */
export async function resolveErpNames(
  type: ErpReferenceType,
  ids: number[],
  extraParams?: Record<string, string>
): Promise<ErpResolvedItem[]> {
  const params: Record<string, string> = { ids: ids.join(',') };
  if (extraParams) {
    Object.assign(params, extraParams);
  }
  const res = await request<ErpResolvedItem[]>(
    `/oa-approval/erp-reference/${type}/resolve`,
    { params }
  );
  return res;
}

/**
 * 重试失败的ERP操作
 */
export async function retryErpOperation(instanceId: number): Promise<void> {
  await request<{ success: boolean; message: string }>(
    `/oa-approval/instances/${instanceId}/retry-erp`,
    { method: 'POST' }
  );
}

/**
 * 上传客户营业执照照片（支持多文件）
 * 先于表单提交调用，将 File 对象上传到服务器，获取 URL 后存入表单数据
 */
export async function uploadLicenseFiles(files: File[]): Promise<string[]> {
  const formData = new FormData();
  files.forEach(f => formData.append('files', f));
  // requestFormData 返回原始 JSON 响应 { code, data: { urls } }
  const res = await requestFormData<{ code: number; data: { urls: string[] } }>(
    '/oa-approval/upload-license',
    formData,
  );
  return res.data.urls;
}

/** 客户营业执照信息 */
export interface CustomerLicenseInfo {
  hasLicense: boolean;
  imageCount: number;
  attachedPicUrls: string[];
}

/**
 * 获取客户营业执照信息
 * 从 ERP 客户详情接口获取执照图片 CDN URL，供表单展示已有执照
 */
export async function getCustomerLicenseInfo(customerId: number): Promise<CustomerLicenseInfo> {
  const res = await request<CustomerLicenseInfo>(
    `/oa-approval/erp-reference/customers/${customerId}/license-info`,
  );
  return res;
}

// =====================================================
// 导出 API 对象（供页面使用）
// =====================================================

/** 获取转交候选人列表 */
export async function getTransferCandidates(): Promise<Array<{ id: number; name: string }>> {
  const res = await request<{ id: number; name: string }[]>('/oa-approval/transfer-candidates');
  return res;
}

export const oaApprovalApi = {
  getFormTypes,
  getFormTypesGrouped,
  getFormType,
  previewApprovers,
  previewWorkflow,
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
  getErpReference,
  resolveErpNames,
  retryErpOperation,
  uploadLicenseFiles,
  getCustomerLicenseInfo,
  getTransferCandidates,
};
