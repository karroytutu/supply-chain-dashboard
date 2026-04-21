/**
 * 逾期预警查询服务
 * - 查询即将逾期的欠款数据（从ERP实时查询）
 * - 查询预警提醒历史记录
 */

import { query } from '../../db/pool';
import { appQuery } from '../../db/appPool';

// ============================================
// 类型定义
// ============================================

/** 预警等级（3级：today=今日到期, high=1-2天, medium=3-5天） */
export type WarningLevel = 'today' | 'high' | 'medium';

/** 即将逾期预警明细 */
export interface UpcomingWarningDetail {
  erpBillId: string;
  billNo: string;
  consumerName: string;
  managerUserName: string;
  managerUserId: number | null;
  leftAmount: number;
  expireDate: string;
  daysToExpire: number;
  warningLevel: WarningLevel;
  reminderCount: number;
  settleMethod: number;        // 结算方式: 1=现款7天, 2=挂账
  consumerExpireDay: number;   // 最大欠款天数
}

/** 预警汇总（3级） */
export interface WarningSummary {
  today: { count: number; amount: number };        // 今日到期（0天）
  within2Days: { count: number; amount: number };  // 1-2天内到期
  within5Days: { count: number; amount: number };  // 3-5天内到期
  totalCount: number;
  totalAmount: number;
}

/** 即将逾期预警数据 */
export interface UpcomingWarningData {
  summary: WarningSummary;
  details: UpcomingWarningDetail[];
  pagination: {
    page: number;
    pageSize: number;
    total: number;
  };
}

/** 预警提醒记录 */
export interface WarningReminder {
  id: number;
  erpBillId: string;
  consumerName: string;
  managerUserName: string;
  leftAmount: number;
  expireDate: string;
  reminderType: 'pre_5d' | 'pre_2d';
  reminderStatus: string;
  createdAt: string;
}

/** 预警查询参数 */
export interface WarningQueryParams {
  page?: number;
  pageSize?: number;
  warningLevel?: WarningLevel;
  managerUserId?: number;
}

/** 提醒记录查询参数 */
export interface ReminderQueryParams {
  page?: number;
  pageSize?: number;
  erpBillId?: string;
  managerUserId?: number;
}

// ============================================
// ERP欠款记录接口
// ============================================

interface ERPDebtRecord {
  billId: string;
  bizStr: string;
  bizOrderStr: string;  // 订单号（单据编号）
  consumerName: string;
  managerUsers: string;
  totalAmount: number;
  leftAmount: number;
  settleMethod: number;
  consumerExpireDay: number;
  billTypeName: string;
  workTime: string;
}

// ============================================
// 查询服务
// ============================================

/**
 * 获取即将逾期预警数据
 * 从ERP实时查询未逾期但即将到期的欠款
 */
