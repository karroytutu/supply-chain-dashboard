/**
 * 战略商品 - 数据访问层 (Repository)
 * 收敛所有 SQL 查询和缓存逻辑，Service 层不再直接编写 SQL
 * 遵循规范：Controller → Service → Repository → DB
 */

import { query } from '../../db/pool';
import { appQuery } from '../../db/appPool';
import { cache, CACHE_TTL } from '../../utils/cache';
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
    queryParams.push(`%${keyword}%`);
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

  // 从商品档案获取品类结构
  const result = await query<{ category_chain: string }>(
    `SELECT DISTINCT "categoryChainName" as category_chain
     FROM "商品档案"
     WHERE "state" = 0 AND "categoryChainName" IS NOT NULL
     ORDER BY category_chain`
  );

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

  result.rows.forEach(row => {
    const path = row.category_chain;
    if (!path) return;

    const parts = path.split('/');
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
 * 获取可选商品列表
 */
export async function getProductsForSelection(params: GetProductsQueryParams) {
  const { categoryPath, keyword, page = 1, pageSize = 50 } = params;
  const offset = (page - 1) * pageSize;
  const conditions: string[] = ['g."state" = 0'];
  const queryParams: any[] = [];
  let paramIndex = 1;

  if (categoryPath) {
    conditions.push(`g."categoryChainName" LIKE $${paramIndex++}`);
    queryParams.push(`${categoryPath}%`);
  }
  if (keyword) {
    conditions.push(`g."name" ILIKE $${paramIndex++}`);
    queryParams.push(`%${keyword}%`);
  }

  const whereClause = conditions.join(' AND ');

  // 获取已存在的战略商品 goods_id
  const strategicResult = await appQuery<{ goods_id: string }>(
    `SELECT goods_id FROM strategic_products WHERE status IN ('pending', 'confirmed')`
  );
  const strategicGoodsIds = new Set(strategicResult.rows.map(r => r.goods_id));

  // 查询总数
  const countResult = await query<{ total: number }>(
    `SELECT COUNT(*) as total FROM "商品档案" g WHERE ${whereClause}`,
    queryParams
  );
  const total = parseInt(countResult.rows[0]?.total as any) || 0;

  // 查询商品列表
  const listParams = [...queryParams, pageSize, offset];
  const result = await query(
    `SELECT
      g."goodsId" as goods_id,
      g."name" as goods_name,
      g."categoryChainName" as category_path,
      COALESCE(s.total_stock, 0) as stock,
      g."pkgUnitName" as pkg_unit_name,
      g."baseUnitName" as base_unit_name,
      g."unitFactor" as unit_factor
    FROM "商品档案" g
    LEFT JOIN (
      SELECT "goodsId", SUM("availableBaseQuantity") as total_stock
      FROM "实时库存表"
      GROUP BY "goodsId"
    ) s ON g."goodsId" = s."goodsId"
    WHERE ${whereClause}
    ORDER BY g."name"
    LIMIT $${paramIndex++} OFFSET $${paramIndex++}`,
    listParams
  );

  return {
    rows: result.rows,
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

  // 获取商品信息
  const goodsResult = await query<{
    goodsId: string;
    goodsName: string;
    categoryChainName: string;
  }>(
    `SELECT "goodsId", "name" as "goodsName", "categoryChainName"
     FROM "商品档案"
     WHERE "goodsId" = ANY($1) AND "state" = 0`,
    [goodsIds]
  );

  if (goodsResult.rows.length === 0) {
    return { addedCount: 0, skippedCount: goodsIds.length };
  }

  // 批量插入（带 ON CONFLICT 处理）
  const values = goodsResult.rows.map((g, i) =>
    `($${i * 4 + 1}, $${i * 4 + 2}, $${i * 4 + 3}, $${i * 4 + 4})`
  ).join(', ');

  const insertParams = goodsResult.rows.flatMap(g => [
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
  const skippedCount = goodsIds.length - goodsResult.rows.length + (goodsResult.rows.length - addedCount);

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
      queryParams.push(`%${keyword}%`, `%${keyword}%`);
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
        confirmParams.push(`%${keyword}%`, `%${keyword}%`);
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
      queryParams.push(`%${keyword}%`, `%${keyword}%`);
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

  const goodsResult = await query<{
    goodsId: string;
    categoryChainName: string;
  }>(
    `SELECT "goodsId", "categoryChainName"
     FROM "商品档案"
     WHERE "goodsId" = ANY($1) AND "state" = 0`,
    [goodsIds]
  );

  const categoryMap = new Map<string, string>();
  goodsResult.rows.forEach(row => {
    categoryMap.set(row.goodsId, row.categoryChainName || '');
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
