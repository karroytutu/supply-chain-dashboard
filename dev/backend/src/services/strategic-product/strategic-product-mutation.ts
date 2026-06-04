/**
 * 战略商品变更服务
 * 业务逻辑层，委托 Repository 执行数据访问，写入后自动失效缓存
 */
import { createLogger } from '../../utils/logger';
const log = createLogger('StrategicProduct');

import * as repo from './strategic-product.repository';
import { toStrategicProductDTO } from './strategic-product.mapper';
import { checkAndUpdateConfirmedStatus } from './strategic-product-utils';
import type {
  StrategicProduct,
  AddStrategicProductsParams,
  ConfirmStrategicProductParams,
  BatchConfirmStrategicProductsParams,
  BatchConfirmResult,
  BatchDeleteStrategicProductsParams,
  BatchDeleteResult,
} from './strategic-product.types';

/**
 * 批量添加战略商品
 */
export async function addStrategicProducts(
  params: AddStrategicProductsParams
): Promise<{ addedCount: number; skippedCount: number }> {
  const { goodsIds, userId } = params;
  log.info('添加战略商品，goodsIds:', goodsIds);

  const result = await repo.addProducts(goodsIds, userId);
  log.info(`添加完成: 成功 ${result.addedCount}, 跳过 ${result.skippedCount}`);

  if (result.addedCount > 0) {
    repo.invalidateProductCache();
  }
  return result;
}

/**
 * 删除战略商品
 */
export async function deleteStrategicProduct(id: number): Promise<boolean> {
  const result = await repo.deleteProduct(id);
  if (result) {
    repo.invalidateProductCache();
  }
  return result;
}

/**
 * 确认战略商品
 */
export async function confirmStrategicProduct(
  params: ConfirmStrategicProductParams
): Promise<StrategicProduct | null> {
  const { id, action, userId, userRoles, userName } = params;

  const row = await repo.confirmProduct(id, action, userId, userRoles, userName);
  if (!row) return null;

  // 检查是否双方都已确认
  if (action === 'confirm') {
    await checkAndUpdateConfirmedStatus(id);
  }

  repo.invalidateProductCache();
  return toStrategicProductDTO(row);
}

/**
 * 批量确认战略商品
 */
export async function batchConfirmStrategicProducts(
  params: BatchConfirmStrategicProductsParams
): Promise<BatchConfirmResult> {
  const result = await repo.batchConfirmProducts(params);
  repo.invalidateProductCache();
  return result;
}

/**
 * 同步战略商品品类路径
 */
export async function syncCategoryPath(): Promise<{ updatedCount: number; totalCount: number }> {
  const result = await repo.syncCategoryPath();
  if (result.updatedCount > 0) {
    repo.invalidateProductCache();
  }
  return result;
}

/**
 * 批量删除战略商品
 */
export async function batchDeleteStrategicProducts(
  params: BatchDeleteStrategicProductsParams
): Promise<BatchDeleteResult> {
  const result = await repo.batchDeleteProducts(params);
  repo.invalidateProductCache();
  return result;
}