export async function getUpcomingWarnings(
  params: WarningQueryParams = {},
): Promise<UpcomingWarningData> {
  const { page = 1, pageSize = 20, warningLevel, managerUserId } = params;

  // 1. 从ERP查询所有未收款的欠款
  const erpSql = `SELECT "billId", "bizStr", "bizOrderStr", "consumerName", "managerUsers",
    "totalAmount", "leftAmount", "settleMethod",
    "consumerExpireDay", "billTypeName", "workTime"
    FROM "客户欠款明细" WHERE "leftAmount"::numeric > 0`;

  const erpResult = await query<ERPDebtRecord>(erpSql, []);
  const now = new Date();

  // 2. 计算每条记录的到期日期和剩余天数
  const upcomingDebts: (ERPDebtRecord & {
    expireDate: Date;
    daysToExpire: number;
    warningLevel: WarningLevel;
  })[] = [];

  for (const debt of erpResult.rows) {
    const workDate = new Date(debt.workTime);
    // 注意: PostgreSQL numeric 类型返回字符串，需要转换为数字比较
    const maxDays = Number(debt.settleMethod) === 2 ? (Number(debt.consumerExpireDay) || 0) : 7;
    const expireDate = new Date(workDate.getTime() + maxDays * 86400000);
    const daysToExpire = Math.ceil((expireDate.getTime() - now.getTime()) / 86400000);

    // 筛选: 未逾期且5天内到期（包含今天到期）
    if (daysToExpire >= 0 && daysToExpire <= 5) {
      // 计算预警等级（3级：today=今日到期, high=1-2天, medium=3-5天）
      const level: WarningLevel = daysToExpire === 0 ? 'today' : (daysToExpire <= 2 ? 'high' : 'medium');

      upcomingDebts.push({
        ...debt,
        expireDate,
        daysToExpire,
        warningLevel: level,
      });
    }
  }

  // 3. 获取已发送提醒次数
  const billIds = upcomingDebts.map((d) => d.billId);
  const reminderCounts = new Map<string, number>();

  if (billIds.length > 0) {
    const countsResult = await appQuery<{ erp_bill_id: string; count: string }>(
      `SELECT erp_bill_id, COUNT(*) as count
       FROM ar_warning_reminders
       WHERE erp_bill_id = ANY($1)
       GROUP BY erp_bill_id`,
      [billIds],
    );
    for (const row of countsResult.rows) {
      reminderCounts.set(row.erp_bill_id, parseInt(row.count, 10));
    }
  }

  // 4. 获取责任人ID映射
  const managerNames = [...new Set(upcomingDebts.map((d) => d.managerUsers).filter(Boolean))];
  const managerIdMap = new Map<string, number>();

  console.log('[WarningQuery] 即将到期记录数:', upcomingDebts.length);
  console.log('[WarningQuery] 负责人列表:', managerNames);

  if (managerNames.length > 0) {
    const usersResult = await appQuery<{ name: string; id: number }>(
      `SELECT name, id FROM users WHERE name = ANY($1)`,
      [managerNames],
    );
    for (const row of usersResult.rows) {
      managerIdMap.set(row.name, row.id);
    }
    console.log('[WarningQuery] 用户名映射:', Object.fromEntries(managerIdMap));
  }

  // 5. 构建明细数据
  let details: UpcomingWarningDetail[] = upcomingDebts.map((debt) => ({
    erpBillId: debt.billId,
    billNo: debt.bizOrderStr || debt.billId,  // 使用订单号作为单据编号
    consumerName: debt.consumerName,
    managerUserName: debt.managerUsers || '',
    managerUserId: debt.managerUsers ? managerIdMap.get(debt.managerUsers) || null : null,
    leftAmount: Number(debt.leftAmount),
    expireDate: debt.expireDate.toISOString().slice(0, 10),
    daysToExpire: debt.daysToExpire,
    warningLevel: debt.warningLevel,
    reminderCount: reminderCounts.get(debt.billId) || 0,
    settleMethod: Number(debt.settleMethod),
    consumerExpireDay: Number(debt.consumerExpireDay) || 0,
  }));

  // 6. 筛选
  if (warningLevel) {
    details = details.filter((d) => d.warningLevel === warningLevel);
  }
  if (managerUserId) {
    console.log('[WarningQuery] 过滤负责人ID:', managerUserId, '过滤前:', details.length);
    details = details.filter((d) => d.managerUserId === managerUserId);
    console.log('[WarningQuery] 过滤后:', details.length);
  }

  // 7. 排序：按剩余天数升序
  details.sort((a, b) => a.daysToExpire - b.daysToExpire);

  // 8. 计算汇总（3级）——基于筛选后的明细数据
  const summary: WarningSummary = {
    today: { count: 0, amount: 0 },         // 今日到期（0天）
    within2Days: { count: 0, amount: 0 },  // 1-2天内到期
    within5Days: { count: 0, amount: 0 },  // 3-5天内到期
    totalCount: 0,
    totalAmount: 0,
  };

  for (const debt of details) {
    const amount = debt.leftAmount;
    summary.totalCount++;
    summary.totalAmount += amount;

    if (debt.daysToExpire === 0) {
      summary.today.count++;
      summary.today.amount += amount;
    } else if (debt.daysToExpire <= 2) {
      summary.within2Days.count++;
      summary.within2Days.amount += amount;
    } else {
      summary.within5Days.count++;
      summary.within5Days.amount += amount;
    }
  }

  // 9. 分页
  const total = details.length;
  const startIndex = (page - 1) * pageSize;
  const paginatedDetails = details.slice(startIndex, startIndex + pageSize);

  return {
    summary,
    details: paginatedDetails,
    pagination: {
      page,
      pageSize,
      total,
    },
  };
}

