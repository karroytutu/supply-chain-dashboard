/**
 * 退货考核查询服务
 */

import { appQuery } from '../../db/appPool';
import type {
  PenaltyRecord,
  PenaltyQueryParams,
  PenaltyStats,
  PenaltyType,
  PenaltyListResult,
  PENALTY_TYPE_NAMES,
  PenaltyStatus,
} from './return-penalty.types';

/** 数据库行映射 */
interface PenaltyRow {
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

/**
 * 将数据库行映射为实体对象
 */
function mapRowToPenaltyRecord(row: PenaltyRow): PenaltyRecord {
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
 * 获取考核记录列表
 */
export async function getPenalties(
  params: PenaltyQueryParams
): Promise<PenaltyListResult> {
  const {
    page = 1,
    pageSize = 20,
    penaltyType,
    penaltyUserId,
    penaltyRole,
    status,
    startDate,
    endDate,
    keyword,
  } = params;

  const offset = (page - 1) * pageSize;
  const conditions: string[] = ['1=1'];
  const queryParams: any[] = [];
  let paramIndex = 1;

  if (penaltyType) {
    conditions.push(`p.penalty_type = $${paramIndex++}`);
    queryParams.push(penaltyType);
  }

  if (penaltyUserId) {
    conditions.push(`p.penalty_user_id = $${paramIndex++}`);
    queryParams.push(penaltyUserId);
  }

  if (penaltyRole) {
    conditions.push(`p.penalty_role = $${paramIndex++}`);
    queryParams.push(penaltyRole);
  }

  if (status) {
    conditions.push(`p.status = $${paramIndex++}`);
    queryParams.push(status);
  }

  if (startDate) {
    conditions.push(`p.created_at >= $${paramIndex++}`);
    queryParams.push(startDate);
  }

  if (endDate) {
    conditions.push(`p.created_at <= $${paramIndex++}::timestamp + interval '1 day'`);
    queryParams.push(endDate);
  }

  if (keyword) {
    conditions.push(`(r.return_no ILIKE $${paramIndex} OR r.goods_name ILIKE $${paramIndex} OR p.penalty_user_name ILIKE $${paramIndex})`);
    queryParams.push(`%${keyword}%`);
    paramIndex++;
  }

  const whereClause = conditions.join(' AND ');

  // 查询总数
  const countResult = await appQuery<{ count: string }>(
    `SELECT COUNT(*) as count
     FROM return_penalty_records p
     LEFT JOIN expiring_return_orders r ON p.return_order_id = r.id
     WHERE ${whereClause}`,
    queryParams
  );
  const total = parseInt(countResult.rows[0]?.count || '0');

  // 查询列表
  const result = await appQuery<PenaltyRow>(
    `SELECT
      p.id,
      p.return_order_id,
      p.penalty_type,
      p.penalty_user_id,
      p.penalty_user_name,
      p.penalty_role,
      p.base_amount,
      p.penalty_rate,
      p.overdue_days,
      p.penalty_amount,
      p.status,
      p.penalty_rule_snapshot,
      p.calculated_at,
      p.created_at,
      p.updated_at,
      r.return_no,
      r.goods_name,
      r.quantity
    FROM return_penalty_records p
    LEFT JOIN expiring_return_orders r ON p.return_order_id = r.id
    WHERE ${whereClause}
    ORDER BY p.created_at DESC
    LIMIT $${paramIndex++} OFFSET $${paramIndex}`,
    [...queryParams, pageSize, offset]
  );

  const data = result.rows.map(mapRowToPenaltyRecord);

  return {
    data,
    total,
    page,
    pageSize,
    totalPages: Math.ceil(total / pageSize),
  };
}

/**
 * 获取我的考核记录
 */
export async function getMyPenalties(
  userId: number,
  params: { page?: number; pageSize?: number; status?: string }
): Promise<PenaltyListResult> {
  return getPenalties({
    ...params,
    status: params.status as PenaltyStatus | undefined,
    penaltyUserId: userId,
  });
}

/**
 * 获取单条考核记录
 */
export async function getPenaltyById(id: number): Promise<PenaltyRecord | null> {
  const result = await appQuery<PenaltyRow>(
    `SELECT
      p.id,
      p.return_order_id,
      p.penalty_type,
      p.penalty_user_id,
      p.penalty_user_name,
      p.penalty_role,
      p.base_amount,
      p.penalty_rate,
      p.overdue_days,
      p.penalty_amount,
      p.status,
      p.penalty_rule_snapshot,
      p.calculated_at,
      p.created_at,
      p.updated_at,
      r.return_no,
      r.goods_name,
      r.quantity
    FROM return_penalty_records p
    LEFT JOIN expiring_return_orders r ON p.return_order_id = r.id
    WHERE p.id = $1`,
    [id]
  );

  if (result.rows.length === 0) {
    return null;
  }

  return mapRowToPenaltyRecord(result.rows[0]);
}

/**
 * 获取考核统计数据
 */
export async function getPenaltyStats(): Promise<PenaltyStats> {
  // 基础统计
  const baseStatsResult = await appQuery<{
    total_amount: string;
    pending_count: string;
    pending_amount: string;
    confirmed_count: string;
    confirmed_amount: string;
    user_count: string;
    today_count: string;
    today_amount: string;
  }>(
    `SELECT
      COALESCE(SUM(penalty_amount), 0) as total_amount,
      COALESCE(COUNT(*) FILTER (WHERE status = 'pending'), 0) as pending_count,
      COALESCE(SUM(penalty_amount) FILTER (WHERE status = 'pending'), 0) as pending_amount,
      COALESCE(COUNT(*) FILTER (WHERE status = 'confirmed'), 0) as confirmed_count,
      COALESCE(SUM(penalty_amount) FILTER (WHERE status = 'confirmed'), 0) as confirmed_amount,
      COALESCE(COUNT(DISTINCT penalty_user_id), 0) as user_count,
      COALESCE(COUNT(*) FILTER (WHERE created_at::date = CURRENT_DATE), 0) as today_count,
      COALESCE(SUM(penalty_amount) FILTER (WHERE created_at::date = CURRENT_DATE), 0) as today_amount
    FROM return_penalty_records`
  );

  const baseStats = baseStatsResult.rows[0];

  // 按类型统计
  const byTypeResult = await appQuery<{
    type: PenaltyType;
    count: string;
    amount: string;
  }>(
    `SELECT
      penalty_type as type,
      COUNT(*) as count,
      COALESCE(SUM(penalty_amount), 0) as amount
    FROM return_penalty_records
    GROUP BY penalty_type
    ORDER BY amount DESC`
  );

  const typeNames: Record<PenaltyType, string> = {
    procurement_confirm_timeout: '采购确认超时',
    marketing_sale_timeout: '营销销售超时',
    return_expire_insufficient: '退货保质期不足',
    erp_fill_timeout: 'ERP录入超时',
    warehouse_execute_timeout: '仓储执行超时',
  };

  const byType = byTypeResult.rows.map(row => ({
    type: row.type,
    typeName: typeNames[row.type] || row.type,
    count: parseInt(row.count),
    amount: parseFloat(row.amount),
  }));

  return {
    totalAmount: parseFloat(baseStats?.total_amount || '0'),
    pendingCount: parseInt(baseStats?.pending_count || '0'),
    pendingAmount: parseFloat(baseStats?.pending_amount || '0'),
    confirmedCount: parseInt(baseStats?.confirmed_count || '0'),
    confirmedAmount: parseFloat(baseStats?.confirmed_amount || '0'),
    userCount: parseInt(baseStats?.user_count || '0'),
    todayCount: parseInt(baseStats?.today_count || '0'),
    todayAmount: parseFloat(baseStats?.today_amount || '0'),
    byType,
  };
}

/**
 * 更新考核状态
 */
export async function updatePenaltyStatus(
  id: number,
  status: string
): Promise<PenaltyRecord | null> {
  const result = await appQuery<PenaltyRow>(
    `UPDATE return_penalty_records
     SET status = $1, updated_at = NOW()
     WHERE id = $2
     RETURNING *`,
    [status, id]
  );

  if (result.rows.length === 0) {
    return null;
  }

  return mapRowToPenaltyRecord(result.rows[0]);
}
