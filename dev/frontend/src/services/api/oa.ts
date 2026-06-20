/**
 * OA API 服务
 * @module services/api/oa
 */

import request, { requestFormData } from './request';
import type { RcFile } from 'antd/es/upload/interface';
import {
  FormTypeDefinition,
  FormCategory,
  ApprovalInstance,
  ApprovalDetail,
  ApprovalStats,
  ApprovalListParams,
  SubmitApprovalRequest,
  ApprovalActionRequest,
  ViewMode,
  WorkflowNodeDef,
  HandoverScanResult,
  HandoverExecuteRequest,
  HandoverExecuteResult,
  HandoverHistoryItem,
} from '@/types/oa';

// =====================================================
// 表单类型接口
// =====================================================

/**
 * 获取所有表单类型
 */
export async function getFormTypes(): Promise<{ data: FormTypeDefinition[] }> {
  const res = await request<FormTypeDefinition[]>(
    '/oa/form-types'
  );
  return { data: res };
}

/**
 * 获取按分类分组的表单类型
 */
export async function getFormTypesGrouped(): Promise<{ data: Record<FormCategory, FormTypeDefinition[]> }> {
  const res = await request<Record<FormCategory, FormTypeDefinition[]>>(
    '/oa/form-types/grouped'
  );
  return { data: res };
}

/**
 * 获取单个表单类型
 */