/**
 * 获取预警提醒历史记录
 */
export async function getWarningReminders(
  params: ReminderQueryParams = {},
): Promise<{ list: WarningReminder[]; pagination: { page: number; pageSize: number; total: number } }> {
  const { page = 1, pageSize = 20, erpBillId, managerUserId } = params;

  // 构建查询条件
  const conditions: string[] = [];
  const queryParams: any[] = [];
  let paramIndex = 1;

  if (erpBillId) {
    conditions.push(`erp_bill_id = $${paramIndex++}`);
    queryParams.push(erpBillId);
  }
  if (managerUserId) {
    conditions.push(`manager_user_id = $${paramIndex++}`);
    queryParams.push(managerUserId);
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  // 查询总数
  const countResult = await appQuery<{ count: string }>(
    `SELECT COUNT(*) as count FROM ar_warning_reminders ${whereClause}`,
    queryParams,
  );
  const total = parseInt(countResult.rows[0]?.count || '0', 10);

  // 查询列表
  const offset = (page - 1) * pageSize;
  const listResult = await appQuery<WarningReminder>(
    `SELECT id, erp_bill_id, consumer_name, manager_user_name,
            left_amount, expire_date, reminder_type, reminder_status, created_at
     FROM ar_warning_reminders
     ${whereClause}
     ORDER BY created_at DESC
     LIMIT $${paramIndex++} OFFSET $${paramIndex}`,
    [...queryParams, pageSize, offset],
  );

  return {
    list: listResult.rows.map((row: any) => ({
      id: row.id,
      erpBillId: row.erp_bill_id,
      consumerName: row.consumer_name,
      managerUserName: row.manager_user_name,
      leftAmount: Number(row.left_amount),
      expireDate: row.expire_date?.toISOString?.().slice(0, 10) || row.expire_date,
      reminderType: row.reminder_type as 'pre_5d' | 'pre_2d',
      reminderStatus: row.reminder_status,
      createdAt: row.created_at?.toISOString?.() || row.created_at,
    })),
    pagination: {
      page,
      pageSize,
      total,
    },
  };
}

/**
 * 检查今日是否已发送过某类型提醒
 * 用于幂等检查
 */
export async function hasReminderSentToday(
  erpBillId: string,
  reminderType: string,
): Promise<boolean> {
  const result = await appQuery<{ count: string }>(
    `SELECT COUNT(*) as count FROM ar_warning_reminders
     WHERE erp_bill_id = $1
       AND reminder_type = $2
       AND DATE(created_at) = CURRENT_DATE`,
    [erpBillId, reminderType],
  );
  return parseInt(result.rows[0]?.count || '0', 10) > 0;
}

/**
 * 记录预警提醒
 */
export async function recordWarningReminder(params: {
  erpBillId: string;
  consumerName: string;
  managerUserName: string;
  managerUserId: number | null;
  leftAmount: number;
  expireDate: string;
  daysToExpire: number;
  reminderType: 'pre_5d' | 'pre_2d';
  reminderStatus: 'sent' | 'failed';
  receiverUserId: number | null;
}): Promise<void> {
  await appQuery(
    `INSERT INTO ar_warning_reminders
      (erp_bill_id, consumer_name, manager_user_name, manager_user_id,
       left_amount, expire_date, days_to_expire, reminder_type, reminder_status, receiver_user_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
    [
      params.erpBillId,
      params.consumerName,
      params.managerUserName,
      params.managerUserId,
      params.leftAmount,
      params.expireDate,
      params.daysToExpire,
      params.reminderType,
      params.reminderStatus,
      params.receiverUserId,
    ],
  );
}

/**
 * 检查某笔欠款是否已收到过某级别的预警（用于去重）
 * @param erpBillId ERP单据ID
 * @param reminderType 提醒类型
 */
export async function hasBillReminderSent(
  erpBillId: string,
  reminderType: 'pre_5d' | 'pre_2d',
): Promise<boolean> {
  const result = await appQuery<{ count: string }>(
    `SELECT COUNT(*) as count FROM ar_warning_reminders
     WHERE erp_bill_id = $1 AND reminder_type = $2`,
    [erpBillId, reminderType],
  );
  return parseInt(result.rows[0]?.count || '0', 10) > 0;
}
