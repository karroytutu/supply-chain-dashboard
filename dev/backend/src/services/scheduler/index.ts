/**
 * 定时任务调度器入口
 * 管理所有定时任务的注册和启动
 */
import { createLogger } from '../../utils/logger';
import { config } from '../../config';
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
import { checkUpcomingOverdueReminders } from '../ar-collection/ar-warning.task';
// [统一考核迁移] 旧模块已停用，由统一考核模块替代
// import { calculateArAssessments, notifyAssessmentCreated } from '../ar-assessment';
import { handleRetry } from '../retry.handler';
import { recoverStuckProcessing, recoverStuckAutoNodes } from '../fixed-asset/erp-meta-utils';
import { checkLicenseDeferredReminders, markOverdueDeferredUploads } from '../credit-license';
import { saveMonthlyArchive, getLastMonthEndDate } from '../procurement-archive';
import { checkAndRefreshAllTokens } from '../token-manager';
import { runCollectionPipeline } from './collection-pipeline.task';
import {
  syncDingtalkDepartments,
  fullSyncDingtalkUsers,
  incrementalSyncDingtalkUsers,
} from '../dingtalk-sync';
import { runOaTimeoutTask, runOaTimeoutAssessmentTask } from '../oa/timeout';
import { processOaAsyncTasks } from '../oa/oa-async-task.service';
import { reconcileProcessInstanceStatus } from '../oa/oa-process-centre';
import { runOaOrphanCleanup } from '../oa/oa-orphan-cleanup.task';
import { initializeSyncEngine } from '../erp-sync/sync-config';
import { syncAllSnapshots, syncHotWindow, syncWarmWindow, syncColdWindow } from '../erp-sync/sync-orchestrator';

/**
 * 启动所有定时任务
 * 注意：涉及钉钉API写入、通知发送、数据库修改的定时任务仅在 production 环境注册，
 * 避免开发环境（APP_BASE_URL=http://localhost:3100）向钉钉写入错误URL或发送重复通知。
 */
