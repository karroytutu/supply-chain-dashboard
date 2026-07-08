/**
 * 固定资产调拨流程 - OA 审批回调处理器
 * 审批通过后逐条更新舟谱资产使用信息
 * @module services/fixed-asset/transfer-callback
 */
import { createLogger } from '../../utils/logger';
const log = createLogger('FixedAsset');

import type { OaInstanceRow } from '../oa/oa.types';
import type { FormAccessor } from '../oa/form-accessor';
import { searchErpAssets } from './fixed-asset.query';
import { updateErpMetaStatus, mergeErpResponseData, markErpFailed } from './erp-meta-utils';
import { erpPost, getErpConfig } from '../erp-client';

/**
 * 调拨流程 — 审批通过回调
 * 逐条更新舟谱资产使用信息
 */
export async function handleAssetTransferApproved(
  instance: OaInstanceRow,
  form: FormAccessor
): Promise<void> {
  try {
    const lines = form.getTableRecords('lines');
    const allAssets = await searchErpAssets('', '');
    const config = getErpConfig();

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const erpAssetId = line.erpAssetId;

      const assetDetail = allAssets.find((a: Record<string, unknown>) => a.id === erpAssetId);
      if (!assetDetail) {
        throw new Error(`资产ID ${erpAssetId} 在舟谱中未找到`);
      }

      const updatePayload = {
        ...assetDetail,
        deptId: line.toDeptId,
        userId: line.toUserId,
        depositAddress: line.toDepositAddress,
      };

      await erpPost<Record<string, unknown>>(config.assetUpdatePath, updatePayload, {
        pathPrefix: config.assetPathPrefix,
        businessType: 'fixed_asset_transfer_update',
        businessId: instance.id,
      });

      log.info(`资产更新成功: erpAssetId=${erpAssetId}`);
    }

    await updateErpMetaStatus(instance.id, 'completed');
    await mergeErpResponseData(instance.id, { transferCount: lines.length });

    log.info(`调拨完成, 共更新 ${lines.length} 条资产`);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    log.error(`调拨更新失败:`, message);
    await markErpFailed(instance.id, { error: message, node: 'transfer_update' });
  }
}
