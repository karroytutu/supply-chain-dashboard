/**
 * 催收统一流水线 - 编排包装
 * @module services/scheduler/collection-pipeline.task
 *
 * 合并为单一流水线，顺序执行：
 *   Step 1/2: generateCollectionOaInstances — 检测逾期、创建OA催收实例
 *   Step 2/2: 考核计算 + 通知         — OA催收节点考核 + 发送考核通知
 *
 * 设计要点：
 *   - 每步独立 try-catch，某步失败不阻断后续步骤
 *   - 不修改任何核心函数的内部实现，仅做编排调度
 *
 * 注：原 Step 1 syncERPDebts 已移除（旧表同步不再需要，OA实例创建独立从ERP拉取数据）
 */

import { createLogger } from '../../utils/logger';
const log = createLogger('CollectionPipeline');

import { generateCollectionOaInstances } from '../oa/ar-collection-creator';
import { runCalculation } from '../assessment/assessment-calculate';
import { sendAssessmentNotifications } from '../assessment/assessment-notify';
import * as assessmentRepository from '../assessment/assessment.repository';
import { checkHoldMetaExpiry } from '../erp-debt/ar-hold-meta.service';

const TOTAL_STEPS = 2;

/**
 * 催收统一流水线入口
 */
export async function runCollectionPipeline(): Promise<void> {
  const pipelineStart = Date.now();
  log.info('开始执行催收统一流水线...');

  // ── 前置：清理到期期限压单 ──────────────────────────────────
  try {
    await checkHoldMetaExpiry();
  } catch (error) {
    log.error('期限压单到期清理失败:', error);
    // 不阻断主流程
  }

  // ── Step 1/2: OA 催收实例生成 ────────────────────────────────
  const step1Start = Date.now();
  try {
    log.info(`[流水线 1/${TOTAL_STEPS}] 执行催收OA实例生成...`);
    await generateCollectionOaInstances();
    log.info(`[流水线 1/${TOTAL_STEPS}] 催收OA实例生成完成, 耗时=${Date.now() - step1Start}ms`);
  } catch (error) {
    log.error(`[流水线 1/${TOTAL_STEPS}] 催收OA实例生成失败, 耗时=${Date.now() - step1Start}ms:`, error);
  }

  // ── Step 2/2: OA 催收节点考核计算 ────────────────────────────
  const step2Start = Date.now();
  try {
    log.info(`[流水线 2/${TOTAL_STEPS}] 执行OA催收节点考核计算...`);
    const result = await runCalculation({
      triggered_by: 'scheduled',
      category: 'oa_collection',
    });
    log.info(
      `[流水线 2/${TOTAL_STEPS}] OA催收节点考核完成: ${result.totalRecords}条记录, ${result.newRecords}条新增, 耗时=${Date.now() - step2Start}ms`
    );

    if (result.newRecords > 0) {
      const pendingRecords = await assessmentRepository.getRecords({
        category: 'oa_collection',
        status: 'pending' as any,
        page: 1,
        page_size: 1000,
      });
      if (pendingRecords.total > 1000) {
        log.warn(`[流水线 2/${TOTAL_STEPS}] 待通知记录(${pendingRecords.total})超过单次上限(1000)，部分通知将不会发送`);
      }
      await sendAssessmentNotifications(pendingRecords.rows);
    }
  } catch (error) {
    log.error(`[流水线 2/${TOTAL_STEPS}] OA催收节点考核计算失败, 耗时=${Date.now() - step2Start}ms:`, error);
  }

  // ── 流水线总结 ──────────────────────────────────────────────
  const totalDuration = Date.now() - pipelineStart;
  log.info(`催收统一流水线执行完毕, 总耗时=${totalDuration}ms`);
}
