/**
 * 固定资产审批模块 - 创建申请
 * @module services/fixed-asset/fixed-asset.mutation
 */

import { appQuery } from '../../db/appPool';
import { submitApproval } from '../oa-approval/oa-approval.mutation';
import { getFormTypeByCode } from '../oa-approval/form-types';
import { generateApplicationNo, validateMaintenanceCost, validateQuotationCount } from './fixed-asset-utils';
import type { CreateApplicationRequest, ApplicationType, MaintenanceQuotation } from './fixed-asset.types';

/** 申请类型 → OA 表单类型编码映射 */
const TYPE_TO_FORM_CODE: Record<ApplicationType, string> = {
  purchase: 'asset_purchase',
  transfer: 'asset_transfer',
  maintenance: 'asset_maintenance',
  disposal: 'asset_disposal',
};

/** 申请类型 → OA 审批标题模板 */
const TYPE_TO_TITLE: Record<ApplicationType, (formData: Record<string, unknown>) => string> = {
  purchase: (fd) => {
    const lines = fd.lines as Array<{ assetName?: string }> | undefined;
    return `固定资产采购申请 - ${lines?.[0]?.assetName || ''}`;
  },
  transfer: (fd) => `固定资产${fd.transferType === 'requisition' ? '领用' : '调拨'}申请`,
  maintenance: (fd) => `固定资产维修申请 - ${fd.assetName || ''}`,
  disposal: (fd) => `固定资产清理申请 - ${fd.assetName || ''}`,
};

/**
 * 创建固定资产申请
 */
export async function createApplication(
  req: CreateApplicationRequest,
  userId: number,
  userName: string,
  userDept: string | null
): Promise<{ applicationId: number; applicationNo: string; oaInstanceId: number; oaInstanceNo: string }> {
  const { type, formData, remark } = req;

  // 业务校验
  if (type === 'maintenance') {
    const estimatedCostStr = (formData.estimatedCost as string) || '0';
    const costError = validateMaintenanceCost(parseFloat(estimatedCostStr));
    if (costError) {
      throw new Error(costError);
    }
    const estimatedCost = parseFloat(estimatedCostStr);
    const quotations = formData.quotations as MaintenanceQuotation[] | undefined;
    if (estimatedCost >= 500 && quotations) {
      const quoteError = validateQuotationCount(estimatedCost, quotations.length);
      if (quoteError) {
        throw new Error(quoteError);
      }
    }
  }

  // 生成申请编号
  const applicationNo = await generateApplicationNo();

  // 确定初始状态
  const initialStatus = 'pending';

  // 写入本地申请记录
  const insertResult = await appQuery(
    `INSERT INTO asset_applications
      (application_no, type, status, form_data, applicant_id, applicant_name, remark)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING id`,
    [
      applicationNo,
      type,
      initialStatus,
      JSON.stringify(formData),
      userId,
      userName,
      remark || null,
    ]
  );

  const applicationId = insertResult.rows[0].id;

  // 提交 OA 审批
  const formTypeCode = TYPE_TO_FORM_CODE[type];
  const formType = getFormTypeByCode(formTypeCode);
  if (!formType) {
    throw new Error(`未找到表单类型定义: ${formTypeCode}`);
  }

  const title = TYPE_TO_TITLE[type](formData);
  const oaResult = await submitApproval(
    { formTypeCode, formData, title },
    formType,
    userId,
    userName,
    userDept
  );

  // 关联 OA 审批实例
  await appQuery(
    `UPDATE asset_applications
     SET oa_instance_id = $1, updated_at = NOW()
     WHERE id = $2`,
    [oaResult.instanceId, applicationId]
  );

  return {
    applicationId,
    applicationNo,
    oaInstanceId: oaResult.instanceId,
    oaInstanceNo: oaResult.instanceNo,
  };
}

/**
 * 更新申请状态
 */
export async function updateApplicationStatus(
  applicationId: number,
  status: string,
  extraData?: { erpResponseData?: Record<string, unknown>; erpRequestLog?: Record<string, unknown> }
): Promise<void> {
  const updates: string[] = ['status = $2', 'updated_at = NOW()'];
  const params: unknown[] = [applicationId, status];
  let paramIndex = 3;

  if (extraData?.erpResponseData) {
    updates.push(`erp_response_data = $${paramIndex++}`);
    params.push(JSON.stringify(extraData.erpResponseData));
  }
  if (extraData?.erpRequestLog) {
    updates.push(`erp_request_log = $${paramIndex++}`);
    params.push(JSON.stringify(extraData.erpRequestLog));
  }

  await appQuery(
    `UPDATE asset_applications SET ${updates.join(', ')} WHERE id = $1`,
    params
  );
}

/**
 * 重试失败的 ERP 操作
 */
export async function retryErpOperation(
  applicationId: number
): Promise<void> {
  const app = await appQuery(
    `SELECT * FROM asset_applications WHERE id = $1 AND status = 'erp_failed'`,
    [applicationId]
  );

  if (app.rows.length === 0) {
    throw new Error('申请不存在或状态不是 erp_failed');
  }

  // 重置状态为审批通过，等待回调重新执行
  await appQuery(
    `UPDATE asset_applications SET status = 'approved', updated_at = NOW() WHERE id = $1`,
    [applicationId]
  );
}
