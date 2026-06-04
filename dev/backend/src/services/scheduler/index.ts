/**
 * 定时任务调度器入口
 * 管理所有定时任务的注册和启动
 */
import { createLogger } from '../../utils/logger';
const log = createLogger('Scheduler');

import cron from 'node-cron';
import { syncReturnOrders, sendNewReturnReminder } from './sync-return-orders.task';
import { sendDailyPendingErpReminder } from '../return-order/return-order-notify';
import { getPendingErpOrders } from '../return-order/return-order.query';
// [统一考核迁移] 旧模块已停用，由统一考核模块替代
// import { calculateReturnPenalties, notifyPenaltyCreated } from '../return-penalty';
import { runCalculation } from '../assessment/assessment-calculate';
import { sendAssessmentNotifications } from '../assessment/assessment-notify';
import * as assessmentRepository from '../assessment/assessment.repository';
import {
  syncERPDebts,
  generateCollectionTasks,
  checkExtensionExpiry,
  checkHoldExpiry,
} from '../ar-collection/ar-collection-sync.task';
import { checkExtensionExpiryReminders } from '../ar-collection/ar-collection-reminder.task';
import { checkUpcomingOverdueReminders } from '../ar-collection/ar-warning.task';
// [统一考核迁移] 旧模块已停用，由统一考核模块替代
// import { calculateArAssessments, notifyAssessmentCreated } from '../ar-assessment';
import { handleRetry } from '../retry.handler';
import { recoverStuckProcessing, recoverStuckAutoNodes } from '../fixed-asset/erp-meta-utils';
import { checkLicenseDeferredReminders, markOverdueDeferredUploads } from '../credit-license';
import { saveMonthlyArchive, getLastMonthEndDate } from '../procurement-archive';
import { checkAndRefreshAllTokens } from '../token-manager';
import {
  syncDingtalkDepartments,
  fullSyncDingtalkUsers,
  incrementalSyncDingtalkUsers,
} from '../dingtalk-sync';

/**
 * 启动所有定时任务
 */
