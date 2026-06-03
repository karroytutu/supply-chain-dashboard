/**
 * 战略商品 - 数据访问层 (Repository)
 * 收敛所有 SQL 查询和缓存逻辑，Service 层不再直接编写 SQL
 * 遵循规范：Controller → Service → Repository → DB
 */

import { fetchAllProducts, getProductById, type ErpProduct } from '../erp-client/erp-product.service';
import { getStockSummaryMap } from '../erp-client/erp-inventory.service';
import { appQuery } from '../../db/appPool';
import { cache, CACHE_TTL } from '../../utils/cache';
import { escapeLikePattern } from '../../utils/sqlHelpers';
import type {
  StrategicProductQueryParams,
  StrategicProductStatus,
  GetProductsQueryParams,
} from './strategic-product.types';

const CACHE_PREFIX = 'strategic:product';

// ==================== 读取操作 ====================

/**
 * 获取战略商品列表（分页）
 */
export async function getProducts(params: StrategicProductQueryParams) {
  const { page = 1, pageSize = 20, status, categoryPath, keyword } = params;
  const offset = (page - 1) * pageSize;
  const conditions: string[] = ['1=1'];
  const queryParams: any[] = [];
  let paramIndex = 1;

  if (status) {
    conditions.push(`sp.status = $${paramIndex++}`);
    queryParams.push(status);
  }
  if (categoryPath) {
    conditions.push(`sp.category_path LIKE $${paramIndex++}`);
    queryParams.push(`${categoryPath}%`);
  }
  if (keyword) {
    conditions.push(`sp.goods_name ILIKE $${paramIndex++}`);
    queryParams.push(`%${escapeLikePattern(keyword)}%`);
  }

  const whereClause = conditions.join(' AND ');

  const cacheKey = `${CACHE_PREFIX}:list:${JSON.stringify({ page, pageSize, status, categoryPath, keyword })}`;
  const cached = cache.get<any>(cacheKey);
  if (cached) return cached;

  // 查询总数
  const countResult = await appQuery<{ total: number }>(
    `SELECT COUNT(*) as total FROM strategic_products sp WHERE ${whereClause}`,
    queryParams
  );
  const total = parseInt(countResult.rows[0]?.total as any) || 0;

  // 查询列表
  const listParams = [...queryParams, pageSize, offset];
  const result = await appQuery(
    `SELECT
      sp.*,
      pu.name as procurement_confirmer_name,
      mu.name as marketing_confirmer_name
    FROM strategic_products sp
    LEFT JOIN users pu ON sp.procurement_confirmed_by = pu.id
    LEFT JOIN users mu ON sp.marketing_confirmed_by = mu.id
    WHERE ${whereClause}
    ORDER BY sp.created_at DESC
    LIMIT $${paramIndex++} OFFSET $${paramIndex++}`,
    listParams
  );

  const data = {
    data: result.rows,
    total,
    page,
    pageSize,
    totalPages: Math.ceil(total / pageSize),
  };

  cache.set(cacheKey, data, CACHE_TTL.DASHBOARD);
  return data;
}

/**
 * 获取战略商品统计数据
 */
export async function getStats() {
  const cacheKey = `${CACHE_PREFIX}:stats`;
  const cached = cache.get<any>(cacheKey);
  if (cached) return cached;

  const result = await appQuery(
    `SELECT
      COUNT(*) as total,
      COUNT(CASE WHEN status = 'pending' THEN 1 END) as pending,
      COUNT(CASE WHEN status = 'confirmed' THEN 1 END) as confirmed,
      COUNT(CASE WHEN status = 'rejected' THEN 1 END) as rejected
    FROM strategic_products`
  );

  cache.set(cacheKey, result.rows[0], CACHE_TTL.DASHBOARD);
  return result.rows[0];
}

/**
 * 获取品类树（带战略商品统计）
 */
