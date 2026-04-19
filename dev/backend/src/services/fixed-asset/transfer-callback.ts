/**
 * 固定资产调拨流程 - OA 审批回调处理器
 * 审批通过后逐条更新舟谱资产使用信息
 * @module services/fixed-asset/transfer-callback
 */

import type { OaApprovalInstanceRow } from '../oa-approval/oa-approval.types';
import { getApplicationByOaInstanceId, searchErpAssets } from './fixed-asset.query';
import { updateApplicationStatus } from './fixed-asset.mutation';
import { erpPost, getErpConfig } from '../erp-client';

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
    const lines = (formData.lines as Record<string, unknown>[]) || [];
    const allAssets = await searchErpAssets('', '');
    const config = getErpConfig();

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const erpAssetId = line.erpAssetId;

      // 搜索获取完整对象
      const assetDetail = allAssets.find((a: Record<string, unknown>) => a.id === erpAssetId);
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

      await erpPost<Record<string, unknown>>(config.assetUpdatePath, updatePayload, {
        pathPrefix: config.assetPathPrefix,
        businessType: 'fixed_asset_transfer_update',
        businessId: application.id,
      });

      console.log(`[AssetCallback] 资产更新成功: erpAssetId=${erpAssetId}`);
    }

    await updateApplicationStatus(application.id, 'completed');
    console.log(`[AssetCallback] 调拨完成, 共更新 ${lines.length} 条资产`);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[AssetCallback] 调拨更新失败:`, message);
    await updateApplicationStatus(application.id, 'erp_failed', {
      erpRequestLog: { error: message, node: 'transfer_update' },
    });
  }
}
