/**
 * ERP 商品相关类型定义
 * @module services/erp-client/erp-product.types
 */

/** API 返回的商品记录 */
export interface ErpProduct {
  goodsId: number;
  id: number;
  name: string;
  categoryChainName: string;
  shelfLife: number;
  state: number;
  baseUnitName: string;
  pkgUnitName: string;
  unitFactor: number;
  midUnitName?: string | null;
  midUnitFactor?: number | null;
  brandName?: string;
  brandId?: number;
  specifications?: string;
  articleNumber?: string;
  warnDays?: number;
  /** 基本单位批发价 */
  baseWholesale?: number | null;
  /** 中单位批发价 */
  midWholesale?: number | null;
  /** 包装单位批发价 */
  pkgWholesale?: number | null;
}

/** 促销商品搜索结果 */
export interface PromotionGoodsItem {
  goodsId: number;
  name: string;
  /** 基本单位名称（如"瓶"、"包"） */
  baseUnitName: string;
  /** 包装单位名称（如"箱"、"件"） */
  pkgUnitName: string;
  /** 包装换算系数（1箱=24瓶） */
  unitFactor: number;
  /** 中单位名称（如"盒"、"组"），可能为空 */
  midUnitName?: string | null;
  /** 中单位换算系数（1盒=20包），可能为空 */
  midUnitFactor?: number | null;
  /** 可用单位列表（含换算系数） */
  units: Array<{ id: string; name: string; factor: number }>;
  /** 成本价（基本单位） */
  costPrice: number;
  /** 保质期天数 */
  shelfLife: number;
  /** 预警天数 */
  warnDays?: number;
  /** 品牌 */
  brandName?: string;
  /** 品牌ID */
  brandId?: number;
  /** 分类 */
  categoryChainName?: string;
  /** 基本单位批发价 */
  baseWholesale?: number | null;
  /** 中单位批发价 */
  midWholesale?: number | null;
  /** 包装单位批发价 */
  pkgWholesale?: number | null;
}
