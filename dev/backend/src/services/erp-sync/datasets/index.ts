/**
 * 数据集配置注册表
 * 导出所有已注册的数据集配置
 * @module services/erp-sync/datasets
 */

export { debtsConfig } from './debts.dataset';
export { productsConfig } from './products.dataset';
export { inventoryConfig } from './inventory.dataset';
export { batchInventoryConfig } from './batch-inventory.dataset';
export { customersConfig } from './customers.dataset';
export { salesDetailConfig } from './sales-detail.dataset';

import { debtsConfig } from './debts.dataset';
import { productsConfig } from './products.dataset';
import { inventoryConfig } from './inventory.dataset';
import { batchInventoryConfig } from './batch-inventory.dataset';
import { customersConfig } from './customers.dataset';
import { salesDetailConfig } from './sales-detail.dataset';
import type { SyncSourceConfig } from '../sync-types';

/** 所有已注册的数据集配置 */
export const ALL_SYNC_SOURCES: SyncSourceConfig[] = [
  debtsConfig,
  productsConfig,
  inventoryConfig,
  batchInventoryConfig,
  customersConfig,
  salesDetailConfig,
];
