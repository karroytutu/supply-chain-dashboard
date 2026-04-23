/**
 * 销售分析模块类型定义
 * 原型阶段使用，定义所有页面组件的数据结构
 */

/** 风险等级 */
export type RiskLevel = 'red' | 'yellow' | 'blue';

/** 指标卡值格式类型 */
export type MetricValueType = 'currency' | 'count' | 'days' | 'percent';

/** 指标卡数据（含迷你趋势图） */
export interface MetricSparkData {
  key: string;
  label: string;
  value: number;
  /** 值格式类型，默认 currency */
  valueType?: MetricValueType;
  /** 值单位文案，默认由 valueType 自动生成；设置后覆盖自动值 */
  unit?: string;
  yoyChange: number;
  momChange: number;
  isNegative: boolean;
  sparkline: Array<{ date: string; value: number }>;
}

/** 风险卡片数据 */
export interface RiskCardData {
  level: RiskLevel;
  kicker: string;
  title: string;
  tag: { text: string; color: string };
  count: number;
  unit: string;
  caption: string;
  meta: Array<{ label: string; value: string | number }>;
  linkText: string;
  linkHint: string;
}

/** 客户等级小卡片 */
export interface GradeData {
  label: string;
  count: number;
  percentage: string;
  strategy: string;
  tagColor: string;
  tagText: string;
  note: string;
}

/** 客户类型分布项 */
export interface TypeDistributionItem {
  label: string;
  percentage: number;
  count: number;
  countLabel: string;
}

/** Top 客户数据 */
export interface TopCustomerData {
  name: string;
  sales: number;
  profit: number;
  percentage: number;
}

/** 片区占比 */
export interface DistrictShareItem {
  name: string;
  percentage: number;
}

/** 排行产品 */
export interface RankedProduct {
  name: string;
  sales: number;
  salesAmount: number;
  percentage: number;
  isWorst?: boolean;
}

/** 矩阵散点产品 */
export interface MatrixProduct {
  name: string;
  volume: number;
  marginRate: number;
  color: string;
}

/** 库存匹配项 */
export interface InventoryMatchItem {
  name: string;
  inventoryPercent: number;
  salesPercent: number;
  status: 'healthy' | 'shortage' | 'overstock';
  statusLabel: string;
}

/** 业务员绩效行 */
export interface SalesRepRow {
  name: string;
  sales: number;
  orders: number;
  collection: number;
  profit: number;
  status: { text: string; color: string };
}

/** 问题诊断项 */
export interface DiagnosisItem {
  title: string;
  description: string;
}

/** 风险等级定义条目 */
export interface RiskDefinitionItem {
  /** 条件名称 */
  label: string;
  /** 条件描述 */
  desc: string;
}

/** 钻取弹窗 - 风险分组 */
export interface DrilldownRiskGroup {
  title: string;
  desc: string;
  /** 风险等级定义（归入该等级的条件） */
  definition: RiskDefinitionItem[];
  tagText: string;
  tagColor: string;
  countText: string;
  filterNote: string;
  myView: DrilldownMyView;
  filters: Array<{ key: string; label: string }>;
  customers: DrilldownCustomer[];
}

/** 钻取弹窗 - 我的客户视图概要 */
export interface DrilldownMyView {
  title: string;
  note: string;
  desc: string;
  filterNote: string;
  focusLabel: string;
  focusStatus: string;
  focusName: string;
  focusNote: string;
}

/** 钻取弹窗 - 客户 */
export interface DrilldownCustomer {
  id: string;
  name: string;
  tags: Array<{ text: string; color: string }>;
  summary: string;
  owner: string;
  order: string;
  followUp: string;
  action: string;
  filters: string[];
  isMine: boolean;
  detail: DrilldownCustomerDetail;
}

/** 钻取弹窗 - 客户详情 */
export interface DrilldownCustomerDetail {
  subtitle: string;
  metrics: Array<{ label: string; value: string }>;
  reasons: string[];
  trend: number[];
  payment: string;
  followups: string[];
  coverage: Array<{ label: string; value: number }>;
  actions: string[];
}
