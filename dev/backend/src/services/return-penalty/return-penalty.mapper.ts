/**
 * 退货考核 DTO 映射器
 * 负责数据库实体(snake_case) ↔ API DTO(camelCase) 的双向转换
 */

import type {
  PenaltyRecord,
  PenaltyType,
  PenaltyStats,
} from './return-penalty.types';

// ==================== 数据库行类型 ====================

/** 考核记录数据库行（snake_case） */
export interface PenaltyRow {
  id: number;
  return_order_id: number;
  penalty_type: PenaltyType;
  penalty_user_id: number;
  penalty_user_name: string;
  penalty_role: string;
  base_amount: string;
  penalty_rate: string;
  overdue_days: number;
  penalty_amount: string;
  status: string;
  penalty_rule_snapshot: string | null;
  calculated_at: Date;
  created_at: Date;
  updated_at: Date;
  // 关联信息
  return_no?: string;
  goods_name?: string;
  quantity?: string;
}

// ==================== 实体 → DTO（用于响应） ====================

/**
 * 考核记录行 → PenaltyRecord 实体
 * 处理数值精度修正和 JSON 反序列化
 */
export function toPenaltyRecordDTO(row: PenaltyRow): PenaltyRecord {
  return {
    id: row.id,
    returnOrderId: row.return_order_id,
    penaltyType: row.penalty_type as PenaltyType,
    penaltyUserId: row.penalty_user_id,
    penaltyUserName: row.penalty_user_name,
    penaltyRole: row.penalty_role as PenaltyRecord['penaltyRole'],
    baseAmount: parseFloat(row.base_amount) || 0,
    penaltyRate: parseFloat(row.penalty_rate) || 0,
    overdueDays: row.overdue_days,
    penaltyAmount: parseFloat(row.penalty_amount) || 0,
    status: row.status as PenaltyRecord['status'],
    penaltyRuleSnapshot: row.penalty_rule_snapshot
      ? JSON.parse(row.penalty_rule_snapshot)
      : null,
    calculatedAt: row.calculated_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    returnNo: row.return_no,
    goodsName: row.goods_name,
    quantity: row.quantity ? parseFloat(row.quantity) : undefined,
  };
}

/**
 * 统计行 → PenaltyStats
 */
export function toPenaltyStatsDTO(row: Record<string, any>): Omit<PenaltyStats, 'byType'> {
  return {
    totalAmount: parseFloat(row.total_amount) || 0,
    pendingCount: parseInt(row.pending_count) || 0,
    pendingAmount: parseFloat(row.pending_amount) || 0,
    confirmedCount: parseInt(row.confirmed_count) || 0,
    confirmedAmount: parseFloat(row.confirmed_amount) || 0,
    userCount: parseInt(row.user_count) || 0,
    todayCount: parseInt(row.today_count) || 0,
    todayAmount: parseFloat(row.today_amount) || 0,
  };
}
