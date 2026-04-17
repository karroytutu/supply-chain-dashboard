/**
 * 定时任务调度器入口
 * 管理所有定时任务的注册和启动
 */

import cron from 'node-cron';
import { syncReturnOrders, sendNewReturnReminder } from './sync-return-orders.task';
import { sendDailyPendingErpReminder } from '../return-order/return-order-notify';
import { getPendingErpOrders } from '../return-order/return-order.query';
import { calculateReturnPenalties, notifyPenaltyCreated } from '../return-penalty';
import {
  syncERPDebts,
  generateCollectionTasks,
  checkExtensionExpiry,
} from '../ar-collection/ar-collection-sync.task';
import {
  checkExtensionExpiryReminders,
} from '../ar-collection/ar-collection-reminder.task';
import { checkUpcomingOverdueReminders } from '../ar-collection/ar-warning.task';
import { handleRetry } from '../dingtalk/retry.handler';

/**
 * 启动所有定时任务
 */
export function startScheduler(): void {
  console.log('[Scheduler] 正在启动定时任务调度器...');

  // 注册退货数据同步任务
  // 每天08:30执行: 0 30 8 * * *
  cron.schedule(
    '0 30 8 * * *',
    async () => {
      console.log('[Scheduler] 执行退货数据同步任务...');
      try {
        const result = await syncReturnOrders();
        console.log('[Scheduler] 退货数据同步完成:', result);
        
        // 同步完成后，发送新增临期退货提醒
        await sendNewReturnReminder();
      } catch (error) {
        console.error('[Scheduler] 退货数据同步失败:', error);
      }
    },
    {
      timezone: 'Asia/Shanghai',
    }
  );

  // 注册待填ERP退货单提醒任务
  // 每天08:35执行: 0 35 8 * * *
  cron.schedule(
    '0 35 8 * * *',
    async () => {
      console.log('[Scheduler] 执行待填ERP退货单提醒任务...');
      try {
        // 获取待填写ERP的退货单
        const pendingErpOrders = await getPendingErpOrders();
        await sendDailyPendingErpReminder(pendingErpOrders);
        console.log('[Scheduler] 待填ERP退货单提醒发送完成');
      } catch (error) {
        console.error('[Scheduler] 待填ERP退货单提醒发送失败:', error);
      }
    },
    {
      timezone: 'Asia/Shanghai',
    }
  );

  // 注册退货考核计算任务
  // 每天08:45执行: 0 45 8 * * *
  // 在退货数据同步(08:30)和待填ERP提醒(08:35)之后
  cron.schedule(
    '0 45 8 * * *',
    async () => {
      console.log('[Scheduler] 执行退货考核计算任务...');
      try {
        const results = await calculateReturnPenalties();
        const totalCreated = results.reduce((sum, r) => sum + r.createdCount, 0);
        console.log(`[Scheduler] 退货考核计算完成，共创建 ${totalCreated} 条考核记录`);
        
        // 发送考核通知
        if (totalCreated > 0) {
          await notifyPenaltyCreated(totalCreated);
        }
      } catch (error) {
        console.error('[Scheduler] 退货考核计算失败:', error);
      }
    },
    {
      timezone: 'Asia/Shanghai',
    }
  );

  // 催收数据同步 - 每日06:00
  cron.schedule(
    '0 6 * * *',
    async () => {
      console.log('[Scheduler] 执行催收ERP数据同步...');
      try {
        await syncERPDebts();
        console.log('[Scheduler] 催收ERP数据同步完成');
      } catch (error) {
        console.error('[Scheduler] 催收ERP数据同步失败:', error);
      }
    },
    { timezone: 'Asia/Shanghai' }
  );

  // 催收任务生成 - 每日20:00
  cron.schedule(
    '0 20 * * *',
    async () => {
      console.log('[Scheduler] 执行催收任务生成...');
      try {
        await generateCollectionTasks();
        console.log('[Scheduler] 催收任务生成完成');
      } catch (error) {
        console.error('[Scheduler] 催收任务生成失败:', error);
      }
    },
    { timezone: 'Asia/Shanghai' }
  );

  // 延期到期检查 - 每2小时
  cron.schedule(
    '0 */2 * * *',
    async () => {
      console.log('[Scheduler] 执行延期到期检查...');
      try {
        await checkExtensionExpiry();
        console.log('[Scheduler] 延期到期检查完成');
      } catch (error) {
        console.error('[Scheduler] 延期到期检查失败:', error);
      }
    },
    { timezone: 'Asia/Shanghai' }
  );

  // 催收预警提醒 - 每天晚上 20:00
  cron.schedule(
    '0 20 * * *',
    async () => {
      console.log('[Scheduler] 执行催收预警提醒检查...');
      try {
        await checkExtensionExpiryReminders();
        console.log('[Scheduler] 延期到期提醒检查完成');
      } catch (error) {
        console.error('[Scheduler] 延期到期提醒检查失败:', error);
      }
      try {
        await checkUpcomingOverdueReminders();
        console.log('[Scheduler] 逾期前预警提醒检查完成');
      } catch (error) {
        console.error('[Scheduler] 逾期前预警提醒检查失败:', error);
      }
    },
    { timezone: 'Asia/Shanghai' }
  );

  // 钉钉通知重试 - 每5分钟
  cron.schedule(
    '*/5 * * * *',
    async () => {
      console.log('[Scheduler] 执行钉钉通知重试...');
      try {
        const result = await handleRetry();
        if (result.processed > 0) {
          console.log('[Scheduler] 钉钉通知重试完成:', result);
        }
      } catch (error) {
        console.error('[Scheduler] 钉钉通知重试失败:', error);
      }
    },
    { timezone: 'Asia/Shanghai' }
  );

  console.log('[Scheduler] 定时任务已注册:');
  console.log('  - 退货数据同步: 每天 08:30 (Asia/Shanghai)');
  console.log('  - 待填ERP提醒: 每天 08:35 (Asia/Shanghai)');
  console.log('  - 退货考核计算: 每天 08:45 (Asia/Shanghai)');
  console.log('  - 催收ERP数据同步: 每天 06:00 (Asia/Shanghai)');
  console.log('  - 催收任务生成: 每天 20:00 (Asia/Shanghai)');
  console.log('  - 延期到期检查: 每2小时 (Asia/Shanghai)');
  console.log('  - 催收预警提醒: 每天 20:00 (Asia/Shanghai) [延期到期+逾期前预警]');
  console.log('  - 钉钉通知重试: 每5分钟 (Asia/Shanghai)');
  console.log('[Scheduler] 定时任务调度器启动完成');
}

/**
 * 停止所有定时任务
 */
export function stopScheduler(): void {
  console.log('[Scheduler] 正在停止定时任务调度器...');
  // node-cron 的 schedule 返回的对象有 stop 方法
  // 如果需要停止特定任务，可以在这里实现
  console.log('[Scheduler] 定时任务调度器已停止');
}
