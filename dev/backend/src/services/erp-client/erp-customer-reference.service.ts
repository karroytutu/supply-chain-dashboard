/**
 * ERP 客户参考数据查询服务
 * 提供客户等级、渠道（分组）、片区（区域）的列表查询
 * @module services/erp-client/erp-customer-reference.service
 */

import { erpPost, extractErpData } from './erp-client';
import { getErpDefaults } from './erp-config';
import { cache, CACHE_TTL } from '../../utils/cache';
import { CACHE_KEY } from '../../utils/cache-keys';

// =====================================================
// 类型定义
// =====================================================

/** 等级列表项 */
export interface ErpGrade {
  id: number | string;
  name: string;
  [key: string]: unknown;
}

/** 渠道（分组）列表项 */
export interface ErpGroup {
  id: number | string;
  name: string;
  [key: string]: unknown;
}

/** 片区（区域）列表项 */
export interface ErpArea {
  id: number | string;
  name: string;
  [key: string]: unknown;
}

// =====================================================
// 查询方法
// =====================================================

/**
 * 获取客户等级列表
 * POST /redcoast/store-grade-query/query-list
 */
export async function getErpGrades(): Promise<ErpGrade[]> {
  const cacheKey = CACHE_KEY.ERP_CUSTOMER_GRADES;
  const cached = cache.get<ErpGrade[]>(cacheKey);
  if (cached) return cached;

  const { cid, uid } = getErpDefaults();
  const response = await erpPost<unknown>(
    '/store-grade-query/query-list',
    { cid, uid },
    { pathPrefix: '/redcoast/', businessType: 'customer_grade_list' }
  );

  const grades = extractErpData<ErpGrade[]>(response) ?? [];
  cache.set(cacheKey, grades, CACHE_TTL.LOW_FREQUENCY);
  return grades;
}

/**
 * 获取客户渠道（分组）列表
 * POST /redcoast/store-group-query/query-list
 */
export async function getErpGroups(): Promise<ErpGroup[]> {
  const cacheKey = CACHE_KEY.ERP_CUSTOMER_GROUPS;
  const cached = cache.get<ErpGroup[]>(cacheKey);
  if (cached) return cached;

  const { cid, uid } = getErpDefaults();
  const response = await erpPost<unknown>(
    '/store-group-query/query-list',
    { cid, uid },
    { pathPrefix: '/redcoast/', businessType: 'customer_group_list' }
  );

  const groups = extractErpData<ErpGroup[]>(response) ?? [];
  cache.set(cacheKey, groups, CACHE_TTL.LOW_FREQUENCY);
  return groups;
}

/**
 * 获取客户片区（区域）列表
 * POST /redcoast/store-area-query/query-list
 */
export async function getErpAreas(): Promise<ErpArea[]> {
  const cacheKey = CACHE_KEY.ERP_CUSTOMER_AREAS;
  const cached = cache.get<ErpArea[]>(cacheKey);
  if (cached) return cached;

  const { cid, uid } = getErpDefaults();
  const response = await erpPost<unknown>(
    '/store-area-query/query-list',
    { cid, uid },
    { pathPrefix: '/redcoast/', businessType: 'customer_area_list' }
  );

  // API 返回树形结构，需递归展平为列表
  const rawData = extractErpData<unknown>(response) ?? [];
  const items = Array.isArray(rawData) ? rawData : [rawData];
  const areas: ErpArea[] = [];

  function flatten(nodes: Array<{ id: number | string; name: string; children?: any[] }>) {
    for (const node of nodes) {
      areas.push({ id: node.id, name: node.name });
      if (node.children?.length) {
        flatten(node.children);
      }
    }
  }
  flatten(items);

  cache.set(cacheKey, areas, CACHE_TTL.LOW_FREQUENCY);
  return areas;
}