export function startScheduler(): void {
  log.info('正在启动定时任务调度器...');

  const isProduction = process.env.NODE_ENV === 'production';
  if (!isProduction) {
    log.warn('非生产环境: 跳过写入型定时任务注册（催收流水线、通知、数据同步等）');
  }

  // ==================== 以下任务仅在生产环境注册 ====================
  // 涉及钉钉API写入、通知发送、数据库状态修改，开发环境运行会导致：
  // - 使用错误的 APP_BASE_URL（localhost:3100）创建钉钉记录
  // - 与生产环境产生重复通知和数据写入
  if (isProduction) {

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

  // 催收统一流水线 - 每日20:00
  // 合并原: syncERPDebts(06:00) + generateCollectionOaInstances(20:00) + OA催收节点考核(20:45)
  cron.schedule(
    '0 20 * * *',
    async () => {
      try {
        await runCollectionPipeline();
      } catch (error) {
        log.error('催收统一流水线执行异常:', error);
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

  // OA节点超时催办扫描 - 每5分钟（催办间隔本身为8小时级别，1分钟精度无实际业务意义）
  cron.schedule(
    '*/5 * * * *',
    async () => {
      await runOaTimeoutTask();
    },
    { timezone: 'Asia/Shanghai' }
  );

  // OA节点超时考核计算 - 每天 09:00
  cron.schedule(
    '0 9 * * *',
    async () => {
      log.info('执行OA节点超时考核计算...');
      await runOaTimeoutAssessmentTask();
    },
    { timezone: 'Asia/Shanghai' }
  );

  // OA 钉钉流程中心壳实例状态对账 - 每30分钟
  cron.schedule(
    '*/30 * * * *',
    async () => {
      try {
        const result = await reconcileProcessInstanceStatus();
        if (result.processed > 0 || result.failed > 0) {
          log.info('OA 壳实例状态对账完成:', result);
        }
      } catch (error) {
        log.error('OA 壳实例状态对账异常:', error);
      }
    },
    { timezone: 'Asia/Shanghai' }
  );

  } // end if (isProduction) — 写入型任务到此结束

  // ==================== OA 附件孤儿文件清理（仅生产环境） ====================
  // 清理未被任何审批实例引用的上传文件
  // 开发环境数据创建频率低，测试附件可能超过保留期后被误删，因此仅在生产环境运行
  if (isProduction) {
    cron.schedule(
      '0 2 * * *',
      async () => {
        log.info('执行 OA 附件孤儿文件清理...');
        try {
          const result = await runOaOrphanCleanup();
          log.info('OA 附件孤儿文件清理完成:', result);
        } catch (error) {
          log.error('OA 附件孤儿文件清理失败:', error);
        }
      },
      { timezone: 'Asia/Shanghai' }
    );
  }

  // ==================== OA 异步任务消费（所有环境） ====================
  // auto 节点回调、通知重试等通过异步任务表实现，必须在所有环境中消费
  // 否则开发/测试环境中 auto 节点会永远停留在 pending 状态
  let isOaTaskProcessing = false;
  cron.schedule(
    '* * * * *',
    async () => {
      if (isOaTaskProcessing) return;
      isOaTaskProcessing = true;
      try {
        const result = await processOaAsyncTasks();
        if (result.processed > 0 || result.failed > 0) {
          log.info('OA 异步任务消费完成:', result);
        }
        if (result.deadLetter > 0) {
          log.error(`OA 异步任务: ${result.deadLetter} 个任务进入 dead_letter 状态，需要人工介入`);
        }
      } catch (error) {
        log.error('OA 异步任务消费异常:', error);
      } finally {
        isOaTaskProcessing = false;
      }
    },
    { timezone: 'Asia/Shanghai' }
  );

  // ==================== Token 管理（所有环境） ====================
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

  // ==================== ERP 数据同步引擎（所有环境） ====================
  // 5 个 snapshot 数据集：每 2 分钟全量 UPSERT
  // 1 个 flow-window 数据集（销售明细）：
  //   - 热窗口(7天): 每 2 分钟
  //   - 温窗口(8-60天): 每周一凌晨 03:00
  //   - 冷窗口(60天+): 每月 1 号和 15 号凌晨 04:00
  // 同步引擎仅读取 ERP API + 写入本地表，不涉及外部系统写入，开发环境可安全运行
  {
    // 检查 ERP 凭据是否已配置（erpUsername/erpPassword 默认空字符串）
    if (!config.tokenManager.erpUsername || !config.tokenManager.erpPassword) {
      log.warn('[Scheduler] ERP 凭据不完整（ERP_LOGIN_USERNAME / ERP_LOGIN_PASSWORD），跳过同步引擎启动');
    } else {
    // 初始化同步引擎（注册所有数据集配置）
    initializeSyncEngine();

    // 热窗口: snapshot 数据集 + 销售明细热窗口（每 2 分钟）
    let isSyncEngineRunning = false;
    cron.schedule(
      '*/2 * * * *',
      async () => {
        if (isSyncEngineRunning) return;
        isSyncEngineRunning = true;
        try {
          // 1. 同步所有 snapshot 数据集（欠款、商品、库存、批次库存、客户）
          const snapshotResults = await syncAllSnapshots();
          const snapshotOk = snapshotResults.filter(r => r.success).length;
          const snapshotFail = snapshotResults.filter(r => !r.success).length;

          // 2. 同步销售明细热窗口（近 7 天）
          const hotResult = await syncHotWindow('sales');
          const hotOk = hotResult?.success ? 1 : 0;
          const hotFail = hotResult && !hotResult.success ? 1 : 0;

          const totalOk = snapshotOk + hotOk;
          const totalFail = snapshotFail + hotFail;
          if (totalFail > 0 || totalOk > 0) {
            log.info(`ERP 同步引擎: ${totalOk} 成功, ${totalFail} 失败`);
          }

          // 同步成功后异步预热页面级聚合缓存（不阻塞同步流程）
          if (totalOk > 0) {
            import('../ar-dashboard/ar-dashboard-data')
              .then(m => m.buildDashboardContext())
              .catch((err: Error) => log.warn('应收看板缓存预热失败:', err));
            import('../overview/overview.service')
              .then(m => m.getOverviewStats())
              .catch((err: Error) => log.warn('数据总览缓存预热失败:', err));
          }
        } catch (error) {
          log.error('ERP 同步引擎执行异常:', error);
        } finally {
          isSyncEngineRunning = false;
        }
      },
      { timezone: 'Asia/Shanghai' }
    );

    // 温窗口: 销售明细 8-60 天（每周一凌晨 03:00）
    cron.schedule(
      '0 3 * * 1',
      async () => {
        try {
          const result = await syncWarmWindow('sales');
          if (result) {
            log.info(`温窗口同步: ${result.recordsFetched} 条, 耗时 ${result.durationMs}ms`);
          }
        } catch (error) {
          log.error('温窗口同步失败:', error);
        }
      },
      { timezone: 'Asia/Shanghai' }
    );

    // 冷窗口: 销售明细 60 天之前（每月 1 号和 15 号凌晨 04:00）
    cron.schedule(
      '0 4 1,15 * *',
      async () => {
        try {
          const result = await syncColdWindow('sales');
          if (result) {
            log.info(`冷窗口同步: ${result.recordsFetched} 条, 耗时 ${result.durationMs}ms`);
          }
        } catch (error) {
          log.error('冷窗口同步失败:', error);
        }
      },
      { timezone: 'Asia/Shanghai' }
    );
  } // end ERP 同步引擎

  } // end ERP 凭据检查 else 分支

  // [ERP本地化] 旧缓存预热已移除，由 sync engine 接管数据预填充

  // ==================== 钉钉组织架构同步（仅生产环境） ====================
  if (isProduction) {

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

  } // end if (isProduction) — 钉钉同步任务

  log.info('定时任务已注册:');
  log.info('  - Token 管理检查: 每5分钟 (Asia/Shanghai) [所有环境]');
  log.info('  - ERP snapshot 数据集: 每2分钟 (Asia/Shanghai) [5个, 所有环境]');
  log.info('  - ERP 销售明细热窗口: 每2分钟 (Asia/Shanghai) [近7天, 所有环境]');
  log.info('  - ERP 销售明细温窗口: 每周一03:00 (Asia/Shanghai) [8-60天, 所有环境]');
  log.info('  - ERP 销售明细冷窗口: 每月1/15号04:00 (Asia/Shanghai) [60天前, 所有环境]');
  if (isProduction) {
    log.info('  - 退货数据同步: 每天 08:30 (Asia/Shanghai)');
    log.info('  - 待填ERP提醒: 每天 08:35 (Asia/Shanghai)');
    log.info('  - 退货考核计算: 每天 08:45 (Asia/Shanghai)');
    log.info('  - 催收统一流水线: 每天 20:00 (Asia/Shanghai) [压单到期清理→OA实例生成→考核计算]');
    log.info('  - 催收预警提醒: 每天 20:00 (Asia/Shanghai) [逾期前预警]');
    log.info('  - 钉钉通知重试: 每5分钟 (Asia/Shanghai)');
    log.info('  - auto节点卡住恢复: 每5分钟 (Asia/Shanghai)');
    log.info('  - 营业执照补交提醒: 每天 09:00 (Asia/Shanghai)');
    log.info('  - 营业执照补交逾期+考核: 每天 09:15 (Asia/Shanghai)');
    log.info('  - 采购绩效月度存档: 每月1号 01:00 (Asia/Shanghai)');
    log.info('  - OA节点超时催办扫描: 每5分钟 (Asia/Shanghai)');
    log.info('  - OA节点超时考核计算: 每天 09:00 (Asia/Shanghai)');
    log.info('  - OA 异步任务消费: 每1分钟 (Asia/Shanghai)');
    log.info('  - OA 壳实例状态对账: 每30分钟 (Asia/Shanghai)');
    log.info('  - OA 附件孤儿文件清理: 每天 02:00 (Asia/Shanghai)');
    log.info('  - 钉钉部门同步: 每天 06:00 (Asia/Shanghai)');
    log.info('  - 钉钉全量用户同步: 每天 07:00 (Asia/Shanghai)');
    log.info('  - 钉钉增量用户同步: 每4小时 (Asia/Shanghai)');
  } else {
    log.info('  (写入型任务已跳过，仅在生产环境注册)');
  }
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
