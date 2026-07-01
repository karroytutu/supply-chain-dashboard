/**
 * ERP 同步引擎 - 配置初始化
 * 将所有数据集注册到编排器
 * @module services/erp-sync/sync-config
 */

import { createLogger } from '../../utils/logger';
import { registerSource } from './sync-orchestrator';
import { ALL_SYNC_SOURCES } from './datasets';

const log = createLogger('SyncConfig');

/** 初始化同步引擎：注册所有数据集 */
export function initializeSyncEngine(): void {
  log.info(`初始化同步引擎: 注册 ${ALL_SYNC_SOURCES.length} 个数据集`);

  for (const source of ALL_SYNC_SOURCES) {
    registerSource(source);
  }

  log.info(`同步引擎初始化完成: ${ALL_SYNC_SOURCES.map(s => s.id).join(', ')}`);
}
