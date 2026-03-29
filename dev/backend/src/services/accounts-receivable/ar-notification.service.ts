/**
 * 应收账款通知服务
 * 实现11种推送通知的消息构建和发送逻辑
 */

import { appQuery, getAppClient } from '../../db/appPool';
import { sendWorkNotification } from '../dingtalk.service';
import {
  BillDetail,
  DailySummaryStats,
  buildPreWarn5Message,
  buildPreWarn2Message,
  buildOverdueCollectMessage,
  buildTimeoutPenaltyMessage,
  buildEscalateMessage,
  buildAutoEscalateMessage,
  buildPendingReviewMessage,
  buildReviewResultMessage,
  buildPaymentConfirmedMessage,
  buildGuaranteeNotifyMessage,
  buildDailySummaryMessage,
  getNotificationTitle,
} from './ar-notification-templates';
import type { NotificationType, CollectorLevel } from './ar.types';

/** 系统基础URL */
const SYSTEM_BASE_URL = process.env.SYSTEM_BASE_URL || 'http://localhost:3100';

/**
 * 营销师匹配结果
 */
export interface MarketingUser {
  userId: number;
  dingtalkUserId: string;
  name: string;
}

/**
 * 通过营销师姓名匹配钉钉用户ID
 * manager_users → 匹配 users 表 name 字段 → 获取 dingtalk_user_id
 */
export async function matchMarketingUser(managerUsers: string): Promise<MarketingUser | null> {
  try {
    // manager_users 可能是逗号分隔的多个名字，取第一个
    const firstName = managerUsers.split(',')[0].trim();
    if (!firstName) return null;

    const result = await appQuery<{
      id: number;
      dingtalk_user_id: string | null;
      name: string;
    }>(
      'SELECT id, dingtalk_user_id, name FROM users WHERE name = $1 AND status = 1 LIMIT 1',
      [firstName]
    );

    if (result.rows.length === 0 || !result.rows[0].dingtalk_user_id) {
      console.log('[AR-Notification] 未找到营销师钉钉ID:', firstName);
      return null;
    }

    return {
      userId: result.rows[0].id,
      dingtalkUserId: result.rows[0].dingtalk_user_id,
      name: result.rows[0].name,
    };
  } catch (error) {
    console.error('[AR-Notification] 匹配营销师失败:', error);
    return null;
  }
}

/**
 * 保存通知记录到 ar_notification_records
 */
export async function saveNotificationRecord(params: {
  arIds: number[];
  notificationType: string;
  recipientId: number;
  recipientName: string;
  consumerName: string;
  billCount: number;
  messageContent: string;
  status: 'pending' | 'sent' | 'failed';
  dingtalkTaskId?: string;
  errorMessage?: string;
}): Promise<number> {
  try {
    const result = await appQuery<{ id: number }>(
      `INSERT INTO ar_notification_records
       (ar_ids, notification_type, recipient_id, recipient_name, consumer_name,
        bill_count, message_content, status, dingtalk_task_id, error_message)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       RETURNING id`,
      [
        params.arIds,
        params.notificationType,
        params.recipientId,
        params.recipientName,
        params.consumerName,
        params.billCount,
        params.messageContent,
        params.status,
        params.dingtalkTaskId || null,
        params.errorMessage || null,
      ]
    );
    return result.rows[0].id;
  } catch (error) {
    console.error('[AR-Notification] 保存通知记录失败:', error);
    throw error;
  }
}

/**
 * 发送钉钉通知并记录结果
 */
export async function sendAndRecordNotification(params: {
  arIds: number[];
  notificationType: NotificationType;
  recipientId: number;
  recipientName: string;
  recipientDingtalkId: string;
  consumerName: string;
  billCount: number;
  title: string;
  markdownContent: string;
}): Promise<boolean> {
  try {
    // 发送钉钉通知
    const result = await sendWorkNotification(
      [params.recipientDingtalkId],
      params.title,
      params.markdownContent
    );

    if (result.success) {
      // 保存成功记录
      await saveNotificationRecord({
        ...params,
        status: 'sent',
        messageContent: params.markdownContent,
      });

      // 更新 ar_receivables 的 last_notified_at
      await appQuery(
        `UPDATE ar_receivables
         SET last_notified_at = NOW(), updated_at = NOW()
         WHERE id = ANY($1)`,
        [params.arIds]
      );

      console.log('[AR-Notification] 发送成功:', params.notificationType, params.consumerName);
      return true;
    } else {
      // 保存失败记录
      await saveNotificationRecord({
        ...params,
        status: 'failed',
        messageContent: params.markdownContent,
        errorMessage: result.message,
      });

      console.error('[AR-Notification] 发送失败:', result.message);
      return false;
    }
  } catch (error: any) {
    // 保存异常记录
    await saveNotificationRecord({
      ...params,
      status: 'failed',
      messageContent: params.markdownContent,
      errorMessage: error.message,
    });

    console.error('[AR-Notification] 发送异常:', error);
    return false;
  }
}

