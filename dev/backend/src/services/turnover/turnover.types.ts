/**
 * 周转天数服务模块类型定义
 */

/** 趋势方向 */
export type TrendDirection = 'up' | 'down' | 'flat';

/** 健康状态 */
export type HealthStatus = 'excellent' | 'good' | 'attention' | 'warning';

/** 品类指标 */
export interface CategoryMetric {
  categoryId: string;
  categoryName: string;
  value: number;
  trend: number;
  trendDirection: TrendDirection;
  productCount: number;
}

/** 周转预警统计 */
export interface TurnoverWarningStats {
  mildOverstock: number;     // 轻度积压 >60天
  moderateOverstock: number; // 中度积压 >90天
  seriousOverstock: number;  // 严重积压 >120天
}

/** 周转数据 */
export interface TurnoverData {
  value: number;
  unit: 'day';
  trend: number;
  trendDirection: TrendDirection;
  healthStatus: HealthStatus;
  categories: CategoryMetric[];
  warningStats: TurnoverWarningStats;
  previousValue?: number;
  period?: {
    current: string;
    previous: string;
  };
}
