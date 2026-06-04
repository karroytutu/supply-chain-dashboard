/**
 * 客户授信营业执照后补上传 - 业务服务层
 * @module services/credit-license/credit-license.service
 */

import * as repository from './credit-license.repository';
import { toDTO, toDTOList } from './credit-license.mapper';
import { erpUploadBusinessLicense } from '../erp-client/erp-credit-update.service';

import { CREDIT_LICENSE_DEFERRED_DEADLINE_DAYS } from '../../utils/constants';
import * as assessmentRepository from '../assessment/assessment.repository';
import type {
  CreditLicenseDeferredDTO,
  CreateDeferredUploadParams,
  CreditLicenseQueryParams,
} from './credit-license.types';

/**
 * 审批通过后创建延期补交记录
 * 在 onApproved 回调中调用
 */
export async function createDeferredUploadAfterApproval(
  oaInstanceId: number,
  customerId: number,
  customerName: string,
  applicantId: number,
  applicantName: string
): Promise<CreditLicenseDeferredDTO> {
  // 检查是否已有记录（幂等保护）
  const existing = await repository.getByInstanceId(oaInstanceId);
  if (existing) {
    return toDTO(existing);
  }

  const deadline = new Date();
  deadline.setDate(deadline.getDate() + CREDIT_LICENSE_DEFERRED_DEADLINE_DAYS);

  const params: CreateDeferredUploadParams = {
    oaInstanceId,
    customerId,
    customerName,
    applicantId,
    applicantName,
    deadline,
  };

  const row = await repository.create(params);
  return toDTO(row);
}

/**
 * 补交营业执照
 * 上传ERP + 更新延期记录状态 + 取消pending考核记录
 */
export async function supplementLicense(
  oaInstanceId: number,
  filePaths: string[],
  customerId: number
): Promise<CreditLicenseDeferredDTO> {
  const deferred = await repository.getByInstanceId(oaInstanceId);
  if (!deferred) {
    throw new Error('未找到该审批的延期补交记录');
  }
  if (deferred.status === 'completed') {
    throw new Error('该审批的营业执照已补交');
  }

  // 1. 上传营业执照到ERP
  if (filePaths.length > 0) {
    await erpUploadBusinessLicense(customerId, filePaths);
  }

  // 2. 更新延期记录状态为 completed
  const updated = await repository.updateStatus(deferred.id, 'completed', {
    completed_at: new Date().toISOString(),
  });

  // 3. 取消此延期记录关联的 pending 考核记录
  await assessmentRepository.cancelPendingBySource(deferred.id, 'credit_license_deferred');

  return toDTO(updated!);
}

/**
 * 营销员查看自己的待补交列表
 */
export async function getMyDeferredUploads(
  userId: number,
  params: CreditLicenseQueryParams
): Promise<{ list: CreditLicenseDeferredDTO[]; total: number; page: number; pageSize: number }> {
  const { rows, total } = await repository.getByApplicant(userId, params);
  return {
    list: toDTOList(rows),
    total,
    page: params.page,
    pageSize: params.pageSize,
  };
}

/**
 * 管理视图：查询所有延期补交记录
 */
export async function getDeferredUploads(
  params: CreditLicenseQueryParams
): Promise<{ list: CreditLicenseDeferredDTO[]; total: number; page: number; pageSize: number }> {
  const { rows, total } = await repository.getAll(params);
  return {
    list: toDTOList(rows),
    total,
    page: params.page,
    pageSize: params.pageSize,
  };
}

/**
 * 根据审批实例ID查询延期补交记录
 */
export async function getDeferredByInstanceId(
  oaInstanceId: number
): Promise<CreditLicenseDeferredDTO | null> {
  const row = await repository.getByInstanceId(oaInstanceId);
  return row ? toDTO(row) : null;
}
