/**
 * ERP 客户参考数据查询服务
 * 提供客户等级、渠道（分组）、片区（区域）的列表查询
 * @module services/erp-client/erp-customer-reference.service
 */

import { erpPost } from './erp-client';
import { getErpDefaults } from './erp-config';
import { cache, CACHE_TTL } from '../../utils/cache';

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
  const cacheKey = 'erp:customer:grades';
  const cached = cache.get<ErpGrade[]>(cacheKey);
  if (cached) return cached;

  const { cid, uid } = getErpDefaults();
  const result = await erpPost(
    '/store-grade-query/query-list',
    { cid, uid },
    { pathPrefix: '/redcoast/', businessType: 'customer_grade_list' }
  ) as any;

  const grades: ErpGrade[] = result?.data || result || [];
  cache.set(cacheKey, grades, CACHE_TTL.LOW_FREQUENCY);
  return grades;
}

/**
 * 获取客户渠道（分组）列表
 * POST /redcoast/store-group-query/query-list
 */
export async function getErpGroups(): Promise<ErpGroup[]> {
  const cacheKey = 'erp:customer:groups';
  const cached = cache.get<ErpGroup[]>(cacheKey);
  if (cached) return cached;

  const { cid, uid } = getErpDefaults();
  const result = await erpPost(
    '/store-group-query/query-list',
    { cid, uid },
    { pathPrefix: '/redcoast/', businessType: 'customer_group_list' }
  ) as any;

  const groups: ErpGroup[] = result?.data || result || [];
  cache.set(cacheKey, groups, CACHE_TTL.LOW_FREQUENCY);
  return groups;
}

/**
 * 获取客户片区（区域）列表
 * POST /redcoast/store-area-query/query-list
 */
export async function getErpAreas(): Promise<ErpArea[]> {
  const cacheKey = 'erp:customer:areas';
  const cached = cache.get<ErpArea[]>(cacheKey);
  if (cached) return cached;

  const { cid, uid } = getErpDefaults();
  const result = await erpPost(
    '/store-area-query/query-list',
    { cid, uid },
    { pathPrefix: '/redcoast/', businessType: 'customer_area_list' }
  ) as any;

  // API 返回树形结构，需递归展平为列表
  const rawData = result?.data || result || [];
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