export async function getCategoryTree() {
  const cacheKey = `${CACHE_PREFIX}:category_tree`;
  const cached = cache.get<any[]>(cacheKey);
  if (cached) return cached;

  // 从商品档案 API 获取品类结构
  const allProducts = await fetchAllProducts(0);
  const categoryChains = [...new Set(
    allProducts
      .filter(p => p.categoryChainName)
      .map(p => p.categoryChainName)
  )].sort();

  // 统计各品类的战略商品数量
  const statsResult = await appQuery<{
    category_path: string;
    count: number;
  }>(
    `SELECT category_path, COUNT(*) as count
     FROM strategic_products
     WHERE status IN ('pending', 'confirmed')
     GROUP BY category_path`
  );

  const statsMap = new Map<string, number>();
  statsResult.rows.forEach(row => {
    statsMap.set(row.category_path, parseInt(row.count as any) || 0);
  });

  // 构建品类树
  const treeMap = new Map<string, any>();

  categoryChains.forEach(catPath => {
    if (!catPath) return;

    const parts = catPath.split('/');
    let currentPath = '';

    parts.forEach((part, index) => {
      const level = index + 1;
      const prevPath = currentPath;
      currentPath = currentPath ? `${currentPath}/${part}` : part;

      if (!treeMap.has(currentPath)) {
        let count = 0;
        statsMap.forEach((cnt, p) => {
          if (p === currentPath || p.startsWith(currentPath + '/')) {
            count += cnt;
          }
        });

        const node = {
          key: currentPath,
          name: part,
          path: currentPath,
          level,
          count,
          children: [],
        };

        treeMap.set(currentPath, node);

        if (prevPath && treeMap.has(prevPath)) {
          treeMap.get(prevPath)!.children!.push(node);
        }
      }
    });
  });

  const rootNodes: any[] = [];
  treeMap.forEach((node: any) => {
    if (node.level === 1) {
      rootNodes.push(node);
    }
  });

  cache.set(cacheKey, rootNodes, CACHE_TTL.LOW_FREQUENCY);
  return rootNodes;
}

/**
 * 获取可选商品列表（通过 ERP API + 内存过滤/分页）
 */
export async function getProductsForSelection(params: GetProductsQueryParams) {
  const { categoryPath, keyword, page = 1, pageSize = 50 } = params;

  // 获取已存在的战略商品 goods_id
  const strategicResult = await appQuery<{ goods_id: string }>(
    `SELECT goods_id FROM strategic_products WHERE status IN ('pending', 'confirmed')`
  );
  const strategicGoodsIds = new Set(strategicResult.rows.map(r => r.goods_id));

  // 从 API 获取所有启用商品 + 库存
  const [allProducts, stockMap] = await Promise.all([
    fetchAllProducts(0),
    getStockSummaryMap(),
  ]);

  // 内存过滤
  let filtered = allProducts;
  if (categoryPath) {
    filtered = filtered.filter(p => p.categoryChainName?.startsWith(categoryPath));
  }
  if (keyword) {
    const kw = keyword.toLowerCase();
    filtered = filtered.filter(p => p.name.toLowerCase().includes(kw));
  }

  // 按名称排序
  filtered.sort((a, b) => a.name.localeCompare(b.name));

  // 分页
  const total = filtered.length;
  const offset = (page - 1) * pageSize;
  const pageItems = filtered.slice(offset, offset + pageSize);

  // 构建返回结果
  const rows = pageItems.map(p => ({
    goods_id: String(p.goodsId),
    goods_name: p.name,
    category_path: p.categoryChainName,
    stock: stockMap.get(p.goodsId) ?? 0,
    pkg_unit_name: p.pkgUnitName,
    base_unit_name: p.baseUnitName,
    unit_factor: p.unitFactor,
  }));

  return {
    rows,
    strategicGoodsIds,
    total,
    page,
    pageSize,
    totalPages: Math.ceil(total / pageSize),
  };
}

/**
 * 根据商品ID判断是否为战略商品
 */
export async function isStrategicProduct(goodsId: string): Promise<boolean> {
  const result = await appQuery(
    `SELECT 1 FROM strategic_products
     WHERE goods_id = $1 AND status = 'confirmed' AND confirmed_at IS NOT NULL`,
    [goodsId]
  );
  return result.rows.length > 0;
}

