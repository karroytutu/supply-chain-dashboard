/**
 * 固定资产清理流程 - auto 节点回调处理器
 * 节点2(创建清理单): 生成舟谱资产清理单 + 如有收入则创建收入单
 * @module services/fixed-asset/disposal-callback
 */
import { createLogger } from '../../utils/logger';
const log = createLogger('FixedAsset');

import type { OaInstanceRow, CallbackResult } from '../oa/oa.types';
import { searchErpAssets, getErpStaff } from './fixed-asset.query';
import { getErpMeta, updateErpMetaStatus, markErpFailed } from './erp-meta-utils';
import { erpPost, getErpConfig, getErpDefaults, type ErpBillResponse } from '../erp-client';
import { FEE_SUBJECT, DISPOSAL_INCRDECR_MAP, type DisposalType, type ErpAsset } from './fixed-asset.types';
import { normalizeDateTime } from './fixed-asset-utils';

/**
 * 创建清理单
 */
async function createDisposalRecord(
  erpAssetId: number,
  disposalType: DisposalType,
  disposalDate: string,
  disposalReason: string,
  instanceId: number
): Promise<ErpBillResponse | null> {
  const incrdecrId = DISPOSAL_INCRDECR_MAP[disposalType] || 8;
  const { cid, uid } = getErpDefaults();
  const config = getErpConfig();

  const allAssets = await searchErpAssets('', '');
  const assetDetail = allAssets.find((a: ErpAsset) => a.id === erpAssetId);
  if (!assetDetail) {
    throw new Error(`资产ID ${erpAssetId} 在舟谱中未找到`);
  }

  const clearPayload = {
    code: assetDetail.code,
    name: assetDetail.name,
    workTime: normalizeDateTime(disposalDate),
    incrdecrId,
    note: disposalReason,
    assetIds: [erpAssetId],
    operatorId: '1',
    cid,
    uid,
  };

  const clearResult = await erpPost<ErpBillResponse>(config.assetClearPath, clearPayload, {
    pathPrefix: config.assetPathPrefix,
    businessType: 'fixed_asset_disposal_clear',
    businessId: instanceId,
  });

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
  instanceId: number
): Promise<ErpBillResponse | null> {
  const { defaultSalesmanId, defaultDeptId, cid, uid } = getErpDefaults();
  const config = getErpConfig();

  const staff = await getErpStaff();
  const applicant = staff.find(s => s.name === applicantName);
  const salesmanId = applicant?.id || defaultSalesmanId;
  const deptId = applicant?.deptId || defaultDeptId;

  const incomePayload = {
    operatorId: '1',
    paymentDetails: [
      {
        paymentAmount: disposalValue,
        subjectId: 16,
      },
    ],
    totalAmount: disposalValue,
    details: [
      {
        id: 1,
        subjectId: FEE_SUBJECT.DISPOSAL_INCOME.subjectId,
        subjectName: FEE_SUBJECT.DISPOSAL_INCOME.subjectName,
        taxRadio: '0',
        taxAmount: '',
        noTaxAmount: parseFloat(disposalValue).toFixed(2),
        paymentAmount: disposalValue,
      },
    ],
    imgIds: [],
    salesmanId,
    workTime: normalizeDateTime(disposalDate),
    note: `清理收入，OA单号${applicationNo}`,
    deptId,
    cid,
    uid,
  };

  const incomeResult = await erpPost<ErpBillResponse>(config.incomeBillPath, incomePayload, {
    pathPrefix: '/saas/pro/',
    businessType: 'fixed_asset_disposal_income',
    businessId: instanceId,
  });

  return incomeResult || null;
}

/**
 * 清理流程 — auto 节点回调
 * 由框架通过 executeAutoNodeCallback 触发，回填由 nodeBackfills 声明驱动
 */
export async function handleAssetDisposalApproved(
  instance: OaInstanceRow,
  formData: Record<string, unknown>
): Promise<CallbackResult> {
  const erpAssetId = formData.erpAssetId as number;
  const disposalType = formData.disposalType as DisposalType;
  const disposalDate = formData.disposalDate as string;
  const hasIncome = formData.hasIncome as boolean;
  const disposalValue = (formData.disposalValue as string) || '0';
  const disposalReason = (formData.disposalReason as string) || '';

  // 获取 APA 编号
  const erpMeta = getErpMeta(instance);
  const applicationNo = erpMeta?.applicationNo || instance.instance_no;

  try {
    // 1. 生成清理单
    const clearData = await createDisposalRecord(
      erpAssetId, disposalType, disposalDate, disposalReason, instance.id
    );

    const erpMetaResult: Record<string, unknown> = {
      clearBillId: clearData?.id,
      clearBillStr: clearData?.billStr,
    };
    const formDataResult: Record<string, unknown> = {
      _clearBillStr: clearData?.billStr,
    };

    // 2. 如有收入，创建收入单
    if (hasIncome && parseFloat(disposalValue) > 0) {
      const incomeData = await createIncomeRecord(
        disposalValue, disposalDate, applicationNo,
        instance.applicant_name || '', instance.id
      );
      erpMetaResult.incomeBillId = incomeData?.id;
      erpMetaResult.incomeBillStr = incomeData?.billStr;
      formDataResult._incomeBillStr = incomeData?.billStr;
      log.info(`清理收入单创建成功`);
    }

    await updateErpMetaStatus(instance.id, 'completed');
    log.info(`清理完成: erpAssetId=${erpAssetId}`);

    // 返回结构化结果，框架根据 nodeBackfills 声明自动执行回填
    return { erpMeta: erpMetaResult, formData: formDataResult };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    log.error(`清理操作失败:`, message);
    await markErpFailed(instance.id, { error: message, node: 'disposal' });
    throw error;
  }
}