export async function getFormType(code: string): Promise<{ data: FormTypeDefinition }> {
  const res = await request<FormTypeDefinition>(
    `/oa/form-types/${code}`
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
 * 预解析表单类型的审批人（发起流程时预览用）
 */
export async function previewApprovers(code: string): Promise<{ data: PreviewApprover[] }> {
  const res = await request<PreviewApprover[]>(
    `/oa/form-types/${code}/preview-approvers`
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
    `/oa/form-types/${code}/preview-workflow`,
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
  const res = await request<ApprovalListResponse>('/oa/instances', {
    params: {
      viewMode: params.viewMode,
      formTypeCode: params.formTypeCode,
      status: params.status,
      keyword: params.keyword,
      applicantName: params.applicantName,
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
    '/oa/instances/stats'
  );
  return { data: res };
}

/**
 * 获取流程详情
 */
export async function getDetail(id: number): Promise<{ data: ApprovalDetail }> {
  const res = await request<ApprovalDetail>(
    `/oa/instances/${id}`
  );
  return { data: res };
}

/**
 * 提交审批
 */
export async function submitApproval(data: SubmitApprovalRequest): Promise<{
  data: { instanceId: number; instanceNo: string };
}> {
  const res = await request<{ instanceId: number; instanceNo: string; message: string }>('/oa/instances', {
    method: 'POST',
    body: data,
  });
  return { data: res };
}

/**
 * 同意审批
 * @returns 响应数据，status='processing' 表示自动节点正在处理
 */
export async function approve(
  instanceId: number,
  data?: { comment?: string; inputData?: Record<string, unknown> }
): Promise<{ status?: string } | null> {
  return request<{ status?: string } | null>(
    `/oa/instances/${instanceId}/approve`,
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
    `/oa/instances/${instanceId}/reject`,
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
    `/oa/instances/${instanceId}/transfer`,
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
    `/oa/instances/${instanceId}/countersign`,
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
    `/oa/instances/${instanceId}/withdraw`,
    {
      method: 'POST',
    }
  );
}

/**
 * 添加评论（独立评论，不执行审批动作）
 */
export async function addComment(
  instanceId: number,
  data: { comment: string }
): Promise<void> {
  await request<{ success: boolean; message: string }>(
    `/oa/instances/${instanceId}/comment`,
    { method: 'POST', body: data }
  );
}

/** 标记抄送已读 */
export async function markCcRead(instanceId: number): Promise<void> {
  await request<{ success: boolean; message: string }>(
    `/oa/instances/${instanceId}/cc-read`,
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
    '/oa/data',
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
    '/oa/data/export',
    { params }
  );
  return { data: res };
}

// =====================================================
// ERP 参考数据接口
// =====================================================

export type ErpReferenceType = 'assets' | 'departments' | 'staff' | 'payment-accounts' | 'asset-categories' | 'customers' | 'settlement-orders' | 'grades' | 'groups' | 'areas' | 'suppliers' | 'prepayments' | 'supplier-incomes' | 'purchase-orders';

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
  // ERP 参考数据 API 的参数名由后端定义（如 consumerId），不做 camelCase→snake_case 转换，
  // 否则 consumerId 会被转为 consumer_id，后端无法识别导致返回 400
  const res = await request<unknown[]>(
    `/oa/erp-reference/${type}`,
    { params, signal, skipParamsSnakeCase: true }
  );
  return res;
}

/** 结算单分页查询参数 */
export interface SettlementOrdersPagedParams {
  consumerId: string | number;
  keyword?: string;
  page: number;
  pageSize: number;
  signal?: AbortSignal;
}

/** 结算单分页查询结果 */
export interface SettlementOrdersPagedResult {
  records: unknown[];
  total: number;
}

/**
 * 分页查询结算单
 * 用于客户授信申请的压单结算单选择器
 */
export async function getSettlementOrdersPaged(
  params: SettlementOrdersPagedParams
): Promise<SettlementOrdersPagedResult> {
  const { consumerId, keyword, page, pageSize, signal } = params;
  // ERP 参考数据 API 的参数名由后端定义（如 consumerId、pageSize），不做 camelCase→snake_case 转换
  const res = await request<SettlementOrdersPagedResult>(
    '/oa/erp-reference/settlement-orders',
    {
      params: {
        consumerId: String(consumerId),
        keyword: keyword || undefined,
        page,
        pageSize,
      },
      signal,
      skipParamsSnakeCase: true,
    }
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
  // ERP 参考数据 API 的参数名由后端定义，不做 camelCase→snake_case 转换
  const res = await request<ErpResolvedItem[]>(
    `/oa/erp-reference/${type}/resolve`,
    { params, skipParamsSnakeCase: true }
  );
  return res;
}

/**
 * 重试失败的ERP操作
 */
export async function retryErpOperation(instanceId: number): Promise<void> {
  await request<{ success: boolean; message: string }>(
    `/oa/instances/${instanceId}/retry-erp`,
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
  const urls = await requestFormData<{ urls: string[] }>(
    '/oa/upload-license',
    formData,
  );
  return urls.urls;
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
    `/oa/erp-reference/customers/${customerId}/license-info`,
  );
  return res;
}

/**
 * 获取客户欠款总额
 * 通过 settlement API 求和 leftAmount（ERP debtAmount 字段不可靠）
 */
export async function getCustomerDebt(customerId: number): Promise<{ debtAmount: number | null }> {
  const res = await request<{ debtAmount: number | null }>(
    `/oa/erp-reference/customers/${customerId}/debt`,
  );
  return res;
}

// =====================================================
// 导出 API 对象（供页面使用）
// =====================================================

/** 获取转交候选人列表 */
export async function getTransferCandidates(): Promise<Array<{ id: number; name: string }>> {
  const res = await request<{ id: number; name: string }[]>('/oa/transfer-candidates');
  return res;
}

/**
 * 更新实例表单数据（操作型节点，不推进流程）
 * 将新 formData 合并到已有数据中，插入操作记录
 */
export async function updateInstance(
  instanceId: number,
  data: { formData: Record<string, unknown>; comment?: string }
): Promise<void> {
  await request<{ success: boolean; message: string }>(
    `/oa/instances/${instanceId}/update`,
    { method: 'POST', body: data }
  );
}

// =====================================================
// 节点时限接口
// =====================================================

/** 催办日志 DTO */
export interface TimeoutLogDTO {
  nodeId: number;
  instanceId: number;
  logType: 'reminder' | 'cc_supervisor' | 'manual_remind';
  recipientUserId: number | null;
  recipientUserName: string | null;
  isSupervisorCc: boolean;
  messageContent: Record<string, unknown> | null;
  createdAt: string;
}

/** 获取实例的催办/抄送日志 */
export async function getTimeoutLogs(instanceId: number): Promise<TimeoutLogDTO[]> {
  return request<TimeoutLogDTO[]>(
    `/oa/instances/${instanceId}/timeout-logs`
  );
}

/** 手动催办当前超时节点 */
export async function remindNode(instanceId: number): Promise<void> {
  await request<{ code: number; message: string }>(
    `/oa/instances/${instanceId}/remind`,
    { method: 'POST' }
  );
}

// =====================================================
// 营业执照延期补交接口
// =====================================================

/** 延期补交记录状态 */
export type LicenseDeferredStatus = 'pending' | 'reminded' | 'overdue' | 'completed';

/** 延期补交记录 DTO */
export interface LicenseDeferredRecord {
  id: number;
  oaInstanceId: number;
  customerId: number;
  customerName: string | null;
  applicantId: number;
  applicantName: string | null;
  status: LicenseDeferredStatus;
  deadline: string;
  lastReminderAt: string | null;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
  /** 计算字段: 剩余天数(未逾期时) */
  remainingDays?: number;
  /** 计算字段: 逾期天数(已逾期时) */
  overdueDays?: number;
  /** 计算字段: 累计考核金额(已逾期时) */
  penaltyAmount?: number;
}

/** 补交营业执照 */
export async function supplementLicense(
  instanceId: number,
  files: File[] | RcFile[],
  customerId: number,
): Promise<LicenseDeferredRecord> {
  const formData = new FormData();
  formData.append('customerId', String(customerId));
  files.forEach(f => formData.append('files', f));
  return requestFormData<LicenseDeferredRecord>(
    `/credit-license/${instanceId}/supplement-license`,
    formData,
  );
}

/** 根据审批实例ID查询延期补交记录 */
export async function getLicenseDeferredByInstance(
  instanceId: number,
): Promise<LicenseDeferredRecord | null> {
  const res = await request<{ code: number; data: LicenseDeferredRecord | null }>(
    `/credit-license/instance/${instanceId}`,
  );
  return (res as any).data ?? res;
}

/** 营销员查看自己的待补交列表 */
export async function getMyLicenseDeferredUploads(params: {
  page?: number;
  pageSize?: number;
  status?: LicenseDeferredStatus;
}): Promise<{ list: LicenseDeferredRecord[]; total: number }> {
  const res = await request<{ code: number; data: LicenseDeferredRecord[]; total: number }>(
    '/credit-license/my',
    { params },
  );
  return { list: (res as any).data ?? [], total: (res as any).total ?? 0 };
}

/**
 * 获取采购订单分析结果（含行项明细）
 * 在表单选中采购订单后调用，预填充 purchaseLines 表格
 */
export interface PurchaseOrderAnalysisResult {
  billId: number;
  billStr: string;
  supplierId: number;
  supplierName: string;
  warehouseName: string;
  totalAmount: number;
  purchaseLines: Array<Record<string, unknown>>;
}

export async function getPurchaseOrderAnalysis(
  billId: number,
  signal?: AbortSignal
): Promise<PurchaseOrderAnalysisResult> {
  return request<PurchaseOrderAnalysisResult>(
    `/oa/erp-reference/purchase-orders/${billId}/analysis`,
    { signal }
  );
}

export const oaApi = {
  getFormTypes,
  getFormTypesGrouped,
  getFormType,
  previewApprovers,
  previewWorkflow,
  getApprovalList,
  getStats,
  getDetail,
  submitApproval,
  approve,
  reject,
  transfer,
  countersign,
  withdraw,
  addComment,
  getDataList,
  exportData,
  getErpReference,
  resolveErpNames,
  retryErpOperation,
  uploadLicenseFiles,
  getCustomerLicenseInfo,
  getCustomerDebt,
  getTransferCandidates,
  getSettlementOrdersPaged,
  supplementLicense,
  getLicenseDeferredByInstance,
  getMyLicenseDeferredUploads,
  updateInstance,
  getTimeoutLogs,
  remindNode,
  getPurchaseOrderAnalysis,
  // 流程交接
  scanHandoverImpact,
  executeHandover,
  searchHandoverUsers,
  getHandoverHistory,
};

// =====================================================
// 流程交接接口
// =====================================================

/** 扫描交接影响范围 */
export async function scanHandoverImpact(sourceUserId: number): Promise<HandoverScanResult> {
  return request<HandoverScanResult>(`/oa/workflow-handover/scan?source_user_id=${sourceUserId}`);
}

/** 执行交接 */
export async function executeHandover(data: HandoverExecuteRequest): Promise<HandoverExecuteResult> {
  return request<HandoverExecuteResult>('/oa/workflow-handover/execute', {
    method: 'POST',
    body: data,
  });
}

/** 搜索用户（交接人员选择器） */
export async function searchHandoverUsers(keyword: string): Promise<Array<{ id: number; name: string }>> {
  return request(`/oa/workflow-handover/user-search?keyword=${encodeURIComponent(keyword)}`);
}

/** 获取交接历史 */
export async function getHandoverHistory(
  page: number = 1,
  pageSize: number = 20
): Promise<{ list: HandoverHistoryItem[]; total: number }> {
  return request(`/oa/workflow-handover/history?page=${page}&page_size=${pageSize}`);
}

// =====================================================
// 表单管理接口（管理员专用）
// =====================================================

/** 获取所有表单类型（含完整 workflowDef 和 allowedRoles） */
export async function getAdminFormTypes(): Promise<FormTypeDefinition[]> {
  return request<FormTypeDefinition[]>('/oa/admin/form-types');
}

/** 更新表单基本信息和可发起岗位 */
export async function updateAdminFormType(
  code: string,
  data: {
    name?: string;
    description?: string;
    icon?: string;
    allowedRoles?: string[];
    dataReadRoles?: string[];
    dataExportRoles?: string[];
  }
): Promise<void> {
  return request<void>(`/oa/admin/form-types/${code}`, {
    method: 'PATCH',
    body: data,
  });
}

/** 更新表单审批流程配置（含乐观锁） */
export async function updateAdminFormTypeWorkflow(
  code: string,
  workflowDef: unknown,
  version: number
): Promise<void> {
  return request<void>(`/oa/admin/form-types/${code}/workflow`, {
    method: 'PUT',
    body: { workflowDef, version },
  });
}

/** 获取系统所有岗位列表 */
export async function getAdminRoles(): Promise<Array<{ code: string; name: string; description: string }>> {
  return request('/oa/admin/roles');
}
