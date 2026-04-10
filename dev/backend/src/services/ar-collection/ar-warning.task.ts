/**
 * 逾期预警提醒定时任务
 * - 检查即将到期的欠款并发送预警提醒
 * - 记录提醒日志到 ar_warning_reminders 表
 */

import { query } from '../../db/pool';
import { appQuery } from '../../db/appPool';
import { config } from '../../config';
import {
  hasReminderSentToday,
  recordWarningReminder,
  hasBillReminderSent,
} from './ar-warning.query';
import {
  sendCollectionNotification,
  buildMergedWarningMessage,
  type WarningDebtItem,
} from './ar-collection-notify';

// ============================================
// 类型定义
// ============================================

interface ERPDebtRecord {
  billId: string;
  consumerName: string;
  managerUsers: string;
  totalAmount: number;
  leftAmount: number;
  settleMethod: number;
  consumerExpireDay: number;
  workTime: string;
}

interface UpcomingDebt extends ERPDebtRecord {
  expireDate: Date;
  daysToExpire: number;
  managerUserId: number | null;
  managerName: string;
}

// ============================================
// 定时任务
// ============================================

/**
 * 检查并发送逾期预警提醒
 * 执行时机：每天 20:00
 *
 * 推送策略：
 * - 按营销师合并推送，每个营销师只收到一条汇总消息
 * - 按预警级别分组：2天预警(1-2天) > 5天预警(3-5天)
 * - 去重机制：每笔欠款每个级别只收到一次预警
 */
export async function checkUpcomingOverdueReminders(): Promise<void> {
  console.log('[WarningTask] 开始检查即将到期欠款...');
  const startTime = Date.now();
  const startDateFilter = config.arCollection.startDate;

  try {
    // 1. 从ERP查询所有未收款的欠款
    let erpSql = `SELECT "billId", "consumerName", "managerUsers",
      "totalAmount", "leftAmount", "settleMethod",
      "consumerExpireDay", "workTime"
      FROM "客户欠款明细" WHERE "leftAmount"::numeric > 0`;
    const erpParams: any[] = [];

    if (startDateFilter) {
      erpSql += ` AND "workTime" >= $${erpParams.length + 1}`;
      erpParams.push(startDateFilter);
    }

    const erpResult = await query<ERPDebtRecord>(erpSql, erpParams);
    const now = new Date();

    // 2. 筛选即将到期的欠款（5天内）
    const upcomingDebts: UpcomingDebt[] = [];

    for (const debt of erpResult.rows) {
      const workDate = new Date(debt.workTime);
      // 注意: PostgreSQL numeric 类型返回字符串，需要转换为数字比较
      const maxDays = Number(debt.settleMethod) === 2 ? (Number(debt.consumerExpireDay) || 0) : 7;
      const expireDate = new Date(workDate.getTime() + maxDays * 86400000);
      const daysToExpire = Math.ceil((expireDate.getTime() - now.getTime()) / 86400000);

      // 筛选: 未逾期且5天内到期
      if (daysToExpire > 0 && daysToExpire <= 5) {
        upcomingDebts.push({
          ...debt,
          expireDate,
          daysToExpire,
          managerUserId: null, // 后续填充
          managerName: debt.managerUsers?.split(',')[0].trim() || '',
        });
      }
    }

    if (upcomingDebts.length === 0) {
      console.log('[WarningTask] 无即将到期的欠款');
      return;
    }

    console.log(`[WarningTask] 发现 ${upcomingDebts.length} 条即将到期的欠款`);

    // 3. 获取责任人ID映射
    const managerNames = [...new Set(upcomingDebts.map((d) => d.managerName).filter(Boolean))];
    const managerIdMap = new Map<string, number>();

    if (managerNames.length > 0) {
      const usersResult = await appQuery<{ name: string; id: number }>(
        `SELECT name, id FROM users WHERE name = ANY($1)`,
        [managerNames],
      );
      for (const row of usersResult.rows) {
        managerIdMap.set(row.name, row.id);
      }
    }

    // 填充责任人ID
    for (const debt of upcomingDebts) {
      if (debt.managerName) {
        debt.managerUserId = managerIdMap.get(debt.managerName) || null;
      }
    }

    // 4. 按营销师分组合并推送
    const stats = { managers: 0, bills: 0, failed: 0 };

    // 按营销师分组
    const groupedByManager = new Map<string, UpcomingDebt[]>();
    for (const debt of upcomingDebts) {
      if (!debt.managerName) continue;
      const existing = groupedByManager.get(debt.managerName) || [];
      existing.push(debt);
      groupedByManager.set(debt.managerName, existing);
    }

    // 逐个营销师发送汇总推送
    for (const [managerName, debts] of groupedByManager.entries()) {
      const managerUserId = managerIdMap.get(managerName);
      if (!managerUserId) {
        console.log(`[WarningTask] 营销师 ${managerName} 无用户ID，跳过`);
        continue;
      }

      // 幂等检查：今日是否已发送过汇总提醒
      const alreadySent = await hasManagerReminderSentToday(managerName);
      if (alreadySent) {
        console.log(`[WarningTask] ${managerName} 今日已发送过提醒，跳过`);
        continue;
      }

      const sent = await sendMergedReminder(managerName, managerUserId, debts);
      if (sent) {
        stats.managers++;
        stats.bills += debts.length;
      } else {
        stats.failed++;
      }
    }

    const duration = Date.now() - startTime;
    console.log(
      `[WarningTask] 预警提醒完成: 推送${stats.managers}位营销师，${stats.bills}张单据，失败${stats.failed}，耗时=${duration}ms`,
    );
  } catch (error) {
    console.error('[WarningTask] 预警提醒检查失败:', error);
  }
}

