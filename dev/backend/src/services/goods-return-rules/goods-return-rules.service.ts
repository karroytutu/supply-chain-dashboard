/**
 * 商品退货规则服务
 */

import { appQuery } from '../../db/appPool';
import { escapeLikePattern } from '../../utils/sqlHelpers';
import type {
  GoodsReturnRule,
  GoodsReturnRuleQueryParams,
  GoodsReturnRuleListResult,
  GoodsReturnRuleStats,
  CreateGoodsReturnRuleParams,
  UpdateGoodsReturnRuleParams,
  BatchSetRulesParams,
  BatchSetRulesResult,
} from './goods-return-rules.types';
import { toGoodsReturnRuleDTO, type GoodsReturnRuleRow } from './goods-return-rules.mapper';

/**
 * 获取商品退货规则列表
 */
export async function getGoodsReturnRules(
  params: GoodsReturnRuleQueryParams
): Promise<GoodsReturnRuleListResult> {
  const { page = 1, pageSize = 20, keyword, canReturnToSupplier } = params;
  const offset = (page - 1) * pageSize;
  const conditions: string[] = ['grr.is_active = TRUE'];
  const queryParams: any[] = [];
  let paramIndex = 1;

  if (canReturnToSupplier !== undefined) {
    conditions.push(`grr.can_return_to_supplier = $${paramIndex++}`);
    queryParams.push(canReturnToSupplier);
  }
  if (keyword) {
    conditions.push(`(grr.goods_name ILIKE $${paramIndex++} OR grr.goods_id ILIKE $${paramIndex++})`);
    queryParams.push(`%${escapeLikePattern(keyword)}%`, `%${escapeLikePattern(keyword)}%`);
  }

  const whereClause = conditions.join(' AND ');

  // 查询总数
  const countResult = await appQuery<{ total: number }>(
    `SELECT COUNT(*) as total FROM goods_return_rules grr WHERE ${whereClause}`,
    queryParams
  );
  const total = parseInt(countResult.rows[0]?.total as any) || 0;

  // 查询列表
  const listParams = [...queryParams, pageSize, offset];
  const result = await appQuery<GoodsReturnRuleRow>(
    `SELECT 
      grr.*,
      u.name as confirmed_by_name
    FROM goods_return_rules grr
    LEFT JOIN users u ON grr.confirmed_by = u.id
    WHERE ${whereClause}
    ORDER BY grr.updated_at DESC
    LIMIT $${paramIndex++} OFFSET $${paramIndex++}`,
    listParams
  );

  const data: GoodsReturnRule[] = result.rows.map(toGoodsReturnRuleDTO);

  return {
    data,
    total,
    page,
    pageSize,
    totalPages: Math.ceil(total / pageSize),
  };
}

/**
 * 获取商品退货规则统计数据
 */
export async function getGoodsReturnRuleStats(): Promise<GoodsReturnRuleStats> {
  const result = await appQuery<any>(
    `SELECT 
      COUNT(*) as total,
      COUNT(CASE WHEN can_return_to_supplier = TRUE THEN 1 END) as can_return,
      COUNT(CASE WHEN can_return_to_supplier = FALSE THEN 1 END) as cannot_return
    FROM goods_return_rules
    WHERE is_active = TRUE`
  );

  const row = result.rows[0];
  return {
    canReturn: parseInt(row?.can_return as any) || 0,
    cannotReturn: parseInt(row?.cannot_return as any) || 0,
    total: parseInt(row?.total as any) || 0,
  };
}

/**
 * 创建商品退货规则
 */
export async function createGoodsReturnRule(
  params: CreateGoodsReturnRuleParams
): Promise<GoodsReturnRule> {
  const { goodsId, goodsName, canReturnToSupplier, comment, userId } = params;

  // 先将该商品的所有旧规则设为失效
  await appQuery(
    `UPDATE goods_return_rules 
     SET is_active = FALSE, updated_at = NOW()
     WHERE goods_id = $1 AND is_active = TRUE`,
    [goodsId]
  );

  // 创建新规则
  const result = await appQuery<GoodsReturnRuleRow>(
    `INSERT INTO goods_return_rules 
     (goods_id, goods_name, can_return_to_supplier, confirmed_by, confirmed_at, comment, is_active)
     VALUES ($1, $2, $3, $4, NOW(), $5, TRUE)
     RETURNING *`,
    [goodsId, goodsName, canReturnToSupplier, userId, comment || null]
  );

  return toGoodsReturnRuleDTO(result.rows[0]);
}

