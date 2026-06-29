/**
 * 催收统一流水线 - 编排包装
 * @module services/scheduler/collection-pipeline.task
 *
 * 合并为单一流水线，顺序执行：
 *   Step 1/2: generateCollectionOaInstances — 检测逾期、创建OA催收实例
 *   Step 2/2: autoVerifySettledInstances    — 自动核销检查（关闭已还清、标记部分还清）
 *
 * 注：考核已统一迁移至通用 OA 节点超时考核（oa_node_timeout），不再由流水线单独计算
 */

import { createLogger } from '../../utils/logger';
const log = createLogger('CollectionPipeline');

import { generateCollectionOaInstances } from '../oa/ar-collection-creator';
import { autoVerifySettledInstances } from '../oa/ar-collection-auto-verify';
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

  // ── Step 2/2: 自动核销检查 ──────────────────────────────────
  const step2Start = Date.now();
  try {
    log.info(`[流水线 2/${TOTAL_STEPS}] 执行自动核销检查...`);
    const verifyResult = await autoVerifySettledInstances();
    log.info(
      `[流水线 2/${TOTAL_STEPS}] 自动核销检查完成: 检查${verifyResult.checked}个, 关闭${verifyResult.closed}个, 更新${verifyResult.updated}个, 耗时=${Date.now() - step2Start}ms`
    );
  } catch (error) {
    log.error(`[流水线 2/${TOTAL_STEPS}] 自动核销检查失败, 耗时=${Date.now() - step2Start}ms:`, error);
  }

  // ── 流水线总结 ──────────────────────────────────────────────
  const totalDuration = Date.now() - pipelineStart;
  log.info(`催收统一流水线执行完毕, 总耗时=${totalDuration}ms`);
}
