/**
 * 定时任务调度器入口
 * 管理所有定时任务的注册和启动
 */

import cron from 'node-cron';
import { syncReturnOrders, sendNewReturnReminder } from './sync-return-orders.task';
import { sendDailyPendingErpReminder } from '../return-order/return-order-notify';
import { getPendingErpOrders } from '../return-order/return-order.query';

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

  console.log('[Scheduler] 定时任务已注册:');
  console.log('  - 退货数据同步: 每天 08:30 (Asia/Shanghai)');
  console.log('  - 待填ERP提醒: 每天 08:35 (Asia/Shanghai)');
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