export function startScheduler(): void {
  log.info('正在启动定时任务调度器...');

  // 注册退货数据同步任务
  // 每天08:30执行: 0 30 8 * * *
  cron.schedule(
    '0 30 8 * * *',
    async () => {
      log.info('执行退货数据同步任务...');
      try {
        const result = await syncReturnOrders();
        log.info('退货数据同步完成:', result);

        // 同步完成后，发送新增临期退货提醒
        await sendNewReturnReminder();
      } catch (error) {
        log.error('退货数据同步失败:', error);
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
      log.info('执行待填ERP退货单提醒任务...');
      try {
        // 获取待填写ERP的退货单
        const pendingErpOrders = await getPendingErpOrders();
        await sendDailyPendingErpReminder(pendingErpOrders);
        log.info('待填ERP退货单提醒发送完成');
      } catch (error) {
        log.error('待填ERP退货单提醒发送失败:', error);
      }
    },
    {
      timezone: 'Asia/Shanghai',
    }
  );

  // 注册退货考核计算任务（统一考核模块）
  // 每天08:45执行: 0 45 8 * * *
  // 在退货数据同步(08:30)和待填ERP提醒(08:35)之后
  cron.schedule(
    '0 45 8 * * *',
    async () => {
      log.info('执行退货考核计算任务...');
      try {
        const result = await runCalculation({
          triggered_by: 'scheduled',
          category: 'return_order',
        });
        log.info(`退货考核计算完成: ${result.totalRecords} 条记录, ${result.newRecords} 条新增`);

        // 发送考核通知：查询新增的 pending 记录后发送
        if (result.newRecords > 0) {
          const pendingRecords = await assessmentRepository.getRecords({
            category: 'return_order',
            status: 'pending' as any,
            page: 1,
            page_size: 1000,
          });
          await sendAssessmentNotifications(pendingRecords.rows);
        }
      } catch (error) {
        log.error('退货考核计算失败:', error);
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
      log.info('执行催收ERP数据同步...');
      try {
        await syncERPDebts();
        log.info('催收ERP数据同步完成');
      } catch (error) {
        log.error('催收ERP数据同步失败:', error);
      }
    },
    { timezone: 'Asia/Shanghai' }
  );

  // 催收任务生成 - 每日20:00
  cron.schedule(
    '0 20 * * *',
    async () => {
      log.info('执行催收任务生成...');
      try {
        await generateCollectionTasks();
        log.info('催收任务生成完成');
      } catch (error) {
        log.error('催收任务生成失败:', error);
      }
    },
    { timezone: 'Asia/Shanghai' }
  );

  // 催收考核计算（统一考核模块） - 每日20:30（在催收任务生成之后）
  cron.schedule(
    '0 30 20 * * *',
    async () => {
      log.info('执行催收考核计算任务...');
      try {
        const result = await runCalculation({
          triggered_by: 'scheduled',
          category: 'ar_collection',
        });
        log.info(`催收考核计算完成: ${result.totalRecords} 条记录, ${result.newRecords} 条新增`);

        if (result.newRecords > 0) {
          const pendingRecords = await assessmentRepository.getRecords({
            category: 'ar_collection',
            status: 'pending' as any,
            page: 1,
            page_size: 1000,
          });
          await sendAssessmentNotifications(pendingRecords.rows);
        }
      } catch (error) {
        log.error('催收考核计算失败:', error);
      }
    },
    { timezone: 'Asia/Shanghai' }
  );

  // 延期到期检查 - 每2小时
  cron.schedule(
    '0 */2 * * *',
    async () => {
      log.info('执行延期到期检查...');
      try {
        await checkExtensionExpiry();
        log.info('延期到期检查完成');
      } catch (error) {
        log.error('延期到期检查失败:', error);
      }
    },
    { timezone: 'Asia/Shanghai' }
  );

  // 期限压单到期检查 - 每2小时
  cron.schedule(
    '0 */2 * * *',
    async () => {
      log.info('执行期限压单到期检查...');
      try {
        await checkHoldExpiry();
        log.info('期限压单到期检查完成');
      } catch (error) {
        log.error('期限压单到期检查失败:', error);
      }
    },
    { timezone: 'Asia/Shanghai' }
  );

  // 催收预警提醒 - 每天晚上 20:00
  cron.schedule(
    '0 20 * * *',
    async () => {
      log.info('执行催收预警提醒检查...');
      try {
        await checkExtensionExpiryReminders();
        log.info('延期到期提醒检查完成');
      } catch (error) {
        log.error('延期到期提醒检查失败:', error);
      }
      try {
        await checkUpcomingOverdueReminders();
        log.info('逾期前预警提醒检查完成');
      } catch (error) {
        log.error('逾期前预警提醒检查失败:', error);
      }
    },
    { timezone: 'Asia/Shanghai' }
  );

  // 钉钉通知重试 - 每5分钟
  cron.schedule(
    '*/5 * * * *',
    async () => {
      log.info('执行钉钉通知重试...');
      try {
        const result = await handleRetry();
        if (result.processed > 0) {
          log.info('钉钉通知重试完成:', result);
        }
      } catch (error) {
        log.error('钉钉通知重试失败:', error);
      }
    },
    { timezone: 'Asia/Shanghai' }
  );

  // OA auto 节点卡住恢复 - 每5分钟
  cron.schedule(
    '*/5 * * * *',
    async () => {
      try {
        const recovered = await recoverStuckProcessing();
        if (recovered > 0) {
          log.info(`auto节点processing恢复完成，处理 ${recovered} 个实例`);
        }
        const recoveredAuto = await recoverStuckAutoNodes();
        if (recoveredAuto > 0) {
          log.info(`auto节点pending恢复完成，处理 ${recoveredAuto} 个实例`);
        }
      } catch (error) {
        log.error('auto节点卡住恢复失败:', error);
      }
    },
    { timezone: 'Asia/Shanghai' }
  );

  // 营业执照补交提醒 - 每天 09:00
  cron.schedule(
    '0 9 * * *',
    async () => {
      log.info('执行营业执照补交提醒检查...');
      try {
        await checkLicenseDeferredReminders();
        log.info('营业执照补交提醒检查完成');
      } catch (error) {
        log.error('营业执照补交提醒检查失败:', error);
      }
    },
    { timezone: 'Asia/Shanghai' }
  );

  // 营业执照补交逾期标记 + 考核计算 - 每天 09:15
  cron.schedule(
    '0 15 9 * * *',
    async () => {
      log.info('执行营业执照补交逾期标记...');
      try {
        const overdueCount = await markOverdueDeferredUploads();
        if (overdueCount > 0) {
          log.info(`${overdueCount} 条营业执照补交记录标记为逾期`);
          const result = await runCalculation({
            triggered_by: 'scheduled',
            category: 'credit_license',
          });
          log.info(`执照考核计算完成: ${result.totalRecords} 条记录, ${result.newRecords} 条新增`);

          if (result.newRecords > 0) {
            const pendingRecords = await assessmentRepository.getRecords({
              category: 'credit_license',
              status: 'pending' as any,
              page: 1,
              page_size: 1000,
            });
            await sendAssessmentNotifications(pendingRecords.rows);
          }
        } else {
          log.info('无逾期营业执照补交记录');
        }
      } catch (error) {
        log.error('营业执照补交逾期处理失败:', error);
      }
    },
    { timezone: 'Asia/Shanghai' }
  );

  // 采购绩效月度存档 - 每月1号 01:00（对上月数据进行存档）
  cron.schedule(
    '0 1 1 * *',
    async () => {
      log.info('执行采购绩效月度存档...');
      try {
        const lastMonthEnd = getLastMonthEndDate();
        await saveMonthlyArchive(lastMonthEnd, 'scheduler');
        log.info('采购绩效月度存档完成');
      } catch (error) {
        log.error('采购绩效月度存档失败:', error);
      }
    },
    { timezone: 'Asia/Shanghai' }
  );

  // ==================== Token 管理 ====================
  // Token 检查与刷新 - 每5分钟
  cron.schedule(
    '*/5 * * * *',
    async () => {
      try {
        await checkAndRefreshAllTokens();
      } catch (error) {
        log.error('Token 管理检查失败:', error);
      }
    },
    { timezone: 'Asia/Shanghai' }
  );

  // ==================== 钉钉组织架构同步 ====================

  // 钉钉部门同步 - 每天 06:00
  cron.schedule(
    '0 6 * * *',
    async () => {
      log.info('执行钉钉部门同步...');
      try {
        const result = await syncDingtalkDepartments();
        log.info('钉钉部门同步完成:', result);
      } catch (error) {
        log.error('钉钉部门同步失败:', error);
      }
    },
    { timezone: 'Asia/Shanghai' }
  );

  // 钉钉全量用户同步 - 每天 07:00（在部门同步之后）
  cron.schedule(
    '0 7 * * *',
    async () => {
      log.info('执行钉钉全量用户同步...');
      try {
        const result = await fullSyncDingtalkUsers();
        log.info('钉钉全量用户同步完成:', result);
      } catch (error) {
        log.error('钉钉全量用户同步失败:', error);
      }
    },
    { timezone: 'Asia/Shanghai' }
  );

  // 钉钉增量用户同步 - 每4小时
  cron.schedule(
    '0 */4 * * *',
    async () => {
      log.info('执行钉钉增量用户同步...');
      try {
        const result = await incrementalSyncDingtalkUsers();
        log.info('钉钉增量用户同步完成:', result);
      } catch (error) {
        log.error('钉钉增量用户同步失败:', error);
      }
    },
    { timezone: 'Asia/Shanghai' }
  );

  log.info('定时任务已注册:');
  log.info('  - 退货数据同步: 每天 08:30 (Asia/Shanghai)');
  log.info('  - 待填ERP提醒: 每天 08:35 (Asia/Shanghai)');
  log.info('  - 退货考核计算: 每天 08:45 (Asia/Shanghai)');
  log.info('  - 催收ERP数据同步: 每天 06:00 (Asia/Shanghai)');
  log.info('  - 催收任务生成: 每天 20:00 (Asia/Shanghai)');
  log.info('  - 催收考核计算: 每天 20:30 (Asia/Shanghai)');
  log.info('  - 延期到期检查: 每2小时 (Asia/Shanghai)');
  log.info('  - 期限压单到期检查: 每2小时 (Asia/Shanghai)');
  log.info('  - 催收预警提醒: 每天 20:00 (Asia/Shanghai) [延期到期+逾期前预警]');
  log.info('  - 钉钉通知重试: 每5分钟 (Asia/Shanghai)');
  log.info('  - auto节点卡住恢复: 每5分钟 (Asia/Shanghai)');
  log.info('  - 营业执照补交提醒: 每天 09:00 (Asia/Shanghai)');
  log.info('  - 营业执照补交逾期+考核: 每天 09:15 (Asia/Shanghai)');
  log.info('  - 采购绩效月度存档: 每月1号 01:00 (Asia/Shanghai)');
  log.info('  - Token 管理检查: 每5分钟 (Asia/Shanghai)');
  log.info('  - 钉钉部门同步: 每天 06:00 (Asia/Shanghai)');
  log.info('  - 钉钉全量用户同步: 每天 07:00 (Asia/Shanghai)');
  log.info('  - 钉钉增量用户同步: 每4小时 (Asia/Shanghai)');
  log.info('定时任务调度器启动完成');
}

/**
 * 停止所有定时任务
 */
export function stopScheduler(): void {
  log.info('正在停止定时任务调度器...');
  // node-cron 的 schedule 返回的对象有 stop 方法
  // 如果需要停止特定任务，可以在这里实现
  log.info('定时任务调度器已停止');
}
