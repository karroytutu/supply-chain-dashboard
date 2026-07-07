/**
 * 经营全景 KPI 类型定义
 */

/** 指标卡值格式类型 */
export type MetricValueType = 'currency' | 'count' | 'percent' | 'days';

/** 迷你趋势线数据点 */
export interface SparkDataPoint {
  date: string;
  value: number;
}

/** 经营全景 KPI 卡片数据 */
export interface OverviewKPI {
  key: string;
  label: string;
  value: number;
  /** 值格式类型 */
  valueType?: MetricValueType;
  /** 辅助指标标签（如"目标完成率""毛利率"） */
  assistLabel: string;
  /** 辅助指标值 */
  assistValue: number;
  /** 辅助指标格式类型 */
  assistValueType?: MetricValueType;
  /** 环比变化（%） */
  momChange: number;
  /** 是否为负面指标（如费用，上升为负面） */
  isNegative: boolean;
  /** 7 天迷你趋势线 */
  sparkline: SparkDataPoint[];
}
