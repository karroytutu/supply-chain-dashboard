/**
 * 固定资产维修流程 - OA 审批回调处理器
 * 节点4(财务支付): 创建费用单 (subjectId=412 维修费用)
 * @module services/fixed-asset/maintenance-callback
 */

import type { OaApprovalInstanceRow } from '../oa-approval/oa-approval.types';
import { getErpStaff } from './fixed-asset.query';
import { getErpMeta, updateErpMetaStatus, mergeErpResponseData, markErpFailed } from './erp-meta-utils';
import { erpPost, getErpConfig, getErpDefaults } from '../erp-client';
import type { ErpBillResponse } from '../erp-client';
import { FEE_SUBJECT } from './fixed-asset.types';
import { randomUUID } from 'crypto';
import { normalizeDateTime } from './fixed-asset-utils';

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

  try {
    await updateErpMetaStatus(instance.id, 'paying');

    const paymentAmount = (formData.paymentAmount as string) || '0';
    const paymentSubjectId = formData.paymentSubjectId as number;
    const paymentDate = normalizeDateTime(formData.paymentDate as string);

    // 获取申请人舟谱信息
    const { defaultSalesmanId, defaultDeptId, cid, uid, defaultPaymentSubjectId } = getErpDefaults();
    const staff = await getErpStaff();
    const applicant = staff.find((s) => s.name === instance.applicant_name);
    const salesmanId = applicant?.id || defaultSalesmanId;
    const deptId = applicant?.deptId || defaultDeptId;

    // 获取 APA 编号
    const erpMeta = getErpMeta(instance);
    const applicationNo = erpMeta?.applicationNo || instance.instance_no;

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
        salesmanName: instance.applicant_name || '',
        deptId,
        taxRadio: 0,
        taxAmount: '',
        noTaxAmount: paymentAmount,
        paymentAmount,
      }],
      imgIds: [],
      workTime: paymentDate,
      salesmanId,
      note: `鑫链云维修申请 ${applicationNo}`,
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
        businessId: instance.id,
      }
    );

    const billData = result?.data as ErpBillResponse | undefined;

    await updateErpMetaStatus(instance.id, 'completed');
    await mergeErpResponseData(instance.id, {
      expenditureBillId: billData?.id,
      expenditureBillStr: billData?.billStr,
    });

    console.log(`[AssetCallback] 维修费用单创建成功: billStr=${billData?.billStr}`);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[AssetCallback] 维修费用单创建失败:`, message);
    await markErpFailed(instance.id, { error: message, node: 'maintenance_payment' });
  }
}
