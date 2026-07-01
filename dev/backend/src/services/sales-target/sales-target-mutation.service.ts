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
} from './sales-target.repository';
import type { SaveTargetParams, SalesTarget } from './sales-target.types';

/**
 * 创建目标（含明细行）
 */
export async function saveTarget(params: SaveTargetParams): Promise<SalesTarget> {
  log.info(`保存目标: marketer_id=${params.marketer_id}, ${params.year}-${params.month}, items=${params.items.length}`);
  return createTarget(params);
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
}

/**
 * 删除目标（级联删除明细）
 */
export async function removeTarget(targetId: number): Promise<void> {
  const target = await getTargetById(targetId);
  if (!target) {
    throw new Error('目标不存在');
  }
  log.info(`删除目标: id=${targetId}`);
  await deleteTarget(targetId);
}
