/**
 * 目标管理 - 营销师服务
 * 负责营销师 ERP staff ID 查询
 */

import { appQuery } from '../../db/appPool';
import { cache, CACHE_TTL } from '../../utils/cache';
import { ROLE_CODES } from '../../utils/constants';
import { getErpStaff } from '../fixed-asset/fixed-asset.query';
import { ERP_CACHE_PREFIX } from './cache-keys';

/**
 * 获取系统内 marketer 角色用户的 ERP staff ID 集合
 * 逻辑：查 users 表 marketer 角色 → 取姓名 → 匹配 ERP staff 列表 → 返回 staff ID Set
 */
export async function getMarketerErpStaffIds(): Promise<Set<number>> {
  const cacheKey = `${ERP_CACHE_PREFIX}:marketer-staff-ids`;
  const cached = cache.get<Set<number>>(cacheKey);
  if (cached) return cached;

  // 1. 查询系统内 marketer 角色的用户姓名
  const result = await appQuery(
    `SELECT u.name
     FROM users u
     JOIN user_roles ur ON ur.user_id = u.id
     JOIN roles r ON r.id = ur.role_id
     WHERE r.code = $1 AND u.status = 1`,
    [ROLE_CODES.MARKETER]
  );
  const marketerNames = new Set(result.rows.map((r: { name: string }) => r.name));

  if (marketerNames.size === 0) {
    const empty = new Set<number>();
    cache.set(cacheKey, empty, CACHE_TTL.LOW_FREQUENCY);
    return empty;
  }

  // 2. 获取 ERP 员工列表，按姓名匹配
  const erpStaff = await getErpStaff();
  const staffIds = new Set<number>();
  for (const staff of erpStaff) {
    if (marketerNames.has(staff.name)) {
      staffIds.add(staff.id as number);
    }
  }

  cache.set(cacheKey, staffIds, CACHE_TTL.LOW_FREQUENCY);
  return staffIds;
}

/**
 * 获取当前营销师的 ERP staff ID
 */
export async function getMarketerStaffId(marketerUserId: number): Promise<number | null> {
  const userResult = await appQuery('SELECT name FROM users WHERE id = $1', [marketerUserId]);
  if (userResult.rows.length === 0) return null;
  const name = userResult.rows[0].name;

  const erpStaff = await getErpStaff();
  const matched = erpStaff.find(s => s.name === name);
  return matched ? (matched.id as number) : null;
}
