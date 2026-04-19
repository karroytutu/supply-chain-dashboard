/**
 * 固定资产维修流程 - OA 审批回调处理器
 * 节点4(财务支付): 创建费用单 (subjectId=412 维修费用)
 * @module services/fixed-asset/maintenance-callback
 */

import type { OaApprovalInstanceRow } from '../oa-approval/oa-approval.types';
import { getApplicationByOaInstanceId, getErpStaff } from './fixed-asset.query';
import { updateApplicationStatus } from './fixed-asset.mutation';
import { erpPost, getErpConfig, getErpDefaults } from '../erp-client';
import type { ErpBillResponse } from '../erp-client';
import { FEE_SUBJECT } from './fixed-asset.types';
import { randomUUID } from 'crypto';

/**
 * 维修流程 — data_input 节点回调
 * 节点4(财务支付): 创建费用单
 */
export async function handleAssetMaintenanceNodeCallback(
  instance: OaApprovalInstanceRow,
  nodeOrder: number,
  nodeData: Record<string, unknown>,
  formData: Record<string, unknown>
): Promise<void> {
  if (nodeOrder !== 4) return;

  const application = await getApplicationByOaInstanceId(instance.id);
  if (!application) {
    console.error(`[AssetCallback] 维修回调: 未找到申请记录, oaInstanceId=${instance.id}`);
    return;
  }

  try {
    await updateApplicationStatus(application.id, 'paying');

    const paymentAmount = (formData.paymentAmount as string) || '0';
    const paymentSubjectId = formData.paymentSubjectId as number;
    const paymentDate = (formData.paymentDate as string) || new Date().toISOString().slice(0, 19).replace('T', ' ');

    // 获取申请人舟谱信息
    const { defaultSalesmanId, defaultDeptId, cid, uid, defaultPaymentSubjectId } = getErpDefaults();
    const staff = await getErpStaff();
    const applicant = staff.find((s) => s.name === application.applicantName);
    const salesmanId = applicant?.id || defaultSalesmanId;
    const deptId = applicant?.deptId || defaultDeptId;

    const requestBody = {
      operatorId: '1',
      operateTime: paymentDate,
      paymentDetails: [{
        paymentAmount,
        subjectId: paymentSubjectId || defaultPaymentSubjectId,
      }],
      totalAmount: paymentAmount,
      details: [{
        id: randomUUID(),
        subjectId: FEE_SUBJECT.MAINTENANCE.subjectId,
        subjectName: FEE_SUBJECT.MAINTENANCE.subjectName,
        salesmanId,
        salesmanName: application.applicantName || '',
        deptId,
        taxRadio: 0,
        taxAmount: '',
        noTaxAmount: paymentAmount,
        paymentAmount,
      }],
      imgIds: [],
      workTime: paymentDate,
      salesmanId,
      note: `鑫链云维修申请 ${application.applicationNo}`,
      deptId,
      cid,
      uid,
    };

    const config = getErpConfig();

    const result = await erpPost<ErpBillResponse>(
      config.expenditureBillPath,
      requestBody,
      {
        pathPrefix: '/saas/pro/',
        businessType: 'fixed_asset_maintenance_payment',
        businessId: application.id,
      }
    );

    await updateApplicationStatus(application.id, 'completed', {
      erpResponseData: {
        expenditureBillId: result?.id,
        expenditureBillStr: result?.billStr,
      },
    });

    console.log(`[AssetCallback] 维修费用单创建成功: billStr=${result?.billStr}`);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[AssetCallback] 维修费用单创建失败:`, message);
    await updateApplicationStatus(application.id, 'erp_failed', {
      erpRequestLog: { error: message, node: 'maintenance_payment' },
    });
  }
}
