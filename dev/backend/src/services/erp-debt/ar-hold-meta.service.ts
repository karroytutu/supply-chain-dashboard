/**
 * 压单元数据服务
 * 管理 ar_hold_meta 表的压单审批记录（替代旧 ar_collection_details 中的 hold 字段）
 *
 * 业务场景：
 * - 压单审批通过时：写入压单记录（upsertHoldMeta）
 * - 催收流水线拉取欠款时：查询哪些单据正在被压单（fetchHoldMeta）
 * - 定时任务：清理到期的期限压单（checkHoldMetaExpiry）
 *
 * @module services/erp-debt/ar-hold-meta.service
 */

import { createLogger } from '../../utils/logger';
const log = createLogger('ArHoldMeta');

import { appQuery } from '../../db/appPool';
import { AR_HOLD_TYPE_TIME_LIMITED, type ArHoldType } from '../../utils/constants';

// ============================================
// 类型定义
// ============================================

/** 压单元数据（供富化服务使用） */
export interface HoldMeta {
  holdType: ArHoldType;
  holdUntil: string | null;
}

// ============================================
// 写入：压单审批通过时记录
// ============================================

/**
 * 压单审批通过后：写入压单元数据
 * @param billIds ERP单据ID列表（来自审批表单的 holdSettlementOrders）
 * @param holdType 压单类型：long_term=长期压单, time_limited=期限压单
 * @param holdDays 期限压单天数（仅 time_limited 有效）
 * @param sourceInstanceId 来源OA审批实例ID（可选）
 */
export async function upsertHoldMeta(
  billIds: string[],
  holdType: string,
  holdDays: number | null,
  sourceInstanceId?: number
): Promise<void> {
  if (billIds.length === 0) return;

  // 计算期限压单到期日
  const holdUntil = holdType === AR_HOLD_TYPE_TIME_LIMITED && holdDays
    ? `CURRENT_DATE + INTERVAL '${holdDays} days'`
    : 'NULL';

  const values = billIds.map((_, i) =>
    `($${i * 4 + 1}, $${i * 4 + 2}, $${i * 4 + 3}, ${holdUntil}, $${i * 4 + 4})`
  ).join(', ');

  const params: (string | number | null)[] = [];
  for (const billId of billIds) {
    params.push(billId, holdType, holdDays, sourceInstanceId ?? null);
  }

  try {
    await appQuery(
      `INSERT INTO ar_hold_meta (erp_bill_id, hold_type, hold_days, hold_until, source_instance_id)
       VALUES ${values}
       ON CONFLICT (erp_bill_id) DO UPDATE SET
         hold_type = EXCLUDED.hold_type,
         hold_days = EXCLUDED.hold_days,
         hold_until = EXCLUDED.hold_until,
         source_instance_id = EXCLUDED.source_instance_id,
         updated_at = CURRENT_TIMESTAMP`,
      params
    );
    log.info(`压单元数据已写入: ${billIds.length} 笔, 类型=${holdType}, 天数=${holdDays ?? 'N/A'}`);
  } catch (error) {
    log.error('压单元数据写入失败:', error);
    throw error;
  }
}

// ============================================
// 查询：催收流水线判断哪些单据被压单
// ============================================

/**
 * 查询压单元数据（供富化服务使用）
 * @param billIds 需要查询的ERP单据ID列表
 * @returns billId → HoldMeta 映射
 */
export async function fetchHoldMeta(
  billIds: string[]
): Promise<Map<string, HoldMeta>> {
  const result = new Map<string, HoldMeta>();
  if (billIds.length === 0) return result;

  try {
    const queryResult = await appQuery<{
      erp_bill_id: string;
      hold_type: string;
      hold_until: string | null;
    }>(
      `SELECT erp_bill_id, hold_type, hold_until::text
       FROM ar_hold_meta
       WHERE erp_bill_id = ANY($1)`,
      [billIds]
    );

    for (const row of queryResult.rows) {
      result.set(row.erp_bill_id, {
        holdType: row.hold_type as ArHoldType,
        holdUntil: row.hold_until,
      });
    }
  } catch (error) {
    log.error('压单元数据查询失败:', error);
    // 查询失败不阻断催收流程（降级：所有单据视为非压单）
  }

  return result;
}

// ============================================
// 定时清理：期限压单到期后自动解除
// ============================================

/**
 * 检查并清理到期的期限压单（催收流水线前置步骤，每日 20:00 执行）
 * 到期后单据自动恢复催收准入资格（fetchHoldMeta 查不到即视为非压单）
 * @returns 已清理的单据ID列表
 */
export async function checkHoldMetaExpiry(): Promise<string[]> {
  try {
    const result = await appQuery<{ erp_bill_id: string }>(
      `DELETE FROM ar_hold_meta
       WHERE hold_type = $1 AND hold_until <= CURRENT_DATE
       RETURNING erp_bill_id`,
      [AR_HOLD_TYPE_TIME_LIMITED]
    );

    const expiredIds = result.rows.map(r => r.erp_bill_id);
    if (expiredIds.length > 0) {
      log.info(`清理到期期限压单: ${expiredIds.length} 笔`);
    } else {
      log.info('无到期期限压单');
    }
    return expiredIds;
  } catch (error) {
    log.error('期限压单到期清理失败:', error);
    throw error;
  }
}