/**
 * 批量获取商品的战略等级
 */
export async function getStrategicLevels(goodsIds: string[]): Promise<Map<string, 'strategic' | 'normal'>> {
  const result = await appQuery<{ goods_id: string }>(
    `SELECT goods_id FROM strategic_products
     WHERE goods_id = ANY($1) AND status = 'confirmed' AND confirmed_at IS NOT NULL`,
    [goodsIds]
  );

  const strategicSet = new Set(result.rows.map(r => r.goods_id));
  const resultMap = new Map<string, 'strategic' | 'normal'>();
  goodsIds.forEach(id => {
    resultMap.set(id, strategicSet.has(id) ? 'strategic' : 'normal');
  });
  return resultMap;
}

// ==================== 写入操作 ====================

/**
 * 批量添加战略商品
 */
export async function addProducts(
  goodsIds: string[],
  userId: number
): Promise<{ addedCount: number; skippedCount: number }> {
  if (!goodsIds || goodsIds.length === 0) {
    return { addedCount: 0, skippedCount: 0 };
  }

  // 从 API 获取商品信息
  const allProducts = await fetchAllProducts(0);
  const goodsIdSet = new Set(goodsIds.map(id => Number(id)));
  const matchedProducts = allProducts
    .filter(p => goodsIdSet.has(p.goodsId))
    .map(p => ({
      goodsId: String(p.goodsId),
      goodsName: p.name,
      categoryChainName: p.categoryChainName,
    }));

  if (matchedProducts.length === 0) {
    return { addedCount: 0, skippedCount: goodsIds.length };
  }

  // 批量插入（带 ON CONFLICT 处理）
  const values = matchedProducts.map((g, i) =>
    `($${i * 4 + 1}, $${i * 4 + 2}, $${i * 4 + 3}, $${i * 4 + 4})`
  ).join(', ');

  const insertParams = matchedProducts.flatMap(g => [
    g.goodsId,
    g.goodsName,
    g.categoryChainName || '',
    userId
  ]);

  const insertResult = await appQuery(
    `INSERT INTO strategic_products (goods_id, goods_name, category_path, created_by)
     VALUES ${values}
     ON CONFLICT (goods_id) DO NOTHING`,
    insertParams
  );

  const addedCount = insertResult.rowCount ?? 0;
  const skippedCount = goodsIds.length - matchedProducts.length + (matchedProducts.length - addedCount);

  return { addedCount, skippedCount };
}

/**
 * 删除战略商品
 */
export async function deleteProduct(id: number): Promise<boolean> {
  const result = await appQuery(
    'DELETE FROM strategic_products WHERE id = $1',
    [id]
  );
  return (result.rowCount ?? 0) > 0;
}

/**
 * 确认战略商品（按角色更新对应字段）
 */
export async function confirmProduct(
  id: number,
  action: 'confirm' | 'reject',
  userId: number,
  userRoles: string[],
  userName: string
): Promise<any | null> {
  // 查询当前记录
  const currentResult = await appQuery(
    'SELECT * FROM strategic_products WHERE id = $1',
    [id]
  );

  if (currentResult.rows.length === 0) return null;

  const isConfirm = action === 'confirm';
  const isAdmin = userRoles.includes('admin');
  const isProcurementManager = userRoles.includes('procurement_manager');
  const isMarketingManager = userRoles.includes('marketing_manager');

  const updateFields: string[] = [];
  const updateParams: any[] = [];
  let paramIndex = 1;

  if (isProcurementManager || isAdmin) {
    updateFields.push(`procurement_confirmed = $${paramIndex++}`);
    updateParams.push(isConfirm);
    updateFields.push(`procurement_confirmed_by = $${paramIndex++}`);
    updateParams.push(userId);
    updateFields.push(`procurement_confirmed_at = $${paramIndex++}`);
    updateParams.push(isConfirm ? new Date() : null);
  }

  if (isMarketingManager || isAdmin) {
    updateFields.push(`marketing_confirmed = $${paramIndex++}`);
    updateParams.push(isConfirm);
    updateFields.push(`marketing_confirmed_by = $${paramIndex++}`);
    updateParams.push(userId);
    updateFields.push(`marketing_confirmed_at = $${paramIndex++}`);
    updateParams.push(isConfirm ? new Date() : null);
  }

  if (updateFields.length === 0) return null;

  if (action === 'reject') {
    updateFields.push(`status = 'rejected'`);
  }

  updateParams.push(id);
  await appQuery(
    `UPDATE strategic_products SET ${updateFields.join(', ')} WHERE id = $${paramIndex}`,
    updateParams
  );

  // 检查是否双方都已确认（由 service 层的 utils 处理）

  // 返回更新后的记录
  const result = await appQuery(
    `SELECT *, $1 as procurement_confirmer_name, $2 as marketing_confirmer_name
     FROM strategic_products WHERE id = $3`,
    [userName, userName, id]
  );

  return result.rows.length > 0 ? result.rows[0] : null;
}

