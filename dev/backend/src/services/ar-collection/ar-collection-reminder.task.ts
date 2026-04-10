/**
 * 催收管理 - 定时提醒任务
 * 定时检查逾期催收任务并发送提醒通知
 */

import { appQuery } from '../../db/appPool';
import {
  sendCollectionNotification,
  buildOverdueReminderMessage,
  buildExtensionExpiryMessage,
} from './ar-collection-notify';
import type { CollectionTask, Priority } from './ar-collection.types';

/** 优先级对应提醒频率（天数） */
const REMINDER_FREQUENCY: Record<Priority, number> = {
  critical: 1,  // 每天
  high: 2,      // 每2天
  medium: 3,    // 每3天
  low: 7,       // 每周
};

/**
 * 逾期提醒检查
 * 查询 collecting/escalated 状态任务，按优先级决定提醒频率
 */
export async function checkOverdueReminders(): Promise<void> {
  console.log('[ReminderTask] 开始逾期提醒检查...');

  try {
    // 查询所有需要催收的任务（collecting/escalated 状态）
    const tasksResult = await appQuery<CollectionTask>(
      `SELECT t.*
       FROM ar_collection_tasks t
       WHERE t.status IN ('collecting', 'escalated')
         AND t.current_handler_id IS NOT NULL
       ORDER BY t.priority ASC, t.max_overdue_days DESC`
    );

    const tasks = tasksResult.rows;
    if (tasks.length === 0) {
      console.log('[ReminderTask] 无需提醒的催收任务');
      return;
    }

    console.log(`[ReminderTask] 发现 ${tasks.length} 个待催收任务，检查提醒频率...`);

    let sentCount = 0;

    for (const task of tasks) {
      try {
        const shouldRemind = await shouldSendReminder(task);
        if (!shouldRemind) continue;

        // 构建消息
        const message = buildOverdueReminderMessage(task, {
          bill_count: task.bill_count,
          total_amount: Number(task.total_amount) || 0,
          max_overdue_days: task.max_overdue_days,
        });

        // 发送通知给当前处理人
        if (task.current_handler_id) {
          await sendCollectionNotification({
            userIds: [task.current_handler_id],
            title: message.title,
            content: message.content,
          });

          // 记录提醒操作日志
          await recordReminderAction(task.id);
          sentCount++;
        }
      } catch (error) {
        console.error(`[ReminderTask] 任务 ${task.task_no} 提醒发送失败:`, error);
        // 单个任务失败不影响其他任务
      }
    }

    console.log(`[ReminderTask] 逾期提醒检查完成，发送 ${sentCount} 条提醒`);
  } catch (error) {
    console.error('[ReminderTask] 逾期提醒检查失败:', error);
  }
}

/**
 * 判断任务是否需要发送提醒
 * 根据优先级对应的提醒频率和上次提醒时间决定
 */
async function shouldSendReminder(task: CollectionTask): Promise<boolean> {
  const priority = task.priority || 'medium';
  const frequencyDays = REMINDER_FREQUENCY[priority];

  try {
    // 查询上次系统提醒时间
    const lastReminderResult = await appQuery<{ created_at: string }>(
      `SELECT created_at FROM ar_collection_actions
       WHERE task_id = $1 AND action_type = 'system_reminder'
       ORDER BY created_at DESC
       LIMIT 1`,
      [task.id]
    );

    if (lastReminderResult.rows.length === 0) {
      // 从未发送过提醒，应该发送
      return true;
    }

    const lastReminderTime = new Date(lastReminderResult.rows[0].created_at);
    const now = new Date();
    const daysSinceLastReminder = Math.floor(
      (now.getTime() - lastReminderTime.getTime()) / (1000 * 60 * 60 * 24)
    );

    return daysSinceLastReminder >= frequencyDays;
  } catch (error) {
    console.error(`[ReminderTask] 检查提醒频率失败(task_id=${task.id}):`, error);
    // 查询失败时默认不发送，避免重复通知
    return false;
  }
}

/**
 * 记录系统提醒操作日志
 */
async function recordReminderAction(taskId: number): Promise<void> {
  try {
    await appQuery(
      `INSERT INTO ar_collection_actions
        (task_id, action_type, action_result, remark, operator_name, operator_role)
       VALUES ($1, 'system_reminder', 'success', '系统自动逾期催收提醒', '系统', 'system')`,
      [taskId]
    );
  } catch (error) {
    console.error(`[ReminderTask] 记录提醒日志失败(task_id=${taskId}):`, error);
  }
}

/**
 * 延期到期提醒检查
 * 查询 extension 状态且 extension_until 在3天内到期的任务
 */
export async function checkExtensionExpiryReminders(): Promise<void> {
  console.log('[ReminderTask] 开始延期到期提醒检查...');

  try {
    // 查询延期中且即将到期（3天内）的任务
    const tasksResult = await appQuery<CollectionTask>(
      `SELECT t.*
       FROM ar_collection_tasks t
       WHERE t.status = 'extension'
         AND t.extension_until IS NOT NULL
         AND t.extension_until <= CURRENT_DATE + INTERVAL '3 days'
         AND t.extension_until >= CURRENT_DATE
         AND t.current_handler_id IS NOT NULL
       ORDER BY t.extension_until ASC`
    );

    const tasks = tasksResult.rows;
    if (tasks.length === 0) {
      console.log('[ReminderTask] 无延期即将到期的任务');
      return;
    }

    console.log(`[ReminderTask] 发现 ${tasks.length} 个延期即将到期任务`);

    let sentCount = 0;

    for (const task of tasks) {
      try {
        // 计算剩余天数
        const extensionUntil = new Date(task.extension_until!);
        const now = new Date();
        now.setHours(0, 0, 0, 0);
        const daysLeft = Math.ceil(
          (extensionUntil.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
        );

        if (daysLeft < 0) continue;

        // 构建消息
        const message = buildExtensionExpiryMessage(task, daysLeft);

        // 发送通知给当前处理人
        if (task.current_handler_id) {
          await sendCollectionNotification({
            userIds: [task.current_handler_id],
            title: message.title,
            content: message.content,
          });
          sentCount++;
        }
      } catch (error) {
        console.error(`[ReminderTask] 延期到期提醒发送失败(task_no=${task.task_no}):`, error);
      }
    }

    console.log(`[ReminderTask] 延期到期提醒检查完成，发送 ${sentCount} 条提醒`);
  } catch (error) {
    console.error('[ReminderTask] 延期到期提醒检查失败:', error);
  }
}
