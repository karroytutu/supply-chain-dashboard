/**
 * 固定资产采购流程 - OA 审批回调处理器
 * 节点5(出纳支付): 创建费用单
 * 节点7(资产入库): 批量创建舟谱资产卡片
 * @module services/fixed-asset/purchase-callback
 */

import type { OaApprovalInstanceRow } from '../oa-approval/oa-approval.types';
import { getErpStaff, searchErpAssets } from './fixed-asset.query';
import { getErpMeta, updateErpMetaStatus, mergeErpResponseData, markErpFailed } from './erp-meta-utils';
import { erpPost, getErpConfig, getErpDefaults } from '../erp-client';
import type { ErpBillResponse } from '../erp-client';
import { FEE_SUBJECT } from './fixed-asset.types';
import type { PurchaseLine, CreatedAssetRecord } from './fixed-asset.types';
import { randomUUID } from 'crypto';
import { buildAssetCreatePayload, normalizeDateTime, generateNextAssetCode } from './fixed-asset-utils';

/**
 * 采购流程 — data_input 节点回调
 */
export async function handleAssetPurchaseNodeCallback(
  instance: OaApprovalInstanceRow,
  nodeOrder: number,
  nodeData: Record<string, unknown>,
  formData: Record<string, unknown>
): Promise<void> {
  if (nodeOrder === 5) {
    await handlePurchasePayment(instance, formData);
  } else if (nodeOrder === 7) {
    await handlePurchaseAssetCreate(instance, formData);
  }
}

/**
 * 采购节点5 — 出纳支付后创建费用单
 * subjectId=217 购置固定资产
 */
async function handlePurchasePayment(
  instance: OaApprovalInstanceRow,
  formData: Record<string, unknown>
): Promise<void> {
  try {
    await updateErpMetaStatus(instance.id, 'paying');

    const lines = (formData.lines as PurchaseLine[]) || [];
    const paymentAmount = (formData.paymentAmount as string) || '0';
    const paymentSubjectId = formData.paymentSubjectId as number;
    const paymentDate = normalizeDateTime(formData.paymentDate as string);

    // 获取申请人舟谱信息
    const { defaultSalesmanId, defaultDeptId } = getErpDefaults();
    const staff = await getErpStaff();
    const applicant = staff.find((s) => s.name === instance.applicant_name);
    const salesmanId = applicant?.id || defaultSalesmanId;
    const deptId = applicant?.deptId || defaultDeptId;

    // 获取 APA 编号
    const erpMeta = getErpMeta(instance);
    const applicationNo = erpMeta?.applicationNo || instance.instance_no;

    // 构造费用单请求体
    const details = lines.map((line) => ({
      id: randomUUID(),
      subjectId: FEE_SUBJECT.PURCHASE.subjectId,
      subjectName: FEE_SUBJECT.PURCHASE.subjectName,
      salesmanId,
      salesmanName: instance.applicant_name || '',
      deptId,
      taxRadio: 0,
      taxAmount: '',
      noTaxAmount: line.actualPrice || line.estimatedBudget || '0',
      paymentAmount: line.actualPrice || line.estimatedBudget || '0',
    }));

    const { cid, uid, defaultPaymentSubjectId } = getErpDefaults();
    const config = getErpConfig();

    const requestBody = {
      operatorId: '1',
      operateTime: paymentDate,
      paymentDetails: [{
        paymentAmount,
        subjectId: paymentSubjectId || defaultPaymentSubjectId,
      }],
      totalAmount: paymentAmount,
      details,
      imgIds: [],
      workTime: paymentDate,
      salesmanId,
      note: `鑫链云采购申请 ${applicationNo}`,
      deptId,
      cid,
      uid,
    };

    const result = await erpPost<ErpBillResponse>(
      config.expenditureBillPath,
      requestBody,
      {
        pathPrefix: '/saas/pro/',
        businessType: 'fixed_asset_purchase_payment',
        businessId: instance.id,
      }
    );

    const billData = result?.data as ErpBillResponse | undefined;

    await updateErpMetaStatus(instance.id, 'purchasing');
    await mergeErpResponseData(instance.id, {
      expenditureBillId: billData?.id,
      expenditureBillStr: billData?.billStr,
    });

    console.log(`[AssetCallback] 采购费用单创建成功: billStr=${billData?.billStr}`);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[AssetCallback] 采购费用单创建失败:`, message);
    await markErpFailed(instance.id, { error: message, node: 'purchase_payment' });
  }
}

/**
 * 采购节点7 — 资产入库后批量创建舟谱资产卡片
 */
async function handlePurchaseAssetCreate(
  instance: OaApprovalInstanceRow,
  formData: Record<string, unknown>
): Promise<void> {
  try {
    await updateErpMetaStatus(instance.id, 'storing');

    const lines = (formData.lines as PurchaseLine[]) || [];
    const createdAssets: CreatedAssetRecord[] = [];
    const erpMeta = getErpMeta(instance);
    const existingAssets = ((erpMeta?.responseData?.createdAssets || []) as CreatedAssetRecord[]);

    const config = getErpConfig();

    // 查询 ERP 现有资产获取最大编码
    const erpAssets = await searchErpAssets('', '');
    let nextCodeNum = generateNextAssetCode(erpAssets);

    for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
      const line = lines[lineIndex];
      const quantity = line.quantity || 1;

      for (let unitIndex = 0; unitIndex < quantity; unitIndex++) {
        // 跳过已创建的资产（重试场景）
        const alreadyCreated = existingAssets.find(
          (a) => a.lineIndex === lineIndex && a.unitIndex === unitIndex
        );
        if (alreadyCreated) {
          createdAssets.push(alreadyCreated);
          continue;
        }

        const assetCode = `GDZC-${String(nextCodeNum).padStart(4, '0')}`;
        nextCodeNum++;

        const unitAlloc = line.units?.[unitIndex];
        const payload = buildAssetCreatePayload(line, lineIndex, unitAlloc, assetCode);

        try {
          const result = await erpPost<ErpBillResponse>(config.assetCreatePath, payload, {
            pathPrefix: config.assetPathPrefix,
            businessType: 'fixed_asset_purchase_create',
            businessId: instance.id,
          });

          const erpAssetId = typeof result?.data === 'number' ? result.data : (result?.id as number || 0);

          createdAssets.push({ lineIndex, unitIndex, erpAssetId, code: assetCode });

          console.log(`[AssetCallback] 资产创建成功: line=${lineIndex} unit=${unitIndex} code=${assetCode} erpId=${erpAssetId}`);
        } catch (createError: unknown) {
          const message = createError instanceof Error ? createError.message : String(createError);
          console.error(`[AssetCallback] 资产创建失败: line=${lineIndex} unit=${unitIndex}`, message);
          // 记录已成功的，标记部分失败
          await mergeErpResponseData(instance.id, { createdAssets });
          await markErpFailed(instance.id, { error: message, lineIndex, unitIndex });
          return;
        }
      }
    }

    // 全部成功
    await updateErpMetaStatus(instance.id, 'completed');
    await mergeErpResponseData(instance.id, { createdAssets });

    console.log(`[AssetCallback] 采购资产入库完成, 共创建 ${createdAssets.length} 件资产`);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[AssetCallback] 采购资产入库异常:`, message);
    await markErpFailed(instance.id, { error: message, node: 'purchase_asset_create' });
  }
}
