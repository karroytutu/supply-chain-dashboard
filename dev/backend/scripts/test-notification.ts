/**
 * 手动触发应收账款通知推送测试
 */
import { runDailyNotificationTask } from '../src/services/accounts-receivable/ar-notification.service';

async function testNotification() {
  console.log('=== 手动触发推送测试 ===\n');
  console.log('开始时间:', new Date().toLocaleString('zh-CN'));
  console.log('');

  try {
    await runDailyNotificationTask();
    console.log('\n推送任务执行完成!');
  } catch (error) {
    console.error('\n推送任务执行失败:', error);
  } finally {
    console.log('\n结束时间:', new Date().toLocaleString('zh-CN'));
    process.exit(0);
  }
}

testNotification();
