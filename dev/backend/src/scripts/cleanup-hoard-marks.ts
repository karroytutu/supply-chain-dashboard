/**
 * 一次性清理脚本：清除 ERP 端压单标记
 *
 * 配合迁移脚本 063_ar_hold_time_limit.sql 使用
 * 迁移脚本处理数据库端清理，此脚本处理 ERP 端压单标记的清除
 *
 * 使用方法：
 *   cd dev/backend
 *   npx ts-node src/scripts/cleanup-hoard-marks.ts
 *
 * 注意：如果 ERP API 不支持批量清除，可能需要运维人员手动操作 ERP 后台
 */
import { createLogger } from '../utils/logger';
const log = createLogger('Script');

import { appQuery } from '../db/appPool';
import { erpPost } from '../services/erp-client/erp-client';
import { getErpDefaults } from '../services/erp-client/erp-config';

interface HoardRecord {
  settlement_order_id: number;
  customer_name: string;
}

async function main(): Promise<void> {
  log.info('开始清理 ERP 压单标记...');

  // 1. 从被撤回的压单审批实例中提取结算单 ID
  // 迁移脚本 063 已将所有 hold_order 审批实例标记为 withdrawn，
  // 从其 formData.holdSettlementOrders 中提取需要清除 ERP 标记的结算单 ID
  const result = await appQuery<{ form_data: Record<string, unknown> }>(
    `SELECT i.form_data
     FROM oa_approval_instances i
     WHERE i.form_type_id = (SELECT id FROM oa_form_types WHERE code = 'customer_credit')
       AND i.form_data @> '{"creditType": "hold_order"}'
       AND i.status = 'withdrawn'`
  );

  if (result.rows.length === 0) {
    log.info('无需清理的 ERP 压单标记（无被撤回的压单审批）');
    return;
  }

  // 从 formData 中提取结算单 ID
  const orderIds = new Set<number>();
  for (const row of result.rows) {
    const orders = row.form_data?.holdSettlementOrders;
    if (Array.isArray(orders)) {
      for (const id of orders) {
        const numId =
          typeof id === 'object' && id !== null
            ? Number(
                (id as Record<string, unknown>).bizId ?? (id as Record<string, unknown>).id ?? 0
              )
            : Number(id);
        if (!isNaN(numId) && numId > 0) {
          orderIds.add(numId);
        }
      }
    }
  }

  if (orderIds.size === 0) {
    log.info('被撤回的压单审批中无有效结算单 ID');
    return;
  }

  log.info(`从 ${result.rows.length} 个被撤回审批中提取 ${orderIds.size} 个结算单 ID`);

  const { cid, uid } = getErpDefaults();
  let successCount = 0;
  let failCount = 0;

  // 2. 逐条调用 ERP API 取消压单标记
  for (const orderId of orderIds) {
    try {
      await erpPost(
        '/funds-sale/update-hoard',
        { ids: [orderId], taggedHoard: false, cid, uid },
        { pathPrefix: '/saas/pro/', businessType: 'unmark_hold_orders' }
      );
      successCount++;
      log.info(`已清除: ${orderId}`);
    } catch (error) {
      failCount++;
      log.error(
        `[CleanupHoard] 清除失败: ${orderId}:`,
        error instanceof Error ? error.message : error
      );
    }
  }

  log.info(`清理完成: 成功=${successCount}, 失败=${failCount}`);

  if (failCount > 0) {
    log.warn('部分结算单清除失败，可能需要运维人员手动在 ERP 后台操作');
  }

  process.exit(0);
}

main().catch(error => {
  log.error('脚本执行失败:', error);
  process.exit(1);
});