/**
 * 批量确认战略商品
 */
export async function batchConfirmProducts(
  params: any
): Promise<{ successCount: number; failedCount: number }> {
  const { ids, action, userId, userRoles, userName, selectAll, status, categoryPath, keyword } = params;

  let whereClause = "status = 'pending'";
  const queryParams: any[] = [];
  let paramIndex = 1;

  if (selectAll) {
    if (status) {
      whereClause = `status = $${paramIndex++}`;
      queryParams.push(status);
    }
    if (categoryPath) {
      whereClause += ` AND category_path LIKE $${paramIndex++}`;
      queryParams.push(`${categoryPath}%`);
    }
    if (keyword) {
      whereClause += ` AND (goods_name ILIKE $${paramIndex++} OR goods_id ILIKE $${paramIndex++})`;
      queryParams.push(`%${escapeLikePattern(keyword)}%`, `%${escapeLikePattern(keyword)}%`);
    }
  } else {
    if (!ids || ids.length === 0) {
      return { successCount: 0, failedCount: 0 };
    }
    whereClause += ` AND id = ANY($${paramIndex++})`;
    queryParams.push(ids);
  }

  const isConfirm = action === 'confirm';
  const isAdmin = userRoles.includes('admin');
  const isProcurementManager = userRoles.includes('procurement_manager');
  const isMarketingManager = userRoles.includes('marketing_manager');

  const updateFields: string[] = [];
  const now = new Date();

  if (isProcurementManager || isAdmin) {
    updateFields.push(`procurement_confirmed = ${isConfirm}`);
    updateFields.push(`procurement_confirmed_by = ${userId}`);
    updateFields.push(`procurement_confirmed_at = ${isConfirm ? `'${now.toISOString()}'` : 'NULL'}`);
  }

  if (isMarketingManager || isAdmin) {
    updateFields.push(`marketing_confirmed = ${isConfirm}`);
    updateFields.push(`marketing_confirmed_by = ${userId}`);
    updateFields.push(`marketing_confirmed_at = ${isConfirm ? `'${now.toISOString()}'` : 'NULL'}`);
  }

  if (updateFields.length === 0) {
    const countResult = await appQuery<{ count: string }>(
      `SELECT COUNT(*) as count FROM strategic_products WHERE ${whereClause}`,
      queryParams
    );
    const total = parseInt(countResult.rows[0]?.count || '0');
    return { successCount: 0, failedCount: total };
  }

  if (action === 'reject') {
    updateFields.push(`status = 'rejected'`);
  }

  const result = await appQuery(
    `UPDATE strategic_products
     SET ${updateFields.join(', ')}, updated_at = NOW()
     WHERE ${whereClause}`,
    queryParams
  );

  const successCount = result.rowCount ?? 0;

  // 确认操作时，更新最终确认状态
  if (action === 'confirm') {
    let confirmWhere = "procurement_confirmed = TRUE AND marketing_confirmed = TRUE AND status = 'pending'";
    const confirmParams: any[] = [];
    let confirmParamIndex = 1;

    if (selectAll) {
      if (status) {
        confirmWhere += ` AND status = $${confirmParamIndex++}`;
        confirmParams.push(status);
      }
      if (categoryPath) {
        confirmWhere += ` AND category_path LIKE $${confirmParamIndex++}`;
        confirmParams.push(`${categoryPath}%`);
      }
      if (keyword) {
        confirmWhere += ` AND (goods_name ILIKE $${confirmParamIndex++} OR goods_id ILIKE $${confirmParamIndex++})`;
        confirmParams.push(`%${escapeLikePattern(keyword)}%`, `%${escapeLikePattern(keyword)}%`);
      }
    } else if (ids && ids.length > 0) {
      confirmWhere += ` AND id = ANY($${confirmParamIndex++})`;
      confirmParams.push(ids);
    }

    await appQuery(
      `UPDATE strategic_products
       SET status = 'confirmed', confirmed_at = NOW()
       WHERE ${confirmWhere}`,
      confirmParams
    );
  }

  return { successCount, failedCount: 0 };
}

