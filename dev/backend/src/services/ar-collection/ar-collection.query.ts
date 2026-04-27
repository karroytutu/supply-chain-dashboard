/**
 * 催收管理 - 任务查询服务
 * 委托给 ar-collection.repository.ts 进行数据访问
 */

import * as repo from './ar-collection.repository';

/**
 * 获取催收任务列表（分页）
 */
export async function getCollectionTasks(params: Parameters<typeof repo.getTasks>[0]) {
  return repo.getTasks(params);
}

/**
 * 获取单个任务详情
 */
export async function getTaskById(id: number, userId?: number, role?: string) {
  return repo.getTaskById(id, userId, role);
}

/**
 * 获取任务关联的欠款明细列表
 */
export async function getTaskDetails(taskId: number) {
  return repo.getTaskDetails(taskId);
}

/**
 * 获取操作历史
 */
export async function getTaskActions(taskId: number) {
  return repo.getTaskActions(taskId);
}

/**
 * 获取法律催收进展记录
 */
export async function getLegalProgress(taskId: number) {
  return repo.getLegalProgress(taskId);
}

/**
 * 获取所有有任务的处理人列表
 */
export async function getHandlers() {
  return repo.getHandlers();
}
