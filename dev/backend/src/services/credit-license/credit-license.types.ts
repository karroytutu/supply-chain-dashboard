/**
 * 客户授信营业执照后补上传 - 类型定义
 * @module services/credit-license/credit-license.types
 */

/** 延期补交状态 */
export type CreditLicenseDeferredStatus = 'pending' | 'reminded' | 'overdue' | 'completed';

/** 延期补交记录数据库行 (snake_case) */
export interface CreditLicenseDeferredRow {
  id: number;
  oa_instance_id: number;
  customer_id: number;
  customer_name: string | null;
  applicant_id: number;
  applicant_name: string | null;
  status: CreditLicenseDeferredStatus;
  deadline: string;
  last_reminder_at: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
}

/** 延期补交记录 DTO (camelCase) */
export interface CreditLicenseDeferredDTO {
  id: number;
  oaInstanceId: number;
  customerId: number;
  customerName: string | null;
  applicantId: number;
  applicantName: string | null;
  status: CreditLicenseDeferredStatus;
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

/** 创建延期补交记录参数 */
export interface CreateDeferredUploadParams {
  oaInstanceId: number;
  customerId: number;
  customerName: string;
  applicantId: number;
  applicantName: string;
  deadline: Date;
}

/** 延期补交查询参数 */
export interface CreditLicenseQueryParams {
  status?: CreditLicenseDeferredStatus;
  applicantId?: number;
  page: number;
  pageSize: number;
}
