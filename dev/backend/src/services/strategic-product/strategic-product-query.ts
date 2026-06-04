/**
 * 战略商品查询服务
 * 薄包装层，委托给 Repository 执行数据访问
 */

import * as repo from './strategic-product.repository';
import {
  toStrategicProductDTO,
  toStrategicProductStatsDTO,
  toProductForSelectionDTO,
} from './strategic-product.mapper';
import type {
  StrategicProduct,
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
  const result = await repo.getProducts(params);
  return {
    ...result,
    data: result.data.map(toStrategicProductDTO),
  };
}

/**
 * 获取战略商品统计数据
 */
export async function getStrategicProductStats(): Promise<StrategicProductStats> {
  const row = await repo.getStats();
  return toStrategicProductStatsDTO(row);
}

/**
 * 获取品类树（带战略商品统计）
 */
export async function getCategoryTree(): Promise<CategoryTreeNode[]> {
  return repo.getCategoryTree();
}

/**
 * 获取可选商品列表
 */
export async function getProductsForSelection(
  params: GetProductsQueryParams
): Promise<ProductSelectionResult> {
  const result = await repo.getProductsForSelection(params);
  const data: ProductForSelection[] = result.rows.map((row: any) =>
    toProductForSelectionDTO(row, result.strategicGoodsIds)
  );

  return {
    data,
    total: result.total,
    page: result.page,
    pageSize: result.pageSize,
    totalPages: result.totalPages,
  };
}

/**
 * 根据商品ID判断是否为战略商品
 */
export async function isStrategicProduct(goodsId: string): Promise<boolean> {
  return repo.isStrategicProduct(goodsId);
}

/**
 * 批量获取商品的战略等级
 */
export async function getStrategicLevels(
  goodsIds: string[]
): Promise<Map<string, 'strategic' | 'normal'>> {
  return repo.getStrategicLevels(goodsIds);
}