/**
 * 更新商品退货规则
 */
export async function updateGoodsReturnRule(
  id: number,
  params: UpdateGoodsReturnRuleParams
): Promise<GoodsReturnRule | null> {
  const { canReturnToSupplier, comment, userId } = params;

  // 查询当前记录
  const currentResult = await appQuery<{ goods_id: string }>(
    'SELECT goods_id FROM goods_return_rules WHERE id = $1 AND is_active = TRUE',
    [id]
  );

  if (currentResult.rows.length === 0) {
    return null;
  }

  const goodsId = currentResult.rows[0].goods_id;

  // 先将该商品的所有旧规则设为失效
  await appQuery(
    `UPDATE goods_return_rules 
     SET is_active = FALSE, updated_at = NOW()
     WHERE goods_id = $1 AND is_active = TRUE`,
    [goodsId]
  );

  // 创建新规则（保留原商品信息）
  const result = await appQuery<GoodsReturnRuleRow>(
    `INSERT INTO goods_return_rules 
     (goods_id, goods_name, can_return_to_supplier, confirmed_by, confirmed_at, comment, is_active)
     SELECT goods_id, goods_name, $1, $2, NOW(), $3, TRUE
     FROM goods_return_rules WHERE id = $4
     RETURNING *`,
    [canReturnToSupplier, userId, comment || null, id]
  );

  return toGoodsReturnRuleDTO(result.rows[0]);
}

/**
 * 批量设置商品退货规则
 */
export async function batchSetGoodsReturnRules(
  params: BatchSetRulesParams
): Promise<BatchSetRulesResult> {
  const { goodsIds, canReturnToSupplier, comment, userId } = params;

  if (!goodsIds || goodsIds.length === 0) {
    return { successCount: 0, failedCount: 0 };
  }

  // 先将这些商品的所有旧规则设为失效
  await appQuery(
    `UPDATE goods_return_rules 
     SET is_active = FALSE, updated_at = NOW()
     WHERE goods_id = ANY($1) AND is_active = TRUE`,
    [goodsIds]
  );

  // 批量插入新规则
  // 先构建参数数组，确保参数数量与占位符数量一致
  const insertParams: any[] = [];
  goodsIds.forEach(goodsId => {
    insertParams.push(goodsId, '', canReturnToSupplier, userId);
  });
  // comment 参数在所有商品参数之后
  const commentParamIndex = insertParams.length + 1;
  insertParams.push(comment || null);

  const values = goodsIds.map((_, i) => 
    `($${i * 4 + 1}, $${i * 4 + 2}, $${i * 4 + 3}, $${i * 4 + 4}, NOW(), $${commentParamIndex}, TRUE)`
  ).join(', ');

  const result = await appQuery(
    `INSERT INTO goods_return_rules 
     (goods_id, goods_name, can_return_to_supplier, confirmed_by, confirmed_at, comment, is_active)
     VALUES ${values}
     ON CONFLICT (goods_id, is_active) DO UPDATE SET
       can_return_to_supplier = EXCLUDED.can_return_to_supplier,
       confirmed_by = EXCLUDED.confirmed_by,
       confirmed_at = EXCLUDED.confirmed_at,
       comment = EXCLUDED.comment,
       updated_at = NOW()`,
    insertParams
  );

  const successCount = result.rowCount ?? 0;
  const failedCount = goodsIds.length - successCount;

  return { successCount, failedCount };
}

/**
 * 按商品ID检查是否有生效规则
 */
export async function checkGoodsReturnRule(
  goodsId: string
): Promise<GoodsReturnRule | null> {
  const result = await appQuery<GoodsReturnRuleRow>(
    `SELECT * FROM goods_return_rules 
     WHERE goods_id = $1 AND is_active = TRUE
     ORDER BY created_at DESC
     LIMIT 1`,
    [goodsId]
  );

  if (result.rows.length === 0) {
    return null;
  }

  return toGoodsReturnRuleDTO(result.rows[0]);
}
