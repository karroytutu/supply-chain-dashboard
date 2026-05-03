/**
 * 客户授信营业执照后补上传 - DTO 映射层
 * @module services/credit-license/credit-license.mapper
 */

import { CREDIT_LICENSE_PENALTY_PER_DAY } from '../../utils/constants';
import type { CreditLicenseDeferredRow, CreditLicenseDeferredDTO } from './credit-license.types';

/**
 * 数据库行 → DTO（含计算字段）
 */
export function toDTO(row: CreditLicenseDeferredRow): CreditLicenseDeferredDTO {
  const now = new Date();
  const deadlineDate = new Date(row.deadline);
  const isOverdue = now > deadlineDate && row.status !== 'completed';

  let remainingDays: number | undefined;
  let overdueDays: number | undefined;
  let penaltyAmount: number | undefined;

  if (row.status === 'completed') {
    // 已完成，无需计算
  } else if (isOverdue) {
    overdueDays = Math.ceil((now.getTime() - deadlineDate.getTime()) / (1000 * 60 * 60 * 24));
    penaltyAmount = overdueDays * CREDIT_LICENSE_PENALTY_PER_DAY;
  } else {
    remainingDays = Math.max(0, Math.ceil((deadlineDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)));
  }

  return {
    id: row.id,
    oaInstanceId: row.oa_instance_id,
    customerId: row.customer_id,
    customerName: row.customer_name,
    applicantId: row.applicant_id,
    applicantName: row.applicant_name,
    status: row.status,
    deadline: row.deadline,
    lastReminderAt: row.last_reminder_at,
    completedAt: row.completed_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    remainingDays,
    overdueDays,
    penaltyAmount,
  };
}

/**
 * 批量转换
 */
export function toDTOList(rows: CreditLicenseDeferredRow[]): CreditLicenseDeferredDTO[] {
  return rows.map(toDTO);
}
