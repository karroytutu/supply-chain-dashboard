/**
 * [DEPRECATED] 全局缓存预热服务
 *
 * 此模块已废弃，由 ERP 数据同步引擎 (erp-sync/) 完全接管。
 * - runStartupWarmup() 已由 sync engine 的启动同步替代
 * - runPeriodicWarmup() 已由 sync engine 的每 2 分钟 cron 替代
 *
 * 保留此文件仅为避免其他模块的 import 报错，后续可安全删除。
 */
import { createLogger } from '../utils/logger';
const log = createLogger('CacheWarmup');

/** @deprecated 由 sync engine 接管，此函数为空壳 */
export async function runStartupWarmup(): Promise<void> {
  log.info('[CacheWarmup] 已废弃，由 ERP 数据同步引擎接管');
}

/** @deprecated 由 sync engine 接管，此函数为空壳 */
export async function runPeriodicWarmup(): Promise<void> {
  log.info('[CacheWarmup] 已废弃，由 ERP 数据同步引擎接管');
}
