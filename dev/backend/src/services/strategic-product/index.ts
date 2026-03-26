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
} from './strategic-product-mutation';

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
