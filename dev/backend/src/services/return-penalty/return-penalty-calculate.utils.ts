/** @deprecated 已迁移到统一考核模块 services/assessment/，请勿继续使用此文件 */
/**
 * 退货考核计算 - 辅助函数
 * 提供考核规则共用的数据库查询和记录写入功能
 */

import { appQuery } from '../../db/appPool';
import { getCostPriceByNameMap } from '../erp-client/erp-inventory.service';
import type { CreatePenaltyParams, PenaltyRole } from './return-penalty.types';

/**
 * 获取商品平均进价（通过 ERP 库存 API）
 */
export async function getPurchasePrice(goodsName: string): Promise<number> {
  try {
    const costMap = await getCostPriceByNameMap();
    const avgPrice = costMap.get(goodsName) || 0;
    return avgPrice > 0 ? avgPrice : 0;
  } catch (error) {
    console.error('[ReturnPenalty] 获取商品进价失败:', goodsName, error);
    return 0;
  }
}

/**
 * 根据姓名查找用户
 */
export async function findUserByName(name: string): Promise<{ id: number; name: string } | null> {
  if (!name) return null;

  const result = await appQuery<{ id: number; name: string }>(
    'SELECT id, name FROM users WHERE name = $1 LIMIT 1',
    [name]
  );

  return result.rows[0] || null;
}

/**
 * 根据角色获取所有用户
 */
export async function getUsersByRole(roleCode: string): Promise<{ id: number; name: string }[]> {
  const result = await appQuery<{ id: number; name: string }>(
    `SELECT u.id, u.name
     FROM users u
     JOIN user_roles ur ON u.id = ur.user_id
     JOIN roles r ON ur.role_id = r.id
     WHERE r.code = $1`,
    [roleCode]
  );

  return result.rows;
}

/**
 * 创建或更新考核记录
 */
export async function upsertPenaltyRecord(params: CreatePenaltyParams): Promise<void> {
  const {
    returnOrderId,
    penaltyType,
    penaltyUserId,
    penaltyUserName,
    penaltyRole,
    baseAmount,
    penaltyRate,
    overdueDays,
    penaltyAmount,
    penaltyRuleSnapshot,
  } = params;

  await appQuery(
    `INSERT INTO return_penalty_records (
      return_order_id, penalty_type, penalty_user_id, penalty_user_name,
      penalty_role, base_amount, penalty_rate, overdue_days, penalty_amount,
      penalty_rule_snapshot, calculated_at, status
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW(), 'pending')
    ON CONFLICT (return_order_id, penalty_type, penalty_user_id)
    DO UPDATE SET
      penalty_user_id = EXCLUDED.penalty_user_id,
      penalty_user_name = EXCLUDED.penalty_user_name,
      base_amount = EXCLUDED.base_amount,
      penalty_rate = EXCLUDED.penalty_rate,
      overdue_days = EXCLUDED.overdue_days,
      penalty_amount = EXCLUDED.penalty_amount,
      penalty_rule_snapshot = EXCLUDED.penalty_rule_snapshot,
      calculated_at = NOW(),
      updated_at = NOW()
    WHERE return_penalty_records.status = 'pending'`,
    [
      returnOrderId,
      penaltyType,
      penaltyUserId,
      penaltyUserName,
      penaltyRole,
      baseAmount,
      penaltyRate,
      overdueDays,
      penaltyAmount,
      JSON.stringify(penaltyRuleSnapshot || {}),
    ]
  );
}
