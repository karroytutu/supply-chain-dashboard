/**
 * 固定资产审批模块 - OA 审批回调处理器
 * 审批通过/节点完成后调用舟谱 ERP API 执行对应操作
 * @module services/fixed-asset/fixed-asset-callback
 */

import type { OaApprovalInstanceRow } from '../oa-approval/oa-approval.types';
import { getApplicationByOaInstanceId, searchErpAssets, getErpStaff } from './fixed-asset.query';
import { updateApplicationStatus } from './fixed-asset.mutation';
import { erpPost } from '../erp-client';
import { buildAssetCreatePayload } from './fixed-asset-utils';
import { FEE_SUBJECT, DISPOSAL_INCRDECR_MAP } from './fixed-asset.types';
import type { PurchaseLine, CreatedAssetRecord, DisposalType } from './fixed-asset.types';
import { randomUUID } from 'crypto';

/**
 * 采购流程 — data_input 节点回调
 * 节点5(出纳支付): 创建费用单
 * 节点7(资产入库): 批量创建舟谱资产卡片
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
  application: any,
  formData: Record<string, unknown>
): Promise<void> {
  try {
    await updateApplicationStatus(application.id, 'paying');

    const lines = formData.lines as PurchaseLine[] || [];
    const paymentAmount = formData.paymentAmount as string || '0';
    const paymentSubjectId = formData.paymentSubjectId as number || 16;
    const paymentDate = formData.paymentDate as string || new Date().toISOString().slice(0, 19).replace('T', ' ');

    // 获取申请人舟谱信息
    const staff = await getErpStaff();
    const applicant = staff.find((s: any) => s.name === application.applicantName);
    const salesmanId = applicant?.id || 1;
    const deptId = applicant?.deptId || 1;

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

    const requestBody = {
      operatorId: '1',
      operateTime: paymentDate,
      paymentDetails: [{
        paymentAmount,
        subjectId: paymentSubjectId,
      }],
      totalAmount: paymentAmount,
      details,
      imgIds: [],
      workTime: paymentDate,
      salesmanId,
      note: `鑫链云采购申请 ${application.applicationNo}`,
      deptId,
      cid: '10008421',
      uid: '1',
    };

    const result = await erpPost<any>(
      '/expenditure-bill/save-approve-cash-expenditure',
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
        expenditureBillId: result?.data?.id,
        expenditureBillStr: result?.data?.billStr,
      },
    });

    console.log(`[AssetCallback] 采购费用单创建成功: billStr=${result?.data?.billStr}`);
  } catch (error: any) {
    console.error(`[AssetCallback] 采购费用单创建失败:`, error.message);
    await updateApplicationStatus(application.id, 'erp_failed', {
      erpRequestLog: { error: error.message, node: 'purchase_payment' },
    });
  }
}

/**
 * 采购节点7 — 资产入库后批量创建舟谱资产卡片
 */
