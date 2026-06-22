/**
 * 全局缓存预热服务
 * 统一管理所有依赖 ERP 数据的缓存预热策略
 *
 * 架构：启动时并行拉取 7 个 ERP 基础数据集填缓存，之后由 scheduler 每 2 分钟自动刷新。
 * 所有页面打开时直接从缓存取数据（<50ms），无需等待 ERP API。
 *
 * 新增预热目标：只需在 WARMUP_TARGETS 数组中新增一个条目（1 行代码）。
 */
import { createLogger } from '../utils/logger';
const log = createLogger('CacheWarmup');

import { STANDARD_CALC_DAYS } from '../utils/constants';
import { fetchAllProducts } from './erp-client/erp-product.service';
import { fetchAllInventory } from './erp-client/erp-inventory.service';
import { fetchAllBatchInventory } from './erp-client/erp-batch-inventory.service';
import { getDailySalesMap, getLastSaleMap } from './erp-client/erp-sales-detail.service';
import { fetchAllErpDebts } from './erp-client/erp-debt.service';

// ============================================
// 预热目标定义（静态数组 = 注册表）
// ============================================

interface WarmupTarget {
  /** 数据集名称（中文，用于日志） */
  name: string;
  /** 拉取函数（内部已自带缓存 + in-flight 去重） */
  fn: () => Promise<unknown>;
}

/**
 * 所有需要预热的 ERP 基础数据集
 * 这 7 个数据集分属 5 个不同的限流分组，可以真正并行拉取而不会互相阻塞。
 * 添加新数据集只需在此数组中新增一行。
 */
const WARMUP_TARGETS: WarmupTarget[] = [
  { name: 'ERP商品档案',  fn: () => fetchAllProducts(STANDARD_CALC_DAYS) },
  { name: 'ERP实时库存',  fn: () => fetchAllInventory() },
  { name: 'ERP批次库存',  fn: () => fetchAllBatchInventory() },
  { name: 'ERP日均销量',  fn: () => getDailySalesMap(STANDARD_CALC_DAYS) },
  { name: 'ERP最后销售',  fn: () => getLastSaleMap() },
  { name: 'ERP客户欠款',  fn: () => fetchAllErpDebts() },
];

// ============================================
// 启动预热（阶段 A + 阶段 B）
// ============================================

/** 去重：防止启动预热与定时预热并发执行 */
let _startupInFlight: Promise<void> | null = null;

/**
 * 启动预热：服务启动时调用一次
 *
 * 阶段 A：并行拉取 7 个 ERP 基础数据集填充缓存
 * 阶段 B：调用页面级聚合函数（应收看板 + 数据总览），将原始数据整理为看板格式
 *
 * 单个数据集失败不影响其他数据集（Promise.allSettled 容错）。
 * 预热失败不阻断服务启动（由 app.ts 中 .catch(() => {}) 兜底）。
 */
export async function runStartupWarmup(): Promise<void> {
  if (_startupInFlight) return _startupInFlight;

  _startupInFlight = _doStartupWarmup().finally(() => {
    _startupInFlight = null;
  });

  return _startupInFlight;
}

async function _doStartupWarmup(): Promise<void> {
  log.info(`[启动预热] 开始预热 ${WARMUP_TARGETS.length} 个 ERP 数据集...`);
  const start = Date.now();

  // 阶段 A：并行拉取所有 ERP 基础数据集
  const results = await Promise.allSettled(
    WARMUP_TARGETS.map(async (target) => {
      const t0 = Date.now();
      await target.fn();
      log.info(`[启动预热] ✓ ${target.name} (${Date.now() - t0}ms)`);
    })
  );

  // 统计阶段 A 结果
  const succeeded = results.filter(r => r.status === 'fulfilled').length;
  const failed = results.filter(r => r.status === 'rejected').length;

  for (let i = 0; i < results.length; i++) {
    const r = results[i];
    if (r.status === 'rejected') {
      log.warn(`[启动预热] ✗ ${WARMUP_TARGETS[i].name} 预热失败（不阻断）:`, r.reason);
    }
  }

  log.info(`[启动预热] 阶段A完成: ${succeeded}/${WARMUP_TARGETS.length} 成功, ${failed} 失败, 耗时 ${Date.now() - start}ms`);

  // 阶段 B：页面级聚合预热（依赖阶段 A 的原始数据已在缓存中）
  await _warmupPageAggregations();

  log.info(`[启动预热] 全部完成，总耗时 ${((Date.now() - start) / 1000).toFixed(1)}s`);
}

// ============================================
// 周期性预热（仅阶段 A）
// ============================================

/** 去重：防止定时任务与启动预热并发执行 */
let _periodicInFlight: Promise<void> | null = null;
/** 连续失败计数器：预热全部失败时递增，成功时重置 */
let _consecutiveFailures = 0;

/**
 * 周期性预热：由 scheduler 每 2 分钟调用
 *
 * 仅刷新阶段 A（ERP 基础数据集），页面级聚合缓存由各自的 stale-while-revalidate 机制兜底。
 * ERP 基础数据集 TTL 为 3-5 分钟，2 分钟间隔确保缓存过期前已被刷新。
 */
export async function runPeriodicWarmup(): Promise<void> {
  if (_periodicInFlight) return _periodicInFlight;

  _periodicInFlight = _doPeriodicWarmup().finally(() => {
    _periodicInFlight = null;
  });

  return _periodicInFlight;
}

async function _doPeriodicWarmup(): Promise<void> {
  const start = Date.now();

  const results = await Promise.allSettled(
    WARMUP_TARGETS.map(target => target.fn())
  );

  // 统计失败并记录警告
  const failed = results.filter(r => r.status === 'rejected');
  if (failed.length > 0) {
    _consecutiveFailures++;
    log.warn(
      `[周期预热] ${failed.length}/${WARMUP_TARGETS.length} 个数据集刷新失败（连续第 ${_consecutiveFailures} 次）`
    );
    for (let i = 0; i < results.length; i++) {
      if (results[i].status === 'rejected') {
        log.warn(`[周期预热] ✗ ${WARMUP_TARGETS[i].name}:`, (results[i] as PromiseRejectedResult).reason);
      }
    }
  } else {
    _consecutiveFailures = 0;
  }

  log.debug(`[周期预热] 完成，耗时 ${Date.now() - start}ms`);
}

// ============================================
// 页面级聚合预热（阶段 B）
// ============================================

/**
 * 预热页面级聚合缓存
 * 在阶段 A 完成后调用，将 ERP 原始数据整理为各页面需要的聚合格式
 */
async function _warmupPageAggregations(): Promise<void> {
  const start = Date.now();

  // 应收看板聚合（依赖 ERP 欠款 + 销售数据）
  try {
    const { getArDashboardOverview } = await import('./ar-dashboard/ar-dashboard.service');
    await getArDashboardOverview();
    log.info(`[启动预热] ✓ 应收看板聚合 (${Date.now() - start}ms)`);
  } catch (err) {
    log.warn('[启动预热] ✗ 应收看板聚合失败（不阻断）:', err);
  }

  // 数据总览聚合（依赖 ERP 商品 + 库存 + 销售数据）
  try {
    const { getOverviewStats } = await import('./overview/overview.service');
    await getOverviewStats();
    log.info(`[启动预热] ✓ 数据总览聚合 (${Date.now() - start}ms)`);
  } catch (err) {
    log.warn('[启动预热] ✗ 数据总览聚合失败（不阻断）:', err);
  }
}
