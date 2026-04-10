/**
 * 催收管理模块类型定义
 * 对应数据库表: ar_collection_tasks, ar_collection_details, ar_extension_records,
 *              ar_evidence_files, ar_collection_actions, ar_legal_progress
 */

// ============================================
// 枚举/联合类型
// ============================================

/** 任务状态 */
export type TaskStatus =
  | 'collecting'
  | 'difference_processing'
  | 'extension'
  | 'escalated'
  | 'pending_verify'
  | 'verified'
  | 'closed';

/** 明细状态 */
export type DetailStatus =
  | 'pending'
  | 'pending_verify'
  | 'partial_verified'
  | 'full_verified'
  | 'extension'
  | 'difference_pending'
  | 'difference_resolved'
  | 'escalated';

/** 升级层级: 0=营销师, 1=营销主管, 2=财务 */
export type EscalationLevel = 0 | 1 | 2;

/** 优先级 */
export type Priority = 'critical' | 'high' | 'medium' | 'low';

/** 批次类型 */
export type BatchType = 'historical' | 'daily';

/** 操作类型 */
export type ActionType =
  | 'collect'
  | 'extension'
  | 'difference'
  | 'verify'
  | 'escalate'
  | 'confirm_verify'
  | 'resolve_difference'
  | 'send_notice'
  | 'file_lawsuit'
  | 'update_progress'
  | 'close'
  | 'erp_auto_closed';

/** 法律操作类型 */
export type LegalActionType = 'send_notice' | 'file_lawsuit' | 'update_progress';

/** 凭证文件类型 */
export type EvidenceFileType = 'evidence' | 'signature' | 'customer_confirm';

/** 延期记录状态 */
export type ExtensionStatus = 'active' | 'expired' | 'cancelled';

/** 操作结果 */
export type ActionResult = 'success' | 'failed' | 'pending';

/** 明细处理类型 */
export type ProcessType = 'verify' | 'extension' | 'difference';

// ============================================
// 实体接口
// ============================================

/** 催收任务(ar_collection_tasks) */
export interface CollectionTask {
  id: number;
  task_no: string;
  consumer_code: string;
  consumer_name: string | null;
  manager_user_id: number | null;
  manager_user_name: string | null;
  total_amount: number | null;
  bill_count: number;
  status: TaskStatus;
  current_handler_id: number | null;
  current_handler_role: string | null;

  // 批次信息
  batch_type: BatchType;
  batch_date: string;
  priority: Priority | null;

  // 逾期相关
  first_overdue_date: string | null;
  max_overdue_days: number;

  // 升级相关
  escalation_level: EscalationLevel;
  escalation_count: number;
  last_escalated_at: string | null;
  last_escalated_by: number | null;
  escalation_reason: string | null;

  // 延期相关
  extension_count: number;
  current_extension_id: number | null;
  extension_until: string | null;
  can_extend: boolean;

  // 催收统计
  collection_count: number;
  last_collection_at: string | null;

  created_at: string;
  updated_at: string;
}

/** 催收明细(ar_collection_details) */
export interface CollectionDetail {
  id: number;
  task_id: number;

  // 单据信息
  erp_bill_id: string | null;
  bill_type_name: string | null;
  total_amount: number | null;
  left_amount: number | null;
  bill_order_time: string | null;
  expire_time: string | null;
  overdue_days: number | null;

  // 处理状态
  status: DetailStatus;
  process_type: ProcessType | null;
  process_amount: number | null;
  process_at: string | null;
  processed_by: number | null;
  remark: string | null;

  created_at: string;
}

/** 延期记录(ar_extension_records) */
export interface ExtensionRecord {
  id: number;
  task_id: number;
  detail_ids: number[] | null;
  extension_days: number;
  extension_from: string;
  extension_until: string;

  // 凭证信息
  evidence_file_id: number | null;
  signature_url: string | null;

