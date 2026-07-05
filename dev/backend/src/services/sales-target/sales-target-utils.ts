/**
 * 目标管理 - 共享工具函数
 * 被多个 sales-target-*.service.ts 文件复用
 */

import { appQuery } from '../../db/appPool';
import { cache, CACHE_TTL } from '../../utils/cache';
import { ROLE_CODES } from '../../utils/constants';
import { ERP_CACHE_PREFIX } from './cache-keys';
import type { SalesTarget } from './sales-target.types';

/** 格式化为 YYYY-MM-DD */
export function formatDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/**
 * 获取指定月份的前 N 个月的日期范围
 * @param year 目标年份
 * @param month 目标月份（1-12）
 * @param offset 向前偏移月数（1=上月，2=上上月）
 * @returns [startDate, endDate) 半开区间，格式 YYYY-MM-DD
 */
export function getMonthRange(year: number, month: number, offset: number): [string, string] {
  const d = new Date(year, month - 1 - offset, 1);
  const start = formatDate(d);
  const end = formatDate(new Date(d.getFullYear(), d.getMonth() + 1, 1));
  return [start, end];
}

/**
 * 获取系统内营销师用户列表（复用于控制器和概览服务）
 */
export async function getMarketerUsers(): Promise<Array<{ id: number; name: string }>> {
  const cacheKey = `${ERP_CACHE_PREFIX}:marketer-users`;
  const cached = cache.get<Array<{ id: number; name: string }>>(cacheKey);
  if (cached) return cached;

  const result = await appQuery(
    `SELECT u.id, u.name
     FROM users u
     JOIN user_roles ur ON ur.user_id = u.id
     JOIN roles r ON r.id = ur.role_id
     WHERE r.code = $1 AND u.status = 1
     ORDER BY u.name`,
    [ROLE_CODES.MARKETER]
  );
  cache.set(cacheKey, result.rows, CACHE_TTL.LOW_FREQUENCY);
  return result.rows;
}

/**
 * 归属校验：检查当前用户是否有权编辑指定营销师的目标
 * admin 和 marketing_manager 可编辑任何营销师，其他角色只能编辑自己
 */
export function canEditMarketer(
  userRoles: string[],
  userId: number,
  marketerId: number,
): boolean {
  if (userRoles.includes(ROLE_CODES.ADMIN) || userRoles.includes(ROLE_CODES.MARKETING_MANAGER)) {
    return true;
  }
  return userId === marketerId;
}

/**
 * 校验目标是否可提交审批
 * 仅 draft 和 rejected 状态可提交
 */
export function validateTargetForSubmission(target: SalesTarget): void {
  if (target.status !== 'draft' && target.status !== 'rejected') {
    throw new Error(`目标当前状态为"${target.status}"，不允许提交审批`);
  }
}
