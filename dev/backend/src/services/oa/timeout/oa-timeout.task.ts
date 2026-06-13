/**
 * OA节点时限 - 定时任务入口
 * @module services/oa/timeout/oa-timeout.task
 */

import { createLogger } from '../../../utils/logger';
const log = createLogger('OaTimeout');

import { runOaTimeoutScan } from './oa-timeout.service';

/**
 * 执行催办扫描定时任务
 * 由 scheduler 每1分钟调用
 */
export async function runOaTimeoutTask(): Promise<void> {
  try {
    await runOaTimeoutScan();
  } catch (error) {
    log.error('OA时限定时任务异常:', error);
  }
}

/**
 * 执行考核计算定时任务
 * 由 scheduler 每日 09:00 调用
 */
export async function runOaTimeoutAssessmentTask(): Promise<void> {
  try {
    // 考核计算通过 assessment 模块的 runCalculation 执行
    const { runCalculation } = await import('../../assessment/assessment-calculate');
    await runCalculation({
      triggered_by: 'scheduled',
      category: 'oa_node_timeout',
    });
    log.info('OA节点超时考核计算完成');
  } catch (error) {
    log.error('OA时限考核计算异常:', error);
  }
}
