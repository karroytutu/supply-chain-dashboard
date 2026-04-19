/**
 * 固定资产采购流程 - OA 审批回调处理器
 * 节点5(出纳支付): 创建费用单
 * 节点7(资产入库): 批量创建舟谱资产卡片
 * @module services/fixed-asset/purchase-callback
 */

import type { OaApprovalInstanceRow } from '../oa-approval/oa-approval.types';
import { getApplicationByOaInstanceId, getErpStaff } from './fixed-asset.query';
import { updateApplicationStatus } from './fixed-asset.mutation';
import { erpPost, getErpConfig, getErpDefaults } from '../erp-client';
import type { ErpBillResponse } from '../erp-client';
import { FEE_SUBJECT } from './fixed-asset.types';
import type { PurchaseLine, CreatedAssetRecord, AssetApplication } from './fixed-asset.types';
import { randomUUID } from 'crypto';
import { buildAssetCreatePayload } from './fixed-asset-utils';

/**
 * 采购流程 — data_input 节点回调
 */
export async function handleAssetPurchaseNodeCallback(
  instance: OaApprovalInstanceRow,
  nodeOrder: number,
  nodeData: Record<string, unknown>,
  formData: Record<string, unknown>
): Promise<void> {
  const application = await getApplicationByOaInstanceId(instance.id);
  if (!application) {
    console.error(`[AssetCallback] 采购回调: 未找到申请记录, oaInstanceId=${instance.id}`);
    return;
  }

  if (nodeOrder === 5) {
    await handlePurchasePayment(application, formData);
  } else if (nodeOrder === 7) {
    await handlePurchaseAssetCreate(application, formData);
  }
}

/**
 * 采购节点5 — 出纳支付后创建费用单
 * subjectId=217 购置固定资产
 */
async function handlePurchasePayment(
  application: AssetApplication,
  formData: Record<string, unknown>
): Promise<void> {
  try {
    await updateApplicationStatus(application.id, 'paying');

    const lines = (formData.lines as PurchaseLine[]) || [];
    const paymentAmount = (formData.paymentAmount as string) || '0';
    const paymentSubjectId = formData.paymentSubjectId as number;
    const paymentDate = (formData.paymentDate as string) || new Date().toISOString().slice(0, 19).replace('T', ' ');

    // 获取申请人舟谱信息
    const { defaultSalesmanId, defaultDeptId } = getErpDefaults();
    const staff = await getErpStaff();
    const applicant = staff.find((s) => s.name === application.applicantName);
    const salesmanId = applicant?.id || defaultSalesmanId;
    const deptId = applicant?.deptId || defaultDeptId;

    // 构造费用单请求体
    const details = lines.map((line) => ({
      id: randomUUID(),
      subjectId: FEE_SUBJECT.PURCHASE.subjectId,
      subjectName: FEE_SUBJECT.PURCHASE.subjectName,
      salesmanId,
      salesmanName: application.applicantName || '',
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
      note: `鑫链云采购申请 ${application.applicationNo}`,
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
        businessId: application.id,
      }
    );

    await updateApplicationStatus(application.id, 'purchasing', {
      erpResponseData: {
        ...(application.erpResponseData || {}),
        expenditureBillId: result?.id,
        expenditureBillStr: result?.billStr,
      },
    });

    console.log(`[AssetCallback] 采购费用单创建成功: billStr=${result?.billStr}`);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[AssetCallback] 采购费用单创建失败:`, message);
    await updateApplicationStatus(application.id, 'erp_failed', {
      erpRequestLog: { error: message, node: 'purchase_payment' },
    });
  }
}

/**
 * 采购节点7 — 资产入库后批量创建舟谱资产卡片
 */
async function handlePurchaseAssetCreate(
  application: AssetApplication,
  formData: Record<string, unknown>
): Promise<void> {
  try {
    await updateApplicationStatus(application.id, 'storing');

    const lines = (formData.lines as PurchaseLine[]) || [];
    const createdAssets: CreatedAssetRecord[] = [];
    const existingAssets = ((application.erpResponseData?.createdAssets || []) as CreatedAssetRecord[]);

    const config = getErpConfig();

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

        // 确定逐件分配或默认值
        const unitAlloc = line.units?.[unitIndex];
        const payload = buildAssetCreatePayload(line, lineIndex, unitAlloc);

        try {
          const result = await erpPost<ErpBillResponse>(config.assetCreatePath, payload, {
            pathPrefix: config.assetPathPrefix,
            businessType: 'fixed_asset_purchase_create',
            businessId: application.id,
          });

          createdAssets.push({
            lineIndex,
            unitIndex,
            erpAssetId: result?.id as number,
            code: result?.code || result?.billStr || '',
          });

          console.log(`[AssetCallback] 资产创建成功: line=${lineIndex} unit=${unitIndex} code=${result?.code}`);
        } catch (createError: unknown) {
          const message = createError instanceof Error ? createError.message : String(createError);
          console.error(`[AssetCallback] 资产创建失败: line=${lineIndex} unit=${unitIndex}`, message);
          // 记录已成功的，标记部分失败
          await updateApplicationStatus(application.id, 'erp_failed', {
            erpResponseData: {
              ...(application.erpResponseData || {}),
              createdAssets,
            },
            erpRequestLog: { error: message, lineIndex, unitIndex },
          });
          return;
        }
      }
    }

    // 全部成功
    await updateApplicationStatus(application.id, 'completed', {
      erpResponseData: {
        ...(application.erpResponseData || {}),
        createdAssets,
      },
    });

    console.log(`[AssetCallback] 采购资产入库完成, 共创建 ${createdAssets.length} 件资产`);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[AssetCallback] 采购资产入库异常:`, message);
    await updateApplicationStatus(application.id, 'erp_failed', {
      erpRequestLog: { error: message, node: 'purchase_asset_create' },
    });
  }
}
