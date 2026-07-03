/**
 * ERP 供应商收入类别查询服务
 * 从 ERP 获取收入类别树，展平为叶子节点列表供前端下拉选择
 * @module services/erp-client/erp-income-category.service
 */
import { createLogger } from '../../utils/logger';
const log = createLogger('ERP-IncomeCategory');

import { erpGet, extractErpData } from './erp-client';
import { getErpDefaults } from './erp-config';
import { cache, CACHE_TTL } from '../../utils/cache';
import { CACHE_KEY } from '../../utils/cache-keys';
import { withInFlightDedup } from './erp-inflight';

// =====================================================
// 类型定义
// =====================================================

/** ERP 收入类别树节点 */
interface IncomeCategoryNode {
  id: number;
  pid: number;
  level: number;
  code: string;
  text: string;
  name: string;
  state: string;
  taxRadio: number;
  children: IncomeCategoryNode[] | null;
}

/** 展平后的收入类别（叶子节点） */
export interface IncomeCategory {
  id: number;
  pid: number;
  name: string;
}

// =====================================================
// 收入类别查询
// =====================================================

/**
 * 获取供应商收入类别列表（展平后的叶子节点）
 * GET /saas/pro/funds-account/list-income-tree?type=1&subType=SUPPLIER
 *
 * 缓存策略：LOW_FREQUENCY（5分钟），收入类别变更频率低
 */
export async function getIncomeCategories(): Promise<IncomeCategory[]> {
  const cacheKey = CACHE_KEY.ERP_INCOME_CATEGORIES_SUPPLIER;

  // 1. 缓存命中
  const cached = cache.get<IncomeCategory[]>(cacheKey);
  if (cached) return cached;

  // 2. in-flight 去重 + 拉取
  return withInFlightDedup(cacheKey, async () => {
    const { cid, uid } = getErpDefaults();

    const result = await erpGet<unknown>(
      '/funds-account/list-income-tree',
      { type: 1, subType: 'SUPPLIER', cid, uid },
      { pathPrefix: '/saas/pro/', businessType: 'income_category_tree' }
    );

    const tree = extractErpData<IncomeCategoryNode[]>(result);
    if (!tree || !Array.isArray(tree)) {
      log.warn('收入类别树返回为空');
      return [];
    }

    // 展平为叶子节点（level=2 或无 children 的节点）
    const flat: IncomeCategory[] = [];
    for (const parent of tree) {
      if (parent.children && parent.children.length > 0) {
        for (const child of parent.children) {
          flat.push({ id: child.id, pid: child.pid, name: child.name });
        }
      } else {
        // 一级节点本身也是叶子（理论上不应出现，兜底处理）
        flat.push({ id: parent.id, pid: parent.pid, name: parent.name });
      }
    }

    log.info(`收入类别加载完成: ${flat.length} 个叶子节点`);
    cache.set(cacheKey, flat, CACHE_TTL.LOW_FREQUENCY);
    return flat;
  });
}