async function handlePurchaseAssetCreate(
  application: any,
  formData: Record<string, unknown>
): Promise<void> {
  try {
    await updateApplicationStatus(application.id, 'storing');

    const lines = formData.lines as PurchaseLine[] || [];
    const createdAssets: CreatedAssetRecord[] = [];
    const existingAssets = (application.erpResponseData as any)?.createdAssets || [];

    for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
      const line = lines[lineIndex];
      const quantity = line.quantity || 1;

      for (let unitIndex = 0; unitIndex < quantity; unitIndex++) {
        // 跳过已创建的资产（重试场景）
        const alreadyCreated = existingAssets.find(
          (a: CreatedAssetRecord) => a.lineIndex === lineIndex && a.unitIndex === unitIndex
        );
        if (alreadyCreated) {
          createdAssets.push(alreadyCreated);
          continue;
        }

        // 确定逐件分配或默认值
        const unitAlloc = line.units?.[unitIndex];

        const payload = buildAssetCreatePayload(line, lineIndex, unitAlloc);

        try {
          const result = await erpPost<any>('/asset/create', payload, {
            pathPrefix: '/messiah/',
            businessType: 'fixed_asset_purchase_create',
            businessId: application.id,
          });

          createdAssets.push({
            lineIndex,
            unitIndex,
            erpAssetId: result?.data?.id,
            code: result?.data?.code,
          });

          console.log(`[AssetCallback] 资产创建成功: line=${lineIndex} unit=${unitIndex} code=${result?.data?.code}`);
        } catch (createError: any) {
          console.error(`[AssetCallback] 资产创建失败: line=${lineIndex} unit=${unitIndex}`, createError.message);
          // 记录已成功的，标记部分失败
          await updateApplicationStatus(application.id, 'erp_failed', {
            erpResponseData: {
              ...(application.erpResponseData || {}),
              createdAssets,
            },
            erpRequestLog: { error: createError.message, lineIndex, unitIndex },
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
  } catch (error: any) {
    console.error(`[AssetCallback] 采购资产入库异常:`, error.message);
    await updateApplicationStatus(application.id, 'erp_failed', {
      erpRequestLog: { error: error.message, node: 'purchase_asset_create' },
    });
  }
}

/**
 * 调拨流程 — 审批通过回调
 * 逐条更新舟谱资产使用信息
 */
export async function handleAssetTransferApproved(
  instance: OaApprovalInstanceRow,
  formData: Record<string, unknown>
): Promise<void> {
  const application = await getApplicationByOaInstanceId(instance.id);
  if (!application) {
    console.error(`[AssetCallback] 调拨回调: 未找到申请记录, oaInstanceId=${instance.id}`);
    return;
  }

  try {
    const lines = formData.lines as any[] || [];
    const allAssets = await searchErpAssets('', '');

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const erpAssetId = line.erpAssetId;

      // 搜索获取完整对象
      const assetDetail = allAssets.find((a: any) => a.id === erpAssetId);
      if (!assetDetail) {
        throw new Error(`资产ID ${erpAssetId} 在舟谱中未找到`);
      }

      // 修改使用信息字段
      const updatePayload = {
        ...assetDetail,
        deptId: line.toDeptId,
        userId: line.toUserId,
        depositAddress: line.toDepositAddress,
      };

      await erpPost<any>('/asset/update', updatePayload, {
        pathPrefix: '/messiah/',
        businessType: 'fixed_asset_transfer_update',
        businessId: application.id,
      });

      console.log(`[AssetCallback] 资产更新成功: erpAssetId=${erpAssetId}`);
    }

    await updateApplicationStatus(application.id, 'completed');
    console.log(`[AssetCallback] 调拨完成, 共更新 ${lines.length} 条资产`);
  } catch (error: any) {
    console.error(`[AssetCallback] 调拨更新失败:`, error.message);
    await updateApplicationStatus(application.id, 'erp_failed', {
      erpRequestLog: { error: error.message, node: 'transfer_update' },
    });
  }
}

/**
 * 维修流程 — data_input 节点回调
 * 节点4(财务支付): 创建费用单 (subjectId=412 维修费用)
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

    const paymentAmount = formData.paymentAmount as string || '0';
    const paymentSubjectId = formData.paymentSubjectId as number || 16;
    const paymentDate = formData.paymentDate as string || new Date().toISOString().slice(0, 19).replace('T', ' ');

    // 获取申请人舟谱信息
    const staff = await getErpStaff();
    const applicant = staff.find((s: any) => s.name === application.applicantName);
    const salesmanId = applicant?.id || 1;
    const deptId = applicant?.deptId || 1;

    const requestBody = {
      operatorId: '1',
      operateTime: paymentDate,
      paymentDetails: [{
        paymentAmount,
        subjectId: paymentSubjectId,
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
      cid: '10008421',
      uid: '1',
    };

    const result = await erpPost<any>(
      '/expenditure-bill/save-approve-cash-expenditure',
      requestBody,
      {
        pathPrefix: '/saas/pro/',
        businessType: 'fixed_asset_maintenance_payment',
        businessId: application.id,
      }
    );

    await updateApplicationStatus(application.id, 'completed', {
      erpResponseData: {
        expenditureBillId: result?.data?.id,
        expenditureBillStr: result?.data?.billStr,
      },
    });

    console.log(`[AssetCallback] 维修费用单创建成功: billStr=${result?.data?.billStr}`);
  } catch (error: any) {
    console.error(`[AssetCallback] 维修费用单创建失败:`, error.message);
    await updateApplicationStatus(application.id, 'erp_failed', {
      erpRequestLog: { error: error.message, node: 'maintenance_payment' },
    });
  }
}

/**
 * 清理流程 — 审批通过回调
 * 1. 生成舟谱资产清理单
 * 2. 如有收入，额外创建收入单
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
    const disposalValue = formData.disposalValue as string || '0';
    const disposalReason = formData.disposalReason as string || '';
    const incrdecrId = DISPOSAL_INCRDECR_MAP[disposalType] || 8;

    // 搜索获取资产 code 和 name
    const allAssets = await searchErpAssets('', '');
    const assetDetail = allAssets.find((a: any) => a.id === erpAssetId);
    if (!assetDetail) {
      throw new Error(`资产ID ${erpAssetId} 在舟谱中未找到`);
    }

    // 1. 生成清理单
    const clearPayload = {
      code: assetDetail.code,
      name: assetDetail.name,
      workTime: disposalDate + ' 12:00:00',
      incrdecrId,
      note: disposalReason,
      assetIds: [erpAssetId],
      operatorId: '1',
      cid: '10008421',
      uid: '1',
    };

    const clearResult = await erpPost<any>(
      '/asset-clear/do-clear',
      clearPayload,
      {
        pathPrefix: '/messiah/',
        businessType: 'fixed_asset_disposal_clear',
        businessId: application.id,
      }
    );

    const responseData: Record<string, any> = {
      clearResult: clearResult?.data,
    };

    // 2. 如有收入，创建收入单
    if (hasIncome && parseFloat(disposalValue) > 0) {
      const staff = await getErpStaff();
      const applicant = staff.find((s: any) => s.name === application.applicantName);
      const salesmanId = applicant?.id || 1;
      const deptId = applicant?.deptId || 1;

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
        note: `清理收入，OA单号${application.applicationNo}`,
        deptId,
        cid: '10008421',
        uid: '1',
      };

      const incomeResult = await erpPost<any>(
        '/income/save-approve-cash-income',
        incomePayload,
        {
          pathPrefix: '/saas/pro/',
          businessType: 'fixed_asset_disposal_income',
          businessId: application.id,
        }
      );

      responseData.incomeResult = incomeResult?.data;
      console.log(`[AssetCallback] 清理收入单创建成功`);
    }

    await updateApplicationStatus(application.id, 'completed', {
      erpResponseData: responseData,
    });

    console.log(`[AssetCallback] 清理完成: erpAssetId=${erpAssetId}`);
  } catch (error: any) {
    console.error(`[AssetCallback] 清理操作失败:`, error.message);
    await updateApplicationStatus(application.id, 'erp_failed', {
      erpRequestLog: { error: error.message, node: 'disposal' },
    });
  }
}
