/**
 * 数据总览模块类型定义
 */

/** 时间周期 */
export interface Period {
  current: string;
  type: 'month';
}

/** 全局统计数据 */
export interface OverviewStats {
  /** 总 SKU 数 */
  totalSku: number;
  /** 战略商品数量 */
  strategicProductCount: number;
  /** 预警商品数量 */
  warningProductCount: number;
  /** 临期商品数量 */
  expiringProductCount: number;
  /** 临期商品金额 */
  expiringCost: number;
  /** 滞销商品金额 */
  slowMovingCost: number;
  /** 库存周转天数 */
  turnoverDays: number;
  /** 战略商品齐全率 */
  availabilityRate: number;
  /** 时间周期 */
  period: Period;
}

/** 趋势数据点 */
export interface TrendPoint {
  /** 日期 YYYY-MM-DD */
  date: string;
  /** 齐全率 */
  availabilityRate: number;
  /** 预警商品数量 */
  warningCount: number;
}

/** 趋势数据 */
export interface TrendData {
  /** 趋势数据点列表 */
  data: TrendPoint[];
  /** 时间周期 */
  period: string;
}