  // 审批信息
  status: ExtensionStatus;
  created_by: number | null;
  created_at: string;
  expired_at: string | null;
}

/** 凭证文件(ar_evidence_files) */
export interface EvidenceFile {
  id: number;
  task_id: number | null;

  // 文件信息
  file_type: EvidenceFileType;
  file_name: string | null;
  file_path: string | null;
  file_size: number | null;
  mime_type: string | null;

  // 上传信息
  uploaded_by: number | null;
  uploaded_at: string;
}

/** 操作日志(ar_collection_actions) */
export interface CollectionAction {
  id: number;
  task_id: number;
  detail_ids: number[] | null;

  // 操作信息
  action_type: ActionType;
  action_result: ActionResult | null;
  remark: string | null;

  // 操作人
  operator_id: number | null;
  operator_name: string | null;
  operator_role: string | null;

  created_at: string;
}

/** 法律催收进展(ar_legal_progress) */
export interface LegalProgress {
  id: number;
  task_id: number;
  action: LegalActionType;
  description: string | null;
  attachment_url: string | null;
  operator_id: number | null;
  created_at: string;
}

// ============================================
// 统计与摘要接口
// ============================================

/** 催收统计数据 */
export interface CollectionStats {
  total_tasks: number;
  collecting_count: number;
  difference_processing_count: number;
  extension_count: number;
  escalated_count: number;
  pending_verify_count: number;
  verified_count: number;
  closed_count: number;
  total_overdue_amount: number;
}

/** 我的待办摘要 */
export interface MyTasksSummary {
  my_collecting: number;
  my_pending_verify: number;
  my_difference_processing: number;
  my_escalated: number;
  total_amount: number;
}

// ============================================
// 请求参数接口
// ============================================

/** 任务列表查询参数 */
export interface TaskQueryParams {
  page?: number;
  page_size?: number;
  keyword?: string;
  status?: TaskStatus;
  priority?: Priority;
  escalation_level?: EscalationLevel;
  batch_type?: BatchType;
  handler_id?: number;
  start_date?: string;
  end_date?: string;
  sort_by?: string;
  sort_order?: 'asc' | 'desc';
}

/** 核销/回款参数 */
export interface VerifyParams {
  task_id: number;
  detail_ids: number[];
  amounts: { detail_id: number; amount: number }[];
  remark?: string;
  operator_id: number;
  operator_name: string;
}

/** 申请延期参数 */
export interface ExtensionParams {
  task_id: number;
  detail_ids: number[];
  extension_days: number;
  evidence_file_id?: number;
  signature_url?: string;
  remark?: string;
  operator_id: number;
  operator_name: string;
}

/** 标记差异参数 */
export interface DifferenceParams {
  task_id: number;
  detail_ids: number[];
  remark: string;
  operator_id: number;
  operator_name: string;
}

/** 升级催收参数 */
export interface EscalateParams {
  task_id: number;
  detail_ids: number[];
  reason: string;
  operator_id: number;
  operator_name: string;
}

/** 出纳确认核销参数 */
export interface ConfirmVerifyParams {
  task_id: number;
  detail_ids: number[];
  confirmed: boolean;
  remark?: string;
  operator_id: number;
  operator_name: string;
}

/** 差异解决参数 */
export interface ResolveDifferenceParams {
  task_id: number;
  detail_ids: number[];
  resolution: string;
  remark?: string;
  operator_id: number;
  operator_name: string;
}

/** 发送催收函参数 */
export interface SendNoticeParams {
  task_id: number;
  description?: string;
  attachment_url: string;
  operator_id: number;
}

/** 提起诉讼参数 */
export interface FileLawsuitParams {
  task_id: number;
  description: string;
  attachment_url?: string;
  operator_id: number;
}

/** 更新法律进展参数 */
export interface UpdateLegalProgressParams {
  task_id: number;
  description: string;
  attachment_url?: string;
  operator_id: number;
}
