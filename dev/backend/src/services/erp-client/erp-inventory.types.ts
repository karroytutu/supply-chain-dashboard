/**
 * ERP 库存相关类型定义
 * @module services/erp-client/erp-inventory.types
 */

/** API 返回的库存记录 */
export interface ErpInventoryRecord {
  goodsId: number;
  goodsName: string;
  availableBaseQuantity: number;
  baseCostPrice: string;
  warehouseId: number;
  warehouseName: string;
  typeChainName: string;
  qualityType: string;
  physicalBaseQuantity: number;
  lockedBaseQuantity: number;
  availablePkgQuantity: number;
  pkgCostPrice: string;
  baseUnitName: string;
  brandName?: string;
}
