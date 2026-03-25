// 趋势方向
export type TrendDirection = 'up' | 'down' | 'flat';

// 预警级别
export type WarningLevel = 'normal' | 'attention' | 'warning' | 'serious';

// 健康状态
export type HealthStatus = 'excellent' | 'good' | 'attention' | 'warning';

// 指标类型
export type MetricType = 'availability' | 'turnover' | 'expiring' | 'slowMoving';

// 趋势结果
export interface TrendResult {
  value: number;
  direction: TrendDirection;
  percentage: number;
}

// 品类指标
export interface CategoryMetric {
  categoryId: string;
  categoryName: string;
  value: number;
  trend: number;
  trendDirection: TrendDirection;
  productCount: number;
}

// 周转分布
export interface TurnoverDistribution {
  range: string;
  count: number;
  percentage: number;
}

// 临期分解
export interface ExpiringBreakdown {
  level: WarningLevel;
  label: string;
  count: number;
  percentage: number;
  color: string;
}

// 滞销分布
export interface SlowMovingDistribution {
  range: string;
  label?: string;  // 滞销级别标签：轻度滞销、中度滞销、严重滞销
  count: number;
  percentage: number;
}

// 滞销预警统计
export interface SlowMovingWarningStats {
  mildSlowMoving: number;      // 轻度滞销商品数（7-15天未销售）
  moderateSlowMoving: number;  // 中度滞销商品数（15-30天未销售）
  seriousSlowMoving: number;   // 严重滞销商品数（>30天未销售）
}

// 时间周期
export interface Period {
  current: string;
  previous: string;
  type: 'month' | 'quarter' | 'year';
}

// 库存预警统计
export interface StockWarningStats {
  outOfStock: number;        // 缺货商品数（可售天数<=0天）
  lowStock: number;          // 低库存商品数（可售天数<=15天且>0天）
}

// 预警类型
export type StockWarningType = 'outOfStock' | 'lowStock';

// 战略商品齐全率数据（瞬时值）
export interface StrategicAvailabilityData {
  value: number;
  totalStrategicSku: number;
  inStockStrategic: number;
}

// 每日齐全率
export interface DailyAvailabilityRate {
  date: string;              // 日期 YYYY-MM-DD
  rate: number;              // 当日齐全率
  inStockCount: number;      // 当日有库存商品数
}

// 战略商品月度齐全率数据
export interface StrategicMonthlyAvailabilityData {
  value: number;             // 月度平均齐全率
  totalStrategicSku: number; // 战略商品总数
  daysInMonth: number;       // 当月统计天数
  dailyRates: DailyAvailabilityRate[]; // 每日齐全率明细
}

// 周转预警统计
export interface TurnoverWarningStats {
  mildOverstock: number;     // 轻度积压 >60天
  moderateOverstock: number; // 中度积压 >90天
  seriousOverstock: number;  // 严重积压 >120天
}

// 周转预警类型
export type TurnoverWarningType = 'mildOverstock' | 'moderateOverstock' | 'seriousOverstock';

// 战略商品齐全率数据
export interface AvailabilityData {
  value: number;
  unit: 'percent';
  totalSku: number;           // 总SKU数
  categories: CategoryMetric[];
  warningStats: StockWarningStats;
  strategicAvailability?: StrategicAvailabilityData;           // 当前瞬时战略商品齐全率
  strategicMonthlyAvailability?: StrategicMonthlyAvailabilityData; // 月度平均战略商品齐全率
}

// 库存周转天数数据
export interface TurnoverData {
  value: number;
  unit: 'day';
  trend: number;
  trendDirection: TrendDirection;
  healthStatus: HealthStatus;
  categories: CategoryMetric[];
  warningStats: TurnoverWarningStats;
  previousValue?: number;  // 上月周转天数
  period?: {
    current: string;   // 当前月份，如 "2026-03"
    previous: string;  // 上月月份，如 "2026-02"
  };
}

// 临期商品数据
export interface ExpiringData {
  value: number;
  unit: 'percent';
  trend: number;
  trendDirection: TrendDirection;
  healthStatus: HealthStatus;
  warningLevel: WarningLevel;
  breakdown: ExpiringBreakdown[];
  categories: CategoryMetric[];
  within7Days: number;
  within15Days: number;
  within30Days: number;
  expiringCost: number;  // 临期商品金额
  totalCost: number;     // 总库存成本
}

// 滞销商品数据
export interface SlowMovingData {
  value: number;
  unit: 'percent';
  trend: number;
  trendDirection: TrendDirection;
  distribution: SlowMovingDistribution[];
  categories: CategoryMetric[];
  slowMovingCost: number;  // 滞销商品金额
  totalCost: number;       // 总库存成本
  warningStats: SlowMovingWarningStats;  // 预警统计
}

// Dashboard概览数据
export interface DashboardOverview {
  availability: AvailabilityData;
  turnover: TurnoverData;
  expiring: ExpiringData;
  slowMoving: SlowMovingData;
  period: Period;
}
