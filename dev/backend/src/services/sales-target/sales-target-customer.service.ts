/**
 * 目标管理 - 客户服务
 * 负责客户列表查询（含公海/归属标记）
 */

import { cache, CACHE_TTL } from '../../utils/cache';
import { searchErpCustomers } from '../erp-client/erp-customer.service';
import { ERP_CACHE_PREFIX } from './cache-keys';
import type { CustomerListDTO } from './sales-target.types';

/**
 * 获取客户列表（我的客户 + 公海客户标记）
 * @param currentMarketerStaffId 当前营销师的 ERP staff ID
 * @param marketerErpStaffIds 系统内所有营销师的 ERP staff ID 集合
 */
export async function getCustomerList(
  currentMarketerStaffId: number | null,
  marketerErpStaffIds: Set<number>
): Promise<CustomerListDTO[]> {
  const cacheKey = `${ERP_CACHE_PREFIX}:customer-list:${currentMarketerStaffId}`;
  const cached = cache.get<CustomerListDTO[]>(cacheKey);
  if (cached) return cached;

  const allCustomers = await searchErpCustomers();

  const result: CustomerListDTO[] = [];
  for (const c of allCustomers) {
    const managerId = c.consumerManagerId ?? null;
    const managerName = c.consumerManagerName ?? null;
    const areaName = c.areaName ?? null;
    const channelName = c.groupName ?? null;
    const cooperationTypeName = c.cooperationTypeName ?? null;

    const isPublicSea = managerId === null || !marketerErpStaffIds.has(managerId);
    const isMine = currentMarketerStaffId !== null && managerId === currentMarketerStaffId;

    result.push({
      erp_consumer_id: c.id,
      consumer_name: c.name,
      consumer_manager_name: managerName || null,
      channel_name: channelName,
      area_name: areaName,
      cooperation_type_name: cooperationTypeName,
      is_public_sea: isPublicSea,
      is_mine: isMine,
    });
  }

  cache.set(cacheKey, result, CACHE_TTL.LOW_FREQUENCY);
  return result;
}
