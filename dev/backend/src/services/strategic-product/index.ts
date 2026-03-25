/**
 * 战略商品管理模块入口
 */

export {
  getStrategicProducts,
  getStrategicProductStats,
  addStrategicProducts,
  deleteStrategicProduct,
  confirmStrategicProduct,
  getCategoryTree,
  getProductsForSelection,
  isStrategicProduct,
  getStrategicLevels,
} from './strategic-product.service';

export type {
  StrategicProduct,
  StrategicProductStatus,
  StrategicProductQueryParams,
  StrategicProductStats,
  StrategicProductListResult,
  AddStrategicProductsParams,
  ConfirmStrategicProductParams,
  CategoryTreeNode,
  ProductForSelection,
  ProductSelectionResult,
  GetProductsQueryParams,
} from './strategic-product.types';