/**
 * 检查今天是否已发送过同类通知（防重复）
 */
export async function hasNotifiedToday(
  recipientId: number,
  notificationType: string,
  consumerName: string
): Promise<boolean> {
  try {
    const result = await appQuery(
      `SELECT 1 FROM ar_notification_records
       WHERE recipient_id = $1
         AND notification_type = $2
         AND consumer_name = $3
         AND status = 'sent'
         AND DATE(created_at) = CURRENT_DATE
       LIMIT 1`,
      [recipientId, notificationType, consumerName]
    );
    return (result.rowCount ?? 0) > 0;
  } catch (error) {
    console.error('[AR-Notification] 检查通知记录失败:', error);
    return false;
  }
}

/**
 * 更新应收账款状态
 */
async function updateArStatus(arIds: number[], arStatus: string, notificationStatus?: string): Promise<void> {
  const client = await getAppClient();
  try {
    await client.query('BEGIN');

    if (notificationStatus) {
      await client.query(
        `UPDATE ar_receivables
         SET ar_status = $1, notification_status = $2, updated_at = NOW()
         WHERE id = ANY($3)`,
        [arStatus, notificationStatus, arIds]
      );
    } else {
      await client.query(
        `UPDATE ar_receivables
         SET ar_status = $1, updated_at = NOW()
         WHERE id = ANY($2)`,
        [arStatus, arIds]
      );
    }

    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

/**
 * 生成催收任务编号
 */
async function generateTaskNo(): Promise<string> {
  const date = new Date();
  const dateStr = `${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, '0')}${String(date.getDate()).padStart(2, '0')}`;

  const result = await appQuery<{ count: string }>(
    `SELECT COUNT(*)::text FROM ar_collection_tasks
     WHERE task_no LIKE $1`,
    [`AR-TASK-${dateStr}-%`]
  );

  const count = parseInt(result.rows[0].count, 10) + 1;
  return `AR-TASK-${dateStr}-${String(count).padStart(4, '0')}`;
}

/**
 * 创建催收任务
 */
async function createCollectionTask(
  arId: number,
  collectorId: number,
  collectorRole: CollectorLevel,
  deadlineDays: number = 3
): Promise<number> {
  const taskNo = await generateTaskNo();
  const result = await appQuery<{ id: number }>(
    `INSERT INTO ar_collection_tasks
     (ar_id, task_no, collector_id, collector_role, assigned_at, deadline_at, status)
     VALUES ($1, $2, $3, $4, NOW(), NOW() + INTERVAL '1 day' * $5, 'pending')
     RETURNING id`,
    [arId, taskNo, collectorId, collectorRole, deadlineDays]
  );
  return result.rows[0].id;
}

// ==================== 定时推送任务（每日20:00执行） ====================

/**
 * 任务1: 逾期前5天预警
 */
async function sendPreWarn5Notifications(): Promise<void> {
  console.log('[AR-Notification] 执行逾期前5天预警...');

  const result = await appQuery<{
    id: number;
    consumer_name: string;
    manager_users: string;
    settle_method: number;
    erp_bill_id: string;
    left_amount: number;
    due_date: Date;
  }>(
    `SELECT id, consumer_name, manager_users, settle_method, erp_bill_id, left_amount, due_date
     FROM ar_receivables
     WHERE due_date::date - CURRENT_DATE = 5
       AND ar_status IN ('synced', 'pre_warning_5')
       AND notification_status NOT IN ('pre_warn_5_sent', 'pre_warn_2_sent', 'overdue_sent')`
  );

  // 按 (manager_users, consumer_name) 分组
  const grouped = new Map<string, typeof result.rows>();
  for (const row of result.rows) {
    const key = `${row.manager_users || ''}|${row.consumer_name}`;
    if (!grouped.has(key)) {
      grouped.set(key, []);
    }
    grouped.get(key)!.push(row);
  }

  // 逐组发送
  for (const [key, bills] of grouped) {
    const [managerUsers, consumerName] = key.split('|');
    const marketingUser = await matchMarketingUser(managerUsers);
    if (!marketingUser) continue;

    // 防重复检查
    if (await hasNotifiedToday(marketingUser.userId, 'pre_warn_5', consumerName)) {
      continue;
    }

    const billDetails: BillDetail[] = bills.map(b => ({
      billNo: b.erp_bill_id,
      amount: b.left_amount,
      dueDate: new Date(b.due_date).toISOString().split('T')[0],
    }));

    const settleMethod = bills[0].settle_method === 1 ? '月结' : '现结';
    const content = buildPreWarn5Message(consumerName, settleMethod, billDetails);
    const title = getNotificationTitle('pre_warn_5', consumerName);

    const sent = await sendAndRecordNotification({
      arIds: bills.map(b => b.id),
      notificationType: 'pre_warn_5',
      recipientId: marketingUser.userId,
      recipientName: marketingUser.name,
      recipientDingtalkId: marketingUser.dingtalkUserId,
      consumerName,
      billCount: bills.length,
      title,
      markdownContent: content,
    });

    if (sent) {
      await updateArStatus(bills.map(b => b.id), 'pre_warning_5', 'pre_warn_5_sent');
    }
  }
}

/**
 * 任务2: 逾期前2天紧急预警
 */
async function sendPreWarn2Notifications(): Promise<void> {
  console.log('[AR-Notification] 执行逾期前2天紧急预警...');

  const result = await appQuery<{
    id: number;
    consumer_name: string;
    manager_users: string;
    erp_bill_id: string;
    left_amount: number;
    due_date: Date;
  }>(
    `SELECT id, consumer_name, manager_users, erp_bill_id, left_amount, due_date
     FROM ar_receivables
     WHERE due_date::date - CURRENT_DATE = 2
       AND ar_status IN ('synced', 'pre_warning_5', 'pre_warning_2')
       AND notification_status NOT IN ('pre_warn_2_sent', 'overdue_sent')`
  );

  const grouped = new Map<string, typeof result.rows>();
  for (const row of result.rows) {
    const key = `${row.manager_users || ''}|${row.consumer_name}`;
    if (!grouped.has(key)) {
      grouped.set(key, []);
    }
    grouped.get(key)!.push(row);
  }

  for (const [key, bills] of grouped) {
    const [managerUsers, consumerName] = key.split('|');
    const marketingUser = await matchMarketingUser(managerUsers);
    if (!marketingUser) continue;

    if (await hasNotifiedToday(marketingUser.userId, 'pre_warn_2', consumerName)) {
      continue;
    }

    const billDetails: BillDetail[] = bills.map(b => ({
      billNo: b.erp_bill_id,
      amount: b.left_amount,
      dueDate: new Date(b.due_date).toISOString().split('T')[0],
    }));

    const content = buildPreWarn2Message(consumerName, billDetails);
    const title = getNotificationTitle('pre_warn_2', consumerName);

    const sent = await sendAndRecordNotification({
      arIds: bills.map(b => b.id),
      notificationType: 'pre_warn_2',
      recipientId: marketingUser.userId,
      recipientName: marketingUser.name,
      recipientDingtalkId: marketingUser.dingtalkUserId,
      consumerName,
      billCount: bills.length,
      title,
      markdownContent: content,
    });

    if (sent) {
      await updateArStatus(bills.map(b => b.id), 'pre_warning_2', 'pre_warn_2_sent');
    }
  }
}

/**
 * 任务3: 逾期触发催收
 */
async function sendOverdueCollectNotifications(): Promise<void> {
  console.log('[AR-Notification] 执行逾期触发催收...');

  const result = await appQuery<{
    id: number;
    consumer_name: string;
    manager_users: string;
    erp_bill_id: string;
    left_amount: number;
    due_date: Date;
  }>(
    `SELECT id, consumer_name, manager_users, erp_bill_id, left_amount, due_date
     FROM ar_receivables
     WHERE due_date <= CURRENT_DATE
       AND ar_status IN ('synced', 'pre_warning_5', 'pre_warning_2')
       AND left_amount > 0`
  );

  const grouped = new Map<string, typeof result.rows>();
  for (const row of result.rows) {
    const key = `${row.manager_users || ''}|${row.consumer_name}`;
    if (!grouped.has(key)) {
      grouped.set(key, []);
    }
    grouped.get(key)!.push(row);
  }

  for (const [key, bills] of grouped) {
    const [managerUsers, consumerName] = key.split('|');
    const marketingUser = await matchMarketingUser(managerUsers);
    if (!marketingUser) continue;

    // 更新状态为逾期
    const arIds = bills.map(b => b.id);
    await updateArStatus(arIds, 'overdue', 'overdue_sent');

    // 为每张单据创建催收任务
    for (const bill of bills) {
      await createCollectionTask(bill.id, marketingUser.userId, 'marketing');
    }

    // 更新催收人信息
    await appQuery(
      `UPDATE ar_receivables
       SET current_collector_id = $1, collector_level = 'marketing', updated_at = NOW()
       WHERE id = ANY($2)`,
      [marketingUser.userId, arIds]
    );

    // 计算催收截止日期
    const deadlineDate = new Date();
    deadlineDate.setDate(deadlineDate.getDate() + 3);
    const deadlineStr = deadlineDate.toISOString().split('T')[0];

    const billDetails: BillDetail[] = bills.map(b => ({
      billNo: b.erp_bill_id,
      amount: b.left_amount,
      dueDate: new Date(b.due_date).toISOString().split('T')[0],
      overdueDays: Math.floor((Date.now() - new Date(b.due_date).getTime()) / (1000 * 60 * 60 * 24)),
    }));

    const content = buildOverdueCollectMessage(consumerName, deadlineStr, billDetails);
    const title = getNotificationTitle('overdue_collect', consumerName);

    await sendAndRecordNotification({
      arIds,
      notificationType: 'overdue_collect',
      recipientId: marketingUser.userId,
      recipientName: marketingUser.name,
      recipientDingtalkId: marketingUser.dingtalkUserId,
      consumerName,
      billCount: bills.length,
      title,
      markdownContent: content,
    });
  }
}

/**
 * 任务4: 超时检查与考核
 */
async function checkTimeoutAndPenalty(): Promise<void> {
  console.log('[AR-Notification] 执行超时检查与考核...');

  const result = await appQuery<{
    task_id: number;
    ar_id: number;
    collector_id: number;
    collector_role: CollectorLevel;
    consumer_name: string;
    left_amount: number;
    erp_bill_id: string;
    deadline_at: Date;
    due_date: Date;
  }>(
    `SELECT t.id as task_id, t.collector_id, t.collector_role, t.deadline_at,
            r.id as ar_id, r.consumer_name, r.left_amount, r.erp_bill_id, r.due_date
     FROM ar_collection_tasks t
     JOIN ar_receivables r ON t.ar_id = r.id
     WHERE t.status IN ('pending', 'in_progress')
       AND t.deadline_at < NOW()`
  );

  // 按催收人分组
  const grouped = new Map<number, typeof result.rows>();
  for (const row of result.rows) {
    if (!grouped.has(row.collector_id)) {
      grouped.set(row.collector_id, []);
    }
    grouped.get(row.collector_id)!.push(row);
  }

  for (const [collectorId, tasks] of grouped) {
    // 获取催收人钉钉ID
    const userResult = await appQuery<{ dingtalk_user_id: string; name: string }>(
      'SELECT dingtalk_user_id, name FROM users WHERE id = $1',
      [collectorId]
    );
    if (userResult.rows.length === 0 || !userResult.rows[0].dingtalk_user_id) continue;

    const collector = userResult.rows[0];
    const consumerName = tasks[0].consumer_name;

    // 计算考核金额
    let totalPenalty = 0;
    const billDetails: BillDetail[] = [];

    for (const task of tasks) {
      const timeoutDays = Math.floor(
        (Date.now() - new Date(task.deadline_at).getTime()) / (1000 * 60 * 60 * 24)
      );

      let penaltyAmount = 0;
      let penaltyLevel = 'none';

      if (task.collector_role === 'marketing' || task.collector_role === 'finance') {
        if (timeoutDays >= 7) {
          penaltyAmount = task.left_amount;
          penaltyLevel = 'full';
        } else if (timeoutDays >= 4) {
          penaltyAmount = 20;
          penaltyLevel = 'double';
        } else if (timeoutDays >= 3) {
          penaltyAmount = 10;
          penaltyLevel = 'base';
        }
      } else if (task.collector_role === 'supervisor') {
        if (timeoutDays >= 7) {
          penaltyAmount = task.left_amount;
          penaltyLevel = 'full';
        } else if (timeoutDays >= 4) {
          penaltyAmount = 100;
          penaltyLevel = 'double';
        } else if (timeoutDays >= 3) {
          penaltyAmount = 50;
          penaltyLevel = 'base';
        }
      }

      totalPenalty += penaltyAmount;

      billDetails.push({
        billNo: task.erp_bill_id,
        amount: task.left_amount,
        overdueDays: Math.floor((Date.now() - new Date(task.due_date).getTime()) / (1000 * 60 * 60 * 24)),
        penaltyAmount,
      });

      // 保存/更新考核记录
      if (penaltyAmount > 0) {
        await appQuery(
          `INSERT INTO ar_penalty_records (ar_id, task_id, user_id, penalty_level, overdue_days, penalty_amount, status)
           VALUES ($1, $2, $3, $4, $5, $6, 'pending')
           ON CONFLICT (ar_id, task_id) DO UPDATE
           SET penalty_level = $4, penalty_amount = $6, updated_at = NOW()`,
          [task.ar_id, task.task_id, collectorId, penaltyLevel, timeoutDays, penaltyAmount]
        );
      }
    }

    if (totalPenalty > 0) {
      const maxTimeout = Math.max(
        ...tasks.map(t => Math.floor((Date.now() - new Date(t.deadline_at).getTime()) / (1000 * 60 * 60 * 24)))
      );

      const content = buildTimeoutPenaltyMessage(consumerName, maxTimeout, totalPenalty, billDetails);
      const title = getNotificationTitle('timeout_penalty', consumerName);

      await sendAndRecordNotification({
        arIds: tasks.map(t => t.ar_id),
        notificationType: 'timeout_penalty',
        recipientId: collectorId,
        recipientName: collector.name,
        recipientDingtalkId: collector.dingtalk_user_id,
        consumerName,
        billCount: tasks.length,
        title,
        markdownContent: content,
      });
    }
  }
}

/**
 * 任务5: 延期到期自动升级
 */
async function processAutoEscalate(): Promise<void> {
  console.log('[AR-Notification] 执行延期到期自动升级...');

  const result = await appQuery<{
    task_id: number;
    ar_id: number;
    collector_id: number;
    collector_role: CollectorLevel;
    result_type: string;
    latest_pay_date: Date;
    consumer_name: string;
    left_amount: number;
    erp_bill_id: string;
    due_date: Date;
  }>(
    `SELECT t.id as task_id, t.collector_id, t.collector_role, t.result_type, t.latest_pay_date,
            r.id as ar_id, r.consumer_name, r.left_amount, r.erp_bill_id, r.due_date
     FROM ar_collection_tasks t
     JOIN ar_receivables r ON t.ar_id = r.id
     WHERE t.result_type IN ('customer_delay', 'guarantee_delay')
       AND t.latest_pay_date <= CURRENT_DATE
       AND t.status = 'completed'
       AND r.ar_status = 'collecting'
       AND r.left_amount > 0`
  );

  for (const row of result.rows) {
    // 确定升级目标
    let newCollectorRole: CollectorLevel;
    if (row.collector_role === 'marketing') {
      newCollectorRole = 'supervisor';
    } else if (row.collector_role === 'supervisor') {
      newCollectorRole = 'finance';
    } else {
      continue; // 财务不再升级
    }

    // 查找新催收人（这里需要根据业务逻辑找到对应角色的用户）
    // 简化处理：查找有管理角色的用户
    const adminResult = await appQuery<{ id: number; dingtalk_user_id: string; name: string }>(
      `SELECT u.id, u.dingtalk_user_id, u.name
       FROM users u
       JOIN role_user ru ON u.id = ru.user_id
       JOIN roles r ON ru.role_id = r.id
       WHERE r.code = $1 AND u.status = 1
       LIMIT 1`,
      [newCollectorRole === 'supervisor' ? 'supervisor' : 'finance']
    );

    if (adminResult.rows.length === 0 || !adminResult.rows[0].dingtalk_user_id) {
      console.log('[AR-Notification] 未找到升级目标催收人');
      continue;
    }

    const newCollector = adminResult.rows[0];

    // 获取原催收人信息
    const oldCollectorResult = await appQuery<{ name: string }>(
      'SELECT name FROM users WHERE id = $1',
      [row.collector_id]
    );
    const oldCollectorName = oldCollectorResult.rows[0]?.name || '未知';

    // 标记原任务已升级
    await appQuery(
      `UPDATE ar_collection_tasks SET status = 'escalated', updated_at = NOW() WHERE id = $1`,
      [row.task_id]
    );

    // 创建新催收任务
    await createCollectionTask(row.ar_id, newCollector.id, newCollectorRole);

    // 更新应收账款
    await appQuery(
      `UPDATE ar_receivables
       SET current_collector_id = $1, collector_level = $2, updated_at = NOW()
       WHERE id = $3`,
      [newCollector.id, newCollectorRole, row.ar_id]
    );

    const billDetail: BillDetail = {
      billNo: row.erp_bill_id,
      amount: row.left_amount,
      dueDate: new Date(row.due_date).toISOString().split('T')[0],
      overdueDays: Math.floor((Date.now() - new Date(row.due_date).getTime()) / (1000 * 60 * 60 * 24)),
    };

    const delayType = row.result_type === 'customer_delay' ? '客户延期' : '营销担保延期';
    const content = buildAutoEscalateMessage(
      row.consumer_name,
      delayType,
      new Date(row.latest_pay_date).toISOString().split('T')[0],
      oldCollectorName,
      [billDetail]
    );
    const title = getNotificationTitle('auto_escalate', row.consumer_name);

    await sendAndRecordNotification({
      arIds: [row.ar_id],
      notificationType: 'auto_escalate',
      recipientId: newCollector.id,
      recipientName: newCollector.name,
      recipientDingtalkId: newCollector.dingtalk_user_id,
      consumerName: row.consumer_name,
      billCount: 1,
      title,
      markdownContent: content,
    });
  }
}

/**
 * 任务6: 每日催收进度汇总
 */
async function sendDailySummary(): Promise<void> {
  console.log('[AR-Notification] 执行每日催收进度汇总...');

  // 统计数据
  const statsResult = await appQuery<{
    total_amount: string;
    overdue_amount: string;
    new_overdue_today: string;
    collecting_count: string;
    pending_review_count: string;
    resolved_today: string;
    penalty_total: string;
  }>(
    `SELECT
       COALESCE(SUM(left_amount), 0)::text as total_amount,
       COALESCE(SUM(CASE WHEN ar_status = 'overdue' OR ar_status = 'collecting' THEN left_amount ELSE 0 END), 0)::text as overdue_amount,
       COALESCE(SUM(CASE WHEN due_date::date = CURRENT_DATE AND ar_status IN ('synced', 'pre_warning_5', 'pre_warning_2') THEN left_amount ELSE 0 END), 0)::text as new_overdue_today,
       (SELECT COUNT(*)::text FROM ar_receivables WHERE ar_status = 'collecting') as collecting_count,
       (SELECT COUNT(*)::text FROM ar_collection_tasks WHERE review_status = 'pending') as pending_review_count,
       COALESCE((SELECT SUM(left_amount) FROM ar_receivables WHERE ar_status = 'resolved' AND DATE(updated_at) = CURRENT_DATE), 0)::text as resolved_today,
       COALESCE((SELECT SUM(penalty_amount) FROM ar_penalty_records WHERE status = 'pending'), 0)::text as penalty_total
     FROM ar_receivables
     WHERE left_amount > 0`
  );

  const stats: DailySummaryStats = {
    totalAmount: parseFloat(statsResult.rows[0]?.total_amount || '0'),
    overdueAmount: parseFloat(statsResult.rows[0]?.overdue_amount || '0'),
    newOverdueToday: parseFloat(statsResult.rows[0]?.new_overdue_today || '0'),
    collectingCount: parseInt(statsResult.rows[0]?.collecting_count || '0', 10),
    pendingReviewCount: parseInt(statsResult.rows[0]?.pending_review_count || '0', 10),
    resolvedToday: parseFloat(statsResult.rows[0]?.resolved_today || '0'),
    penaltyTotal: parseFloat(statsResult.rows[0]?.penalty_total || '0'),
  };

  const content = buildDailySummaryMessage(stats);
  const title = getNotificationTitle('daily_summary');

  // 发送给所有管理员
  const adminsResult = await appQuery<{ id: number; dingtalk_user_id: string; name: string }>(
    `SELECT u.id, u.dingtalk_user_id, u.name
     FROM users u
     JOIN role_user ru ON u.id = ru.user_id
     JOIN roles r ON ru.role_id = r.id
     WHERE r.code = 'admin' AND u.status = 1 AND u.dingtalk_user_id IS NOT NULL`
  );

  for (const admin of adminsResult.rows) {
    await sendAndRecordNotification({
      arIds: [],
      notificationType: 'daily_summary',
      recipientId: admin.id,
      recipientName: admin.name,
      recipientDingtalkId: admin.dingtalk_user_id,
      consumerName: '全部',
      billCount: 0,
      title,
      markdownContent: content,
    });
  }
}

/**
 * 每日20:00统一推送任务
 * 按顺序执行: 逾期前5天预警 → 逾期前2天预警 → 逾期触发催收 → 超时检查与考核 → 延期到期自动升级 → 每日汇总
 */
export async function runDailyNotificationTask(): Promise<void> {
  console.log('[AR-Notification] 开始执行每日20:00推送任务...');

  try {
    await sendPreWarn5Notifications();
    await sendPreWarn2Notifications();
    await sendOverdueCollectNotifications();
    await checkTimeoutAndPenalty();
    await processAutoEscalate();
    await sendDailySummary();

    console.log('[AR-Notification] 每日推送任务执行完成');
  } catch (error) {
    console.error('[AR-Notification] 每日推送任务执行失败:', error);
    throw error;
  }
}

// ==================== 实时推送函数（由 Controller 层调用） ====================

/**
 * 发送待审核通知（催收提交时调用）
 */
export async function sendPendingReviewNotification(params: {
  arIds: number[];
  reviewType: string;
  collectorId: number;
  collectorName: string;
  consumerName: string;
  bills: BillDetail[];
}): Promise<void> {
  // 查找审核人
  const reviewerResult = await appQuery<{ id: number; dingtalk_user_id: string; name: string }>(
    `SELECT u.id, u.dingtalk_user_id, u.name
     FROM users u
     JOIN role_user ru ON u.id = ru.user_id
     JOIN roles r ON ru.role_id = r.id
     WHERE r.code = 'supervisor' AND u.status = 1 AND u.dingtalk_user_id IS NOT NULL
     LIMIT 1`
  );

  if (reviewerResult.rows.length === 0) {
    console.log('[AR-Notification] 未找到审核人');
    return;
  }

  const reviewer = reviewerResult.rows[0];
  const content = buildPendingReviewMessage(
    params.reviewType,
    params.collectorName,
    params.consumerName,
    params.bills
  );
  const title = getNotificationTitle('pending_review', params.consumerName);

  await sendAndRecordNotification({
    arIds: params.arIds,
    notificationType: 'pending_review',
    recipientId: reviewer.id,
    recipientName: reviewer.name,
    recipientDingtalkId: reviewer.dingtalk_user_id,
    consumerName: params.consumerName,
    billCount: params.bills.length,
    title,
    markdownContent: content,
  });
}

/**
 * 发送审核结果通知
 */
export async function sendReviewResultNotification(params: {
  arIds: number[];
  consumerName: string;
  reviewType: string;
  approved: boolean;
  reviewerId: number;
  reviewerName: string;
  collectorId: number;
  rejectComment?: string | null;
  bills: BillDetail[];
}): Promise<void> {
  // 获取催收人钉钉ID
  const collectorResult = await appQuery<{ dingtalk_user_id: string; name: string }>(
    'SELECT dingtalk_user_id, name FROM users WHERE id = $1',
    [params.collectorId]
  );

  if (collectorResult.rows.length === 0 || !collectorResult.rows[0].dingtalk_user_id) {
    console.log('[AR-Notification] 未找到催收人钉钉ID');
    return;
  }

  const collector = collectorResult.rows[0];
  const content = buildReviewResultMessage(
    params.consumerName,
    params.reviewType,
    params.approved,
    params.reviewerName,
    params.rejectComment || null,
    params.bills
  );
  const title = getNotificationTitle('review_result', params.consumerName);

  await sendAndRecordNotification({
    arIds: params.arIds,
    notificationType: 'review_result',
    recipientId: params.collectorId,
    recipientName: collector.name,
    recipientDingtalkId: collector.dingtalk_user_id,
    consumerName: params.consumerName,
    billCount: params.bills.length,
    title,
    markdownContent: content,
  });
}

/**
 * 发送回款确认通知（出纳核实通过后调用）
 */
export async function sendPaymentConfirmedNotification(params: {
  arIds: number[];
  consumerName: string;
  cashierId: number;
  cashierName: string;
  collectorId: number;
  bills: BillDetail[];
}): Promise<void> {
  // 获取催收人钉钉ID
  const collectorResult = await appQuery<{ dingtalk_user_id: string; name: string }>(
    'SELECT dingtalk_user_id, name FROM users WHERE id = $1',
    [params.collectorId]
  );

  if (collectorResult.rows.length === 0 || !collectorResult.rows[0].dingtalk_user_id) {
    console.log('[AR-Notification] 未找到催收人钉钉ID');
    return;
  }

  const collector = collectorResult.rows[0];
  const content = buildPaymentConfirmedMessage(params.consumerName, params.cashierName, params.bills);
  const title = getNotificationTitle('payment_confirmed', params.consumerName);

  await sendAndRecordNotification({
    arIds: params.arIds,
    notificationType: 'payment_confirmed',
    recipientId: params.collectorId,
    recipientName: collector.name,
    recipientDingtalkId: collector.dingtalk_user_id,
    consumerName: params.consumerName,
    billCount: params.bills.length,
    title,
    markdownContent: content,
  });
}

/**
 * 发送催收升级通知
 */
export async function sendEscalateNotification(params: {
  arIds: number[];
  consumerName: string;
  overdueDays: number;
  reason: string;
  previousCollectorId: number;
  previousCollectorName: string;
  newCollectorId: number;
  bills: BillDetail[];
}): Promise<void> {
  // 获取新催收人钉钉ID
  const newCollectorResult = await appQuery<{ dingtalk_user_id: string; name: string }>(
    'SELECT dingtalk_user_id, name FROM users WHERE id = $1',
    [params.newCollectorId]
  );

  if (newCollectorResult.rows.length === 0 || !newCollectorResult.rows[0].dingtalk_user_id) {
    console.log('[AR-Notification] 未找到新催收人钉钉ID');
    return;
  }

  const newCollector = newCollectorResult.rows[0];
  const content = buildEscalateMessage(
    params.consumerName,
    params.overdueDays,
    params.reason,
    params.previousCollectorName,
    params.bills
  );
  const title = getNotificationTitle('escalate', params.consumerName);

  await sendAndRecordNotification({
    arIds: params.arIds,
    notificationType: 'escalate',
    recipientId: params.newCollectorId,
    recipientName: newCollector.name,
    recipientDingtalkId: newCollector.dingtalk_user_id,
    consumerName: params.consumerName,
    billCount: params.bills.length,
    title,
    markdownContent: content,
  });
}

/**
 * 发送营销担保延期生效通知
 */
export async function sendGuaranteeNotification(params: {
  arIds: number[];
  consumerName: string;
  collectorId: number;
  collectorName: string;
  latestPayDate: string;
  bills: BillDetail[];
}): Promise<void> {
  // 获取催收人钉钉ID
  const collectorResult = await appQuery<{ dingtalk_user_id: string; name: string }>(
    'SELECT dingtalk_user_id, name FROM users WHERE id = $1',
    [params.collectorId]
  );

  if (collectorResult.rows.length === 0 || !collectorResult.rows[0].dingtalk_user_id) {
    console.log('[AR-Notification] 未找到催收人钉钉ID');
    return;
  }

  const collector = collectorResult.rows[0];
  const content = buildGuaranteeNotifyMessage(
    params.consumerName,
    params.collectorName,
    params.latestPayDate,
    params.bills
  );
  const title = getNotificationTitle('guarantee_notify', params.consumerName);

  // 发送给营销师和主管
  await sendAndRecordNotification({
    arIds: params.arIds,
    notificationType: 'guarantee_notify',
    recipientId: params.collectorId,
    recipientName: collector.name,
    recipientDingtalkId: collector.dingtalk_user_id,
    consumerName: params.consumerName,
    billCount: params.bills.length,
    title,
    markdownContent: content,
  });

  // 同时发送给主管
  const supervisorResult = await appQuery<{ id: number; dingtalk_user_id: string; name: string }>(
    `SELECT u.id, u.dingtalk_user_id, u.name
     FROM users u
     JOIN role_user ru ON u.id = ru.user_id
     JOIN roles r ON ru.role_id = r.id
     WHERE r.code = 'supervisor' AND u.status = 1 AND u.dingtalk_user_id IS NOT NULL
     LIMIT 1`
  );

  if (supervisorResult.rows.length > 0) {
    const supervisor = supervisorResult.rows[0];
    await sendAndRecordNotification({
      arIds: params.arIds,
      notificationType: 'guarantee_notify',
      recipientId: supervisor.id,
      recipientName: supervisor.name,
      recipientDingtalkId: supervisor.dingtalk_user_id,
      consumerName: params.consumerName,
      billCount: params.bills.length,
      title,
      markdownContent: content,
    });
  }
}
