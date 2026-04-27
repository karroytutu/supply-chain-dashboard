/**
 * 战略商品管理模块入口
 */

// 查询服务
export {
  getStrategicProducts,
  getStrategicProductStats,
  getCategoryTree,
  getProductsForSelection,
  isStrategicProduct,
  getStrategicLevels,
} from './strategic-product-query';

// 变更服务
export {
  addStrategicProducts,
  deleteStrategicProduct,
  confirmStrategicProduct,
  batchConfirmStrategicProducts,
  batchDeleteStrategicProducts,
  syncCategoryPath,
} from './strategic-product-mutation';

// DTO 映射器
export {
  toStrategicProductDTO,
  toStrategicProductStatsDTO,
  toProductForSelectionDTO,
} from './strategic-product.mapper';

// 数据访问层
export { invalidateProductCache } from './strategic-product.repository';

// 类型定义
export type {
  StrategicProduct,
  StrategicProductStatus,
  StrategicProductQueryParams,
  StrategicProductStats,
  StrategicProductListResult,
  AddStrategicProductsParams,
  ConfirmStrategicProductParams,
  BatchConfirmStrategicProductsParams,
  BatchConfirmResult,
  BatchDeleteStrategicProductsParams,
  BatchDeleteResult,
  CategoryTreeNode,
  ProductForSelection,
  ProductSelectionResult,
  GetProductsQueryParams,
} from './strategic-product.types';
