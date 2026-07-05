/**
 * 目标管理 - 写入服务
 * 负责目标的创建、更新、删除
 */

import { createLogger } from '../../utils/logger';
const log = createLogger('SalesTarget-Mutation');

import {
  createTarget,
  updateTargetItems,
  deleteTarget,
  getTargetById,
  updateTargetStatus,
} from './sales-target.repository';
import { cache } from '../../utils/cache';
import { ERP_CACHE_PREFIX } from './cache-keys';
import type { SaveTargetParams, SalesTarget, TargetApprovalStatus } from './sales-target.types';

/**
 * 创建目标（含明细行）
 */
export async function saveTarget(params: SaveTargetParams): Promise<SalesTarget> {
  log.info(`保存目标: marketer_id=${params.marketer_id}, ${params.year}-${params.month}, items=${params.items.length}`);
  const result = await createTarget(params);
  invalidateOverviewCache();
  return result;
}

/**
 * 更新目标明细（整体替换）
 */
export async function updateTarget(targetId: number, items: SaveTargetParams['items']): Promise<void> {
  const target = await getTargetById(targetId);
  if (!target) {
    throw new Error('目标不存在');
  }
  log.info(`更新目标: id=${targetId}, items=${items.length}`);
  await updateTargetItems(targetId, items);
  invalidateOverviewCache();
}

/**
 * 删除目标（级联删除明细）
 */
export async function removeTarget(targetId: number): Promise<void> {
  log.info(`删除目标: id=${targetId}`);
  await deleteTarget(targetId);
  invalidateOverviewCache();
}

/**
 * 查询目标主记录（供控制器层使用，避免直接导入 Repository）
 */
export async function getTarget(id: number) {
  return getTargetById(id);
}

/**
 * 更新目标审批状态（供控制器层使用，避免直接导入 Repository）
 */
export async function changeTargetStatus(
  id: number,
  status: TargetApprovalStatus,
  expected: TargetApprovalStatus[],
  oaInstanceId?: number,
) {
  const result = await updateTargetStatus(id, status, expected, oaInstanceId);
  invalidateOverviewCache();
  return result;
}

/** 失效概览缓存（目标写入或状态变更后调用） */
function invalidateOverviewCache(): void {
  cache.invalidate(`${ERP_CACHE_PREFIX}:overview:`);
}
