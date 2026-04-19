/**
 * 固定资产清理流程 - OA 审批回调处理器
 * 审批通过后: 1. 生成舟谱资产清理单  2. 如有收入，额外创建收入单
 * @module services/fixed-asset/disposal-callback
 */

import type { OaApprovalInstanceRow } from '../oa-approval/oa-approval.types';
import { getApplicationByOaInstanceId, searchErpAssets, getErpStaff } from './fixed-asset.query';
import { updateApplicationStatus } from './fixed-asset.mutation';
import { erpPost, getErpConfig, getErpDefaults } from '../erp-client';
import type { ErpBillResponse } from '../erp-client';
import { FEE_SUBJECT, DISPOSAL_INCRDECR_MAP } from './fixed-asset.types';
import type { DisposalType, ErpAsset } from './fixed-asset.types';

/**
 * 创建清理单
 */
async function createDisposalRecord(
  erpAssetId: number,
  disposalType: DisposalType,
  disposalDate: string,
  disposalReason: string,
  applicationId: number
): Promise<ErpBillResponse | null> {
  const incrdecrId = DISPOSAL_INCRDECR_MAP[disposalType] || 8;
  const { cid, uid } = getErpDefaults();
  const config = getErpConfig();

  // 搜索获取资产 code 和 name
  const allAssets = await searchErpAssets('', '');
  const assetDetail = allAssets.find((a: ErpAsset) => a.id === erpAssetId);
  if (!assetDetail) {
    throw new Error(`资产ID ${erpAssetId} 在舟谱中未找到`);
  }

  const clearPayload = {
    code: assetDetail.code,
    name: assetDetail.name,
    workTime: disposalDate + ' 12:00:00',
    incrdecrId,
    note: disposalReason,
    assetIds: [erpAssetId],
    operatorId: '1',
    cid,
    uid,
  };

  const clearResult = await erpPost<ErpBillResponse>(
    config.assetClearPath,
    clearPayload,
    {
      pathPrefix: config.assetPathPrefix,
      businessType: 'fixed_asset_disposal_clear',
      businessId: applicationId,
    }
  );

  return clearResult || null;
}

/**
 * 创建清理收入单
 */
async function createIncomeRecord(
  disposalValue: string,
  disposalDate: string,
  applicationNo: string,
  applicantName: string,
  applicationId: number
): Promise<ErpBillResponse | null> {
  const { defaultSalesmanId, defaultDeptId, cid, uid } = getErpDefaults();
  const config = getErpConfig();

  const staff = await getErpStaff();
  const applicant = staff.find((s) => s.name === applicantName);
  const salesmanId = applicant?.id || defaultSalesmanId;
  const deptId = applicant?.deptId || defaultDeptId;

  const incomePayload = {
    operatorId: '1',
    paymentDetails: [{
      paymentAmount: disposalValue,
      subjectId: 16,
    }],
    totalAmount: disposalValue,
    details: [{
      id: 1,
      subjectId: FEE_SUBJECT.DISPOSAL_INCOME.subjectId,
      subjectName: FEE_SUBJECT.DISPOSAL_INCOME.subjectName,
      taxRadio: '0',
      taxAmount: '',
      noTaxAmount: parseFloat(disposalValue).toFixed(2),
      paymentAmount: disposalValue,
    }],
    imgIds: [],
    salesmanId,
    workTime: disposalDate + ' 12:00:00',
    note: `清理收入，OA单号${applicationNo}`,
    deptId,
    cid,
    uid,
  };

  const incomeResult = await erpPost<ErpBillResponse>(
    config.incomeBillPath,
    incomePayload,
    {
      pathPrefix: '/saas/pro/',
      businessType: 'fixed_asset_disposal_income',
      businessId: applicationId,
    }
  );

  return incomeResult || null;
}

/**
 * 清理流程 — 审批通过回调
 */
export async function handleAssetDisposalApproved(
  instance: OaApprovalInstanceRow,
  formData: Record<string, unknown>
): Promise<void> {
  const application = await getApplicationByOaInstanceId(instance.id);
  if (!application) {
    console.error(`[AssetCallback] 清理回调: 未找到申请记录, oaInstanceId=${instance.id}`);
    return;
  }

  try {
    const erpAssetId = formData.erpAssetId as number;
    const disposalType = formData.disposalType as DisposalType;
    const disposalDate = formData.disposalDate as string;
    const hasIncome = formData.hasIncome as boolean;
    const disposalValue = (formData.disposalValue as string) || '0';
    const disposalReason = (formData.disposalReason as string) || '';

    // 1. 生成清理单
    const clearData = await createDisposalRecord(
      erpAssetId, disposalType, disposalDate, disposalReason, application.id
    );

    const responseData: Record<string, unknown> = {
      clearResult: clearData,
    };

    // 2. 如有收入，创建收入单
    if (hasIncome && parseFloat(disposalValue) > 0) {
      const incomeData = await createIncomeRecord(
        disposalValue, disposalDate, application.applicationNo,
        application.applicantName || '', application.id
      );
      responseData.incomeResult = incomeData;
      console.log(`[AssetCallback] 清理收入单创建成功`);
    }

    await updateApplicationStatus(application.id, 'completed', {
      erpResponseData: responseData,
    });

    console.log(`[AssetCallback] 清理完成: erpAssetId=${erpAssetId}`);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[AssetCallback] 清理操作失败:`, message);
    await updateApplicationStatus(application.id, 'erp_failed', {
      erpRequestLog: { error: message, node: 'disposal' },
    });
  }
}
