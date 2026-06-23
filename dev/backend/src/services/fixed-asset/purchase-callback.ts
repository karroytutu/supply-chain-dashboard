/**
 * 固定资产采购流程 - auto 节点回调处理器
 * 节点6(创建费用单): 出纳支付后调用 ERP 创建费用单
 * 节点9(创建资产卡片): 资产入库后批量创建舟谱资产卡片
 * @module services/fixed-asset/purchase-callback
 */
import { createLogger } from '../../utils/logger';
const log = createLogger('FixedAsset');

import { appQuery as query } from '../../db/appPool';
import type { OaInstanceRow, CallbackResult } from '../oa/oa.types';
import { getErpStaff, searchErpAssets } from './fixed-asset.query';
import { getErpMeta, updateErpMetaStatus, markErpFailed } from './erp-meta-utils';
import { erpPost, getErpConfig, getErpDefaults, type ErpBillResponse } from '../erp-client';
import { FEE_SUBJECT, type PurchaseLine, type CreatedAssetRecord } from './fixed-asset.types';
import { randomUUID } from 'crypto';
import {
  buildAssetCreatePayload,
  normalizeDateTime,
  generateNextAssetCode,
} from './fixed-asset-utils';

/**
 * 采购流程 — auto 节点回调入口
 * 通过查询当前 processing 状态的 auto 节点 node_order 进行分发
 */
export async function handleAssetPurchaseAutoNode(
  instance: OaInstanceRow,
  formData: Record<string, unknown>
): Promise<CallbackResult | void> {
  const currentNodeResult = await query<{ node_order: number; node_name: string }>(
    `SELECT node_order, node_name FROM oa_approval_nodes
     WHERE instance_id = $1 AND node_type = 'auto' AND status = 'processing'
     ORDER BY node_order LIMIT 1`,
    [instance.id]
  );

  const nodeOrder = currentNodeResult.rows[0]?.node_order;
  const nodeName = currentNodeResult.rows[0]?.node_name;
  log.info(`[固定资产采购] auto节点执行: instanceId=${instance.id}, node=${nodeOrder}(${nodeName})`);

  switch (nodeOrder) {
    case 6:
      return handleCreateExpenseBill(instance, formData);
    case 9:
      return handleCreateAssetCards(instance, formData);
    default:
      log.warn(`[固定资产采购] 未知的auto节点: nodeOrder=${nodeOrder}, nodeName=${nodeName}`);
  }
}

/**
 * 节点6 — 创建费用单
 * subjectId=217 购置固定资产
 */
async function handleCreateExpenseBill(
  instance: OaInstanceRow,
  formData: Record<string, unknown>
): Promise<CallbackResult> {
  try {
    await updateErpMetaStatus(instance.id, 'paying');

    const lines = (formData.purchaseLines as PurchaseLine[]) || [];
    const paymentAmount = (formData.paymentAmount as string) || '0';
    const paymentSubjectId = formData.paymentSubjectId as number;
    const paymentDate = normalizeDateTime(formData.paymentDate as string);

    const { defaultSalesmanId, defaultDeptId } = getErpDefaults();
    const staff = await getErpStaff();
    const applicant = staff.find(s => s.name === instance.applicant_name);
    const salesmanId = applicant?.id || defaultSalesmanId;
    const deptId = applicant?.deptId || defaultDeptId;

    const erpMeta = getErpMeta(instance);
    const applicationNo = erpMeta?.applicationNo || instance.instance_no;

    const details = lines.map(line => ({
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
      paymentDetails: [
        {
          paymentAmount,
          subjectId: paymentSubjectId || defaultPaymentSubjectId,
        },
      ],
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

    const result = await erpPost<ErpBillResponse>(config.expenditureBillPath, requestBody, {
      pathPrefix: '/saas/pro/',
      businessType: 'fixed_asset_purchase_payment',
      businessId: instance.id,
    });

    const billData = result?.data as ErpBillResponse | undefined;

    await updateErpMetaStatus(instance.id, 'purchasing');
    log.info(`采购费用单创建成功: billStr=${billData?.billStr}`);

    return {
      erpMeta: {
        expenditureBillId: billData?.id,
        expenditureBillStr: billData?.billStr,
      },
      formData: {
        _expenditureBillStr: billData?.billStr,
      },
    };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    log.error(`采购费用单创建失败:`, message);
    await markErpFailed(instance.id, { error: message, node: 'purchase_payment' });
    throw error;
  }
}

/**
 * 节点9 — 批量创建资产卡片
 */
async function handleCreateAssetCards(
  instance: OaInstanceRow,
  formData: Record<string, unknown>
): Promise<CallbackResult> {
  try {
    await updateErpMetaStatus(instance.id, 'storing');

    const purchaseLines = (formData.purchaseLines as PurchaseLine[]) || [];
    const arrivalLines = (formData.arrivalLines as Record<string, unknown>[]) || [];
    const lines = purchaseLines.map((line, i) => ({
      ...line,
      ...arrivalLines[i],
    }));
    const createdAssets: CreatedAssetRecord[] = [];
    const erpMeta = getErpMeta(instance);
    const existingAssets = (erpMeta?.responseData?.createdAssets || []) as CreatedAssetRecord[];

    const config = getErpConfig();

    const erpAssets = await searchErpAssets('', '');
    let nextCodeNum = generateNextAssetCode(erpAssets);

    for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
      const line = lines[lineIndex];
      const quantity = line.quantity || 1;

      for (let unitIndex = 0; unitIndex < quantity; unitIndex++) {
        const alreadyCreated = existingAssets.find(
          a => a.lineIndex === lineIndex && a.unitIndex === unitIndex
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

          const erpAssetId =
            typeof result?.data === 'number' ? result.data : (result?.id as number) || 0;

          createdAssets.push({ lineIndex, unitIndex, erpAssetId, code: assetCode });

          log.info(
            `资产创建成功: line=${lineIndex} unit=${unitIndex} code=${assetCode} erpId=${erpAssetId}`
          );
        } catch (createError: unknown) {
          const message = createError instanceof Error ? createError.message : String(createError);
          log.error(`资产创建失败: line=${lineIndex} unit=${unitIndex}`, message);
          // 记录已成功的，标记部分失败
          await markErpFailed(instance.id, { error: message, lineIndex, unitIndex });
          // 返回已成功创建的部分
          return {
            erpMeta: { createdAssets },
            formData: { _createdAssetCodes: createdAssets.map(a => a.code).join(', ') },
          };
        }
      }
    }

    await updateErpMetaStatus(instance.id, 'completed');
    log.info(`采购资产入库完成, 共创建 ${createdAssets.length} 件资产`);

    return {
      erpMeta: { createdAssets },
      formData: { _createdAssetCodes: createdAssets.map(a => a.code).join(', ') },
    };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    log.error(`采购资产入库异常:`, message);
    await markErpFailed(instance.id, { error: message, node: 'purchase_asset_create' });
    throw error;
  }
}
