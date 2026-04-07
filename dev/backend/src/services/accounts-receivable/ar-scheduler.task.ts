/**
 * 应收账款定时任务
 * 包含ERP同步后的数据处理和每日20:00推送
 */

import { runDailyNotificationTask } from './ar-notification.service';
import { processTimeoutWarnings } from './overdue';

export { runDailyNotificationTask };

/** 超时检查定时任务是否运行中 */
let isTimeoutCheckRunning = false;

/**
 * 启动超时检查定时任务
 * 每10分钟执行一次 processTimeoutWarnings()
 */
export function startTimeoutCheckScheduler(): void {
  console.log('[AR-Scheduler] 启动超时检查定时任务，每10分钟执行一次');

  // 立即执行一次
  runTimeoutCheck();

  // 每10分钟执行一次
  setInterval(runTimeoutCheck, 10 * 60 * 1000);
}

/**
 * 执行超时检查
 */
async function runTimeoutCheck(): Promise<void> {
  if (isTimeoutCheckRunning) {
    console.log('[AR-Scheduler] 超时检查任务正在运行，跳过本次执行');
    return;
  }

  isTimeoutCheckRunning = true;
  console.log('[AR-Scheduler] 开始执行超时检查任务...');

  try {
    const result = await processTimeoutWarnings();
    console.log('[AR-Scheduler] 超时检查任务完成:', result);
  } catch (error) {
    console.error('[AR-Scheduler] 超时检查任务失败:', error);
  } finally {
    isTimeoutCheckRunning = false;
  }
}
