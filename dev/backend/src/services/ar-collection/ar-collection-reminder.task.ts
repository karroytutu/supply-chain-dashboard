/**
 * 催收管理 - 定时提醒任务
 * 定时检查延期到期催收任务并发送提醒通知
 */

import { appQuery } from '../../db/appPool';
import {
  sendCollectionNotification,
  buildExtensionExpiryMessage,
} from './ar-collection-notify';
import type { CollectionTask } from './ar-collection.types';

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