/**
 * 批量删除战略商品
 */
export async function batchDeleteProducts(params: any): Promise<{ deletedCount: number }> {
  const { ids, selectAll, status, categoryPath, keyword } = params;

  let whereClause = '1=1';
  const queryParams: any[] = [];
  let paramIndex = 1;

  if (selectAll) {
    if (status) {
      whereClause += ` AND status = $${paramIndex++}`;
      queryParams.push(status);
    }
    if (categoryPath) {
      whereClause += ` AND category_path LIKE $${paramIndex++}`;
      queryParams.push(`${categoryPath}%`);
    }
    if (keyword) {
      whereClause += ` AND (goods_name ILIKE $${paramIndex++} OR goods_id ILIKE $${paramIndex++})`;
      queryParams.push(`%${escapeLikePattern(keyword)}%`, `%${escapeLikePattern(keyword)}%`);
    }
  } else {
    if (!ids || ids.length === 0) {
      return { deletedCount: 0 };
    }
    whereClause += ` AND id = ANY($${paramIndex++})`;
    queryParams.push(ids);
  }

  const result = await appQuery(
    `DELETE FROM strategic_products WHERE ${whereClause}`,
    queryParams
  );

  return { deletedCount: result.rowCount ?? 0 };
}

/**
 * 同步战略商品品类路径
 */
export async function syncCategoryPath(): Promise<{ updatedCount: number; totalCount: number }> {
  const strategicResult = await appQuery<{ id: number; goods_id: string }>(
    'SELECT id, goods_id FROM strategic_products'
  );

  const totalCount = strategicResult.rows.length;
  if (totalCount === 0) {
    return { updatedCount: 0, totalCount: 0 };
  }

  const goodsIds = strategicResult.rows.map(r => r.goods_id);

  // 从 API 获取商品品类信息
  const allProducts = await fetchAllProducts(0);
  const productMap = new Map(allProducts.map(p => [String(p.goodsId), p]));

  const categoryMap = new Map<string, string>();
  goodsIds.forEach(id => {
    const product = productMap.get(id);
    if (product) {
      categoryMap.set(id, product.categoryChainName || '');
    }
  });

  let updatedCount = 0;
  for (const row of strategicResult.rows) {
    const newCategoryPath = categoryMap.get(row.goods_id);
    if (newCategoryPath !== undefined) {
      await appQuery(
        'UPDATE strategic_products SET category_path = $1, updated_at = NOW() WHERE id = $2',
        [newCategoryPath, row.id]
      );
      updatedCount++;
    }
  }

  return { updatedCount, totalCount };
}

// ==================== 缓存失效 ====================

/**
 * 失效战略商品相关的所有缓存
 * 写入操作（UPDATE/INSERT/DELETE）后调用
 */
export function invalidateProductCache(): void {
  cache.invalidate(`${CACHE_PREFIX}:list:`);
  cache.invalidate(`${CACHE_PREFIX}:stats`);
  cache.invalidate(`${CACHE_PREFIX}:category_tree`);
}
