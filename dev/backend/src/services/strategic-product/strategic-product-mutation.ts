/**
 * 战略商品变更服务
 */

import { query } from '../../db/pool';
import { appQuery } from '../../db/appPool';
import type {
  StrategicProduct,
  StrategicProductStatus,
  AddStrategicProductsParams,
  ConfirmStrategicProductParams,
  BatchConfirmStrategicProductsParams,
  BatchConfirmResult,
  BatchDeleteStrategicProductsParams,
  BatchDeleteResult,
} from './strategic-product.types';
import { checkAndUpdateConfirmedStatus } from './strategic-product-utils';

/**
 * 批量添加战略商品（优化：使用批量插入替代循环插入）
 */
export async function addStrategicProducts(
  params: AddStrategicProductsParams
): Promise<{ addedCount: number; skippedCount: number }> {
  const { goodsIds, userId } = params;
  
  if (!goodsIds || goodsIds.length === 0) {
    return { addedCount: 0, skippedCount: 0 };
  }

  console.log('添加战略商品，goodsIds:', goodsIds);

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

  console.log('查询到的商品数量:', goodsResult.rows.length);

  if (goodsResult.rows.length === 0) {
    return { addedCount: 0, skippedCount: goodsIds.length };
  }

  // 使用单次批量插入（带 ON CONFLICT 处理）
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
  // 计算跳过数量：未找到的商品 + 已存在的商品
  const skippedCount = goodsIds.length - goodsResult.rows.length + (goodsResult.rows.length - addedCount);

  console.log(`添加完成: 成功 ${addedCount}, 跳过 ${skippedCount}`);

  return { addedCount, skippedCount };
}

/**
 * 删除战略商品
 */
export async function deleteStrategicProduct(id: number): Promise<boolean> {
  const result = await appQuery(
    'DELETE FROM strategic_products WHERE id = $1',
    [id]
  );
  return (result.rowCount ?? 0) > 0;
}

/**
 * 确认战略商品
 */
export async function confirmStrategicProduct(
  params: ConfirmStrategicProductParams
): Promise<StrategicProduct | null> {
  const { id, action, userId, userRoles, userName } = params;
  
  // 查询当前记录
  const currentResult = await appQuery<StrategicProduct>(
    'SELECT * FROM strategic_products WHERE id = $1',
    [id]
  );
  
  if (currentResult.rows.length === 0) {
    return null;
  }

  const current = currentResult.rows[0];
  const isConfirm = action === 'confirm';
  
  // 根据角色更新对应字段
  const updateFields: string[] = [];
  const updateParams: any[] = [];
  let paramIndex = 1;

  // admin 角色可以同时确认采购和营销
  const isAdmin = userRoles.includes('admin');
  const isProcurementManager = userRoles.includes('procurement_manager');
  const isMarketingManager = userRoles.includes('marketing_manager');

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

  if (updateFields.length === 0) {
    return null;
  }

  // 添加状态更新逻辑
  if (action === 'reject') {
    updateFields.push(`status = 'rejected'`);
  }

  updateParams.push(id);
  await appQuery(
    `UPDATE strategic_products SET ${updateFields.join(', ')} WHERE id = $${paramIndex}`,
    updateParams
  );

  // 检查是否双方都已确认
  if (action === 'confirm') {
    await checkAndUpdateConfirmedStatus(id);
  }

  // 返回更新后的记录
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
    marketing_confirmed: boolean;
    marketing_confirmed_by: number | null;
    marketing_confirmed_at: Date | null;
    confirmed_at: Date | null;
  }>(
    `SELECT *, $1 as procurement_confirmer_name, $2 as marketing_confirmer_name 
     FROM strategic_products WHERE id = $3`,
    [userName, userName, id]
  );

  if (result.rows.length === 0) return null;
  
  const row = result.rows[0];
  return {
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
    procurementConfirmerName: userName,
    marketingConfirmed: row.marketing_confirmed,
    marketingConfirmedBy: row.marketing_confirmed_by,
    marketingConfirmedAt: row.marketing_confirmed_at,
    marketingConfirmerName: userName,
    confirmedAt: row.confirmed_at,
  };
}

/**
 * 批量确认战略商品
 */
export async function batchConfirmStrategicProducts(
  params: BatchConfirmStrategicProductsParams
): Promise<BatchConfirmResult> {
  const { ids, action, userId, userRoles, userName, selectAll, status, categoryPath, keyword } = params;

  // 构建 WHERE 条件
  let whereClause = "status = 'pending'";
  const queryParams: any[] = [];
  let paramIndex = 1;

  if (selectAll) {
    // 全选全部：使用筛选条件
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
    // 指定ID列表
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
    // 获取符合条件的总数用于计算失败数
    const countResult = await appQuery<{ count: string }>(
      `SELECT COUNT(*) as count FROM strategic_products WHERE ${whereClause}`,
      queryParams
    );
    const total = parseInt(countResult.rows[0]?.count || '0');
    return { successCount: 0, failedCount: total };
  }

  // 驳回时更新状态
  if (action === 'reject') {
    updateFields.push(`status = 'rejected'`);
  }

  // 执行批量更新
  const result = await appQuery(
    `UPDATE strategic_products
     SET ${updateFields.join(', ')}, updated_at = NOW()
     WHERE ${whereClause}`,
    queryParams
  );

  const successCount = result.rowCount ?? 0;

  // 确认操作时，检查并更新最终确认状态
  if (action === 'confirm') {
    // 重新构建 WHERE 条件用于更新已确认状态
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

  return {
    successCount,
    failedCount: 0
  };
}

/**
 * 批量删除战略商品
 */
export async function batchDeleteStrategicProducts(
  params: BatchDeleteStrategicProductsParams
): Promise<BatchDeleteResult> {
  const { ids, selectAll, status, categoryPath, keyword } = params;

  // 构建 WHERE 条件
  let whereClause = '1=1';
  const queryParams: any[] = [];
  let paramIndex = 1;

  if (selectAll) {
    // 全选全部：使用筛选条件
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
    // 指定ID列表
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

  return {
    deletedCount: result.rowCount ?? 0
  };
}
