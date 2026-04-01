/**
 * 战略商品查询服务
 */

import { query } from '../../db/pool';
import { appQuery } from '../../db/appPool';
import type {
  StrategicProduct,
  StrategicProductStatus,
  StrategicProductQueryParams,
  StrategicProductStats,
  StrategicProductListResult,
  CategoryTreeNode,
  ProductForSelection,
  ProductSelectionResult,
  GetProductsQueryParams,
} from './strategic-product.types';

/**
 * 获取战略商品列表
 */
export async function getStrategicProducts(
  params: StrategicProductQueryParams
): Promise<StrategicProductListResult> {
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

  // 查询总数
  const countResult = await appQuery<{ total: number }>(
    `SELECT COUNT(*) as total FROM strategic_products sp WHERE ${whereClause}`,
    queryParams
  );
  const total = parseInt(countResult.rows[0]?.total as any) || 0;

  // 查询列表
  const listParams = [...queryParams, pageSize, offset];
  const result = await appQuery<{
    id: number;
    goods_id: string;
    goods_name: string;
    category_path: string;
    status: StrategicProductStatus;
    created_by: number | null;
    created_at: Date;
    updated_at: Date;
    procurement_confirmed: boolean;
    procurement_confirmed_by: number | null;
    procurement_confirmed_at: Date | null;
    procurement_confirmer_name: string | null;
    marketing_confirmed: boolean;
    marketing_confirmed_by: number | null;
    marketing_confirmed_at: Date | null;
    marketing_confirmer_name: string | null;
    confirmed_at: Date | null;
  }>(
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

  const data: StrategicProduct[] = result.rows.map(row => ({
    id: row.id,
    goodsId: row.goods_id,
    goodsName: row.goods_name,
    categoryPath: row.category_path,
    status: row.status,
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    procurementConfirmed: row.procurement_confirmed,
    procurementConfirmedBy: row.procurement_confirmed_by,
    procurementConfirmedAt: row.procurement_confirmed_at,
    procurementConfirmerName: row.procurement_confirmer_name || undefined,
    marketingConfirmed: row.marketing_confirmed,
    marketingConfirmedBy: row.marketing_confirmed_by,
    marketingConfirmedAt: row.marketing_confirmed_at,
    marketingConfirmerName: row.marketing_confirmer_name || undefined,
    confirmedAt: row.confirmed_at,
  }));

  return {
    data,
    total,
    page,
    pageSize,
    totalPages: Math.ceil(total / pageSize),
  };
}

/**
 * 获取战略商品统计数据
 */
export async function getStrategicProductStats(): Promise<StrategicProductStats> {
  const result = await appQuery<{
    pending: number;
    confirmed: number;
    rejected: number;
    total: number;
  }>(
    `SELECT 
      COUNT(*) as total,
      COUNT(CASE WHEN status = 'pending' THEN 1 END) as pending,
      COUNT(CASE WHEN status = 'confirmed' THEN 1 END) as confirmed,
      COUNT(CASE WHEN status = 'rejected' THEN 1 END) as rejected
    FROM strategic_products`
  );

  const row = result.rows[0];
  return {
    pending: parseInt(row?.pending as any) || 0,
    confirmed: parseInt(row?.confirmed as any) || 0,
    rejected: parseInt(row?.rejected as any) || 0,
    total: parseInt(row?.total as any) || 0,
  };
}

/**
 * 获取品类树（带战略商品统计）
 */
export async function getCategoryTree(): Promise<CategoryTreeNode[]> {
  // 从商品档案获取品类结构
  const result = await query<{
    category_chain: string;
  }>(
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
  const treeMap = new Map<string, CategoryTreeNode>();

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
        // 计算该节点的战略商品数量
        let count = 0;
        statsMap.forEach((cnt, p) => {
          if (p === currentPath || p.startsWith(currentPath + '/')) {
            count += cnt;
          }
        });

        const node: CategoryTreeNode = {
          key: currentPath,
          name: part,
          path: currentPath,
          level,
          count,
          children: [],
        };

        treeMap.set(currentPath, node);

        // 添加到父节点
        if (prevPath && treeMap.has(prevPath)) {
          treeMap.get(prevPath)!.children!.push(node);
        }
      }
    });
  });

  // 返回一级品类
  const rootNodes: CategoryTreeNode[] = [];
  treeMap.forEach(node => {
    if (node.level === 1) {
      rootNodes.push(node);
    }
  });

  // 调试：打印一级品类
  console.log('[CategoryTree] 一级品类数量:', rootNodes.length);
  console.log('[CategoryTree] 一级品类列表:', rootNodes.map(n => n.name).sort().join(', '));
  console.log('[CategoryTree] 前5个一级品类详情:', JSON.stringify(rootNodes.slice(0, 5).map(n => ({ name: n.name, key: n.key, count: n.count }))));
  console.log('[CategoryTree] ERP原始数据前5条:', JSON.stringify(result.rows.slice(0, 5)));

  return rootNodes;
}

/**
 * 获取可选商品列表
 */
export async function getProductsForSelection(
  params: GetProductsQueryParams
): Promise<ProductSelectionResult> {
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

  // 先从 xly_dashboard 获取已存在的战略商品 goods_id
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
  const result = await query<{
    goods_id: string;
    goods_name: string;
    category_path: string;
    stock: number;
    pkg_unit_name: string | null;
    base_unit_name: string | null;
    unit_factor: number | null;
  }>(
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

  const data: ProductForSelection[] = result.rows.map(row => {
    // 生成规格字符串（单位换算关系）
    let specification = '';
    const pkgUnit = row.pkg_unit_name;
    const baseUnit = row.base_unit_name;
    const unitFactor = row.unit_factor;
    
    if (pkgUnit && baseUnit && pkgUnit !== baseUnit && unitFactor && unitFactor > 1) {
      specification = `1${pkgUnit}=${unitFactor}${baseUnit}`;
    } else if (pkgUnit) {
      specification = pkgUnit;
    }

    return {
      goodsId: row.goods_id,
      goodsName: row.goods_name,
      specification,
      categoryPath: row.category_path || '',
      stock: parseFloat(row.stock as any) || 0,
      isStrategic: strategicGoodsIds.has(row.goods_id),
    };
  });

  return {
    data,
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
export async function getStrategicLevels(
  goodsIds: string[]
): Promise<Map<string, 'strategic' | 'normal'>> {
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
