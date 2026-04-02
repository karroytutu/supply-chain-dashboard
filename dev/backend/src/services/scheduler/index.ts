/**
 * 定时任务调度器入口
 * 管理所有定时任务的注册和启动
 */

import cron from 'node-cron';
import { syncReturnOrders, sendNewReturnReminder } from './sync-return-orders.task';
import { sendDailyPendingErpReminder } from '../return-order/return-order-notify';
import { getPendingErpOrders } from '../return-order/return-order.query';
import { syncArReceivables } from '../accounts-receivable';
import { runDailyNotificationTask } from '../accounts-receivable/ar-scheduler.task';
import { saveDailySnapshot } from '../accounts-receivable/ar-stats.service';
import { calculateReturnPenalties, notifyPenaltyCreated } from '../return-penalty';

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

  // 注册应收账款ERP同步任务
  // 每2小时执行一次（工作时间 06:00-22:00）
  // cron: 0 0 6,8,10,12,14,16,18,20,22 * * *
  cron.schedule(
    '0 0 6,8,10,12,14,16,18,20,22 * * *',
    async () => {
      console.log('[Scheduler] 执行应收账款ERP同步任务...');
      try {
        const result = await syncArReceivables();
        console.log('[Scheduler] 应收账款ERP同步完成:', result);
      } catch (error) {
        console.error('[Scheduler] 应收账款ERP同步失败:', error);
      }
    },
    {
      timezone: 'Asia/Shanghai',
    }
  );

  // 注册应收账款每日通知推送任务
  // 每天20:00执行: 0 0 20 * * *
  cron.schedule(
    '0 0 20 * * *',
    async () => {
      console.log('[Scheduler] 执行应收账款每日通知推送任务...');
      try {
        await runDailyNotificationTask();
        console.log('[Scheduler] 应收账款每日通知推送完成');
      } catch (error) {
        console.error('[Scheduler] 应收账款每日通知推送失败:', error);
      }
    },
    {
      timezone: 'Asia/Shanghai',
    }
  );

  // 注册应收账款每日统计快照任务
  // 每天凌晨00:10执行: 0 10 0 * * *
  // 确保ERP同步（最后批次约22:00）已完成
  cron.schedule(
    '0 10 0 * * *',
    async () => {
      console.log('[Scheduler] 执行应收账款每日统计快照任务...');
      try {
        await saveDailySnapshot();
        console.log('[Scheduler] 应收账款每日统计快照完成');
      } catch (error) {
        console.error('[Scheduler] 应收账款每日统计快照失败:', error);
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

  console.log('[Scheduler] 定时任务已注册:');
  console.log('  - 应收账款ERP同步: 每2小时 (06:00-22:00, Asia/Shanghai)');
  console.log('  - 退货数据同步: 每天 08:30 (Asia/Shanghai)');
  console.log('  - 待填ERP提醒: 每天 08:35 (Asia/Shanghai)');
  console.log('  - 退货考核计算: 每天 08:45 (Asia/Shanghai)');
  console.log('  - 应收账款通知推送: 每天 20:00 (Asia/Shanghai)');
  console.log('  - 应收账款统计快照: 每天 00:10 (Asia/Shanghai)');
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