/**
 * 检查某营销师今日是否已发送过提醒
 */
async function hasManagerReminderSentToday(managerName: string): Promise<boolean> {
  try {
    const result = await appQuery<{ count: string }>(
      `SELECT COUNT(*) as count FROM ar_warning_reminders
       WHERE manager_user_name = $1
       AND created_at::date = CURRENT_DATE`,
      [managerName]
    );
    return parseInt(result.rows[0]?.count || '0') > 0;
  } catch {
    return false;
  }
}

/**
 * 发送合并后的预警提醒（按营销师汇总）
 * 包含去重检查：每笔欠款每个级别只发送一次
 */
async function sendMergedReminder(
  managerName: string,
  managerUserId: number,
  debts: UpcomingDebt[],
): Promise<boolean> {
  // 去重检查：过滤掉已发送过对应级别预警的欠款
  const debtsToSend: UpcomingDebt[] = [];
  
  for (const debt of debts) {
    // 确定该欠款当前应发送的预警类型
    const reminderType: 'pre_5d' | 'pre_2d' = debt.daysToExpire <= 2 ? 'pre_2d' : 'pre_5d';
    
    // 检查是否已发送过该级别的预警
    const alreadySent = await hasBillReminderSent(debt.billId, reminderType);
    if (!alreadySent) {
      debtsToSend.push(debt);
    }
  }

  if (debtsToSend.length === 0) {
    console.log(`[WarningTask] ${managerName} 的所有欠款都已发送过对应级别预警，跳过`);
    return false;
  }

  // 转换为消息模板所需的格式
  const debtItems: WarningDebtItem[] = debtsToSend.map(d => ({
    erpBillId: d.billId,
    consumerName: d.consumerName,
    leftAmount: Number(d.leftAmount),
    expireDate: d.expireDate.toISOString().slice(0, 10),
    daysToExpire: d.daysToExpire,
    settleMethod: d.settleMethod,
  }));

  // 构建合并消息
  const message = buildMergedWarningMessage({
    managerName,
    debts: debtItems,
  });

  let reminderStatus: 'sent' | 'failed' = 'sent';

  try {
    // 发送给责任人
    await sendCollectionNotification({
      userIds: [managerUserId],
      title: message.title,
      content: message.content,
    });
  } catch (error) {
    console.error('[WarningTask] 发送预警提醒失败:', managerName, error);
    reminderStatus = 'failed';
  }

  // 记录提醒日志（每张单据单独记录）
  for (const debt of debtsToSend) {
    try {
      // 确定提醒类型（简化为2级：pre_2d=1-2天, pre_5d=3-5天）
      const reminderType: 'pre_5d' | 'pre_2d' = debt.daysToExpire <= 2 ? 'pre_2d' : 'pre_5d';

      await recordWarningReminder({
        erpBillId: debt.billId,
        consumerName: debt.consumerName || '',
        managerUserName: managerName,
        managerUserId,
        leftAmount: Number(debt.leftAmount),
        expireDate: debt.expireDate.toISOString().slice(0, 10),
        daysToExpire: debt.daysToExpire,
        reminderType,
        reminderStatus,
        receiverUserId: managerUserId,
      });
    } catch (error) {
      console.error('[WarningTask] 记录提醒日志失败:', debt.billId, error);
    }
  }

  return reminderStatus === 'sent';
}
