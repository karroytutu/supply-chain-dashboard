/**
 * 销售分析模块模拟数据
 * 原型阶段使用，所有数据均为静态模拟值
 */

import type {
  MetricSparkData,
  RiskCardData,
  CustomerMetricData,
  QuadrantCardData,
  DimensionDistributionItem,
  CustomerQuadrantData,
  TopCustomerData,
  DistrictShareItem,
  RankedProduct,
  MatrixProduct,
  InventoryMatchItem,
  SalesRepRow,
  DiagnosisItem,
} from '@/types/sales-analysis';

/** 指标概览 */
export const ALL_METRICS: MetricSparkData[] = [
  {
    key: 'order',
    label: '订单额',
    value: 286400,
    yoyChange: 12.8,
    momChange: 4.1,
    isNegative: false,
    sparkline: [
      { date: '4月6日', value: 33200 },
      { date: '4月7日', value: 28600 },
      { date: '4月8日', value: 36900 },
      { date: '4月9日', value: 31400 },
      { date: '4月10日', value: 44800 },
      { date: '4月11日', value: 39700 },
      { date: '4月12日', value: 47800 },
    ],
  },
  {
    key: 'settlement',
    label: '结算额',
    value: 254800,
    yoyChange: 8.5,
    momChange: 2.6,
    isNegative: false,
    sparkline: [
      { date: '4月6日', value: 30100 },
      { date: '4月7日', value: 34200 },
      { date: '4月8日', value: 32800 },
      { date: '4月9日', value: 38100 },
      { date: '4月10日', value: 38400 },
      { date: '4月11日', value: 43500 },
      { date: '4月12日', value: 45200 },
    ],
  },
  {
    key: 'collection',
    label: '回款额',
    value: 198300,
    yoyChange: -3.1,
    momChange: -1.5,
    isNegative: true,
    sparkline: [
      { date: '4月6日', value: 36400 },
      { date: '4月7日', value: 33800 },
      { date: '4月8日', value: 29500 },
      { date: '4月9日', value: 24600 },
      { date: '4月10日', value: 26900 },
      { date: '4月11日', value: 18700 },
      { date: '4月12日', value: 16400 },
    ],
  },
  {
    key: 'orderCustomerCount',
    label: '下单客户数',
    value: 186,
    valueType: 'count',
    yoyChange: 5.2,
    momChange: 2.8,
    isNegative: false,
    sparkline: [
      { date: '4月6日', value: 24 },
      { date: '4月7日', value: 28 },
      { date: '4月8日', value: 31 },
      { date: '4月9日', value: 26 },
      { date: '4月10日', value: 29 },
      { date: '4月11日', value: 25 },
      { date: '4月12日', value: 23 },
    ],
  },
  {
    key: 'avgOrderValue',
    label: '客单价',
    value: 1540,
    valueType: 'currency',
    yoyChange: 7.6,
    momChange: 1.3,
    isNegative: false,
    sparkline: [
      { date: '4月6日', value: 1380 },
      { date: '4月7日', value: 1020 },
      { date: '4月8日', value: 1190 },
      { date: '4月9日', value: 1210 },
      { date: '4月10日', value: 1620 },
      { date: '4月11日', value: 1590 },
      { date: '4月12日', value: 2090 },
    ],
  },
  {
    key: 'gross',
    label: '毛利额',
    value: 62900,
    yoyChange: 15.7,
    momChange: 6.3,
    isNegative: false,
    sparkline: [
      { date: '4月6日', value: 7400 },
      { date: '4月7日', value: 9200 },
      { date: '4月8日', value: 11600 },
      { date: '4月9日', value: 12800 },
      { date: '4月10日', value: 14900 },
      { date: '4月11日', value: 15600 },
      { date: '4月12日', value: 17100 },
    ],
  },
  {
    key: 'expense',
    label: '费用支出额',
    value: 18200,
    yoyChange: 6.2,
    momChange: 6.8,
    isNegative: true,
    sparkline: [
      { date: '4月6日', value: 3100 },
      { date: '4月7日', value: 2800 },
      { date: '4月8日', value: 3500 },
      { date: '4月9日', value: 2400 },
      { date: '4月10日', value: 2900 },
      { date: '4月11日', value: 1700 },
      { date: '4月12日', value: 1100 },
    ],
  },
  {
    key: 'expenseIncome',
    label: '费用收入额',
    value: 7400,
    yoyChange: 2.1,
    momChange: 3.4,
    isNegative: false,
    sparkline: [
      { date: '4月6日', value: 1680 },
      { date: '4月7日', value: 1540 },
      { date: '4月8日', value: 1360 },
      { date: '4月9日', value: 1280 },
      { date: '4月10日', value: 980 },
      { date: '4月11日', value: 760 },
      { date: '4月12日', value: 620 },
    ],
  },
  {
    key: 'settlementProfit',
    label: '结算利润额',
    value: 51100,
    yoyChange: 11.2,
    momChange: 5.7,
    isNegative: false,
    sparkline: [
      { date: '4月6日', value: 8300 },
      { date: '4月7日', value: 7600 },
      { date: '4月8日', value: 6900 },
      { date: '4月9日', value: 4800 },
      { date: '4月10日', value: 4100 },
      { date: '4月11日', value: 2700 },
      { date: '4月12日', value: 1800 },
    ],
  },
  {
    key: 'arTurnoverDays',
    label: '应收账款周转天数',
    value: 42,
    valueType: 'days',
    yoyChange: 8.4,
    momChange: 3.2,
    isNegative: true,
    sparkline: [
      { date: '4月6日', value: 38 },
      { date: '4月7日', value: 40 },
      { date: '4月8日', value: 39 },
      { date: '4月9日', value: 41 },
      { date: '4月10日', value: 43 },
      { date: '4月11日', value: 44 },
      { date: '4月12日', value: 42 },
    ],
  },
];

/** 风险卡片数据 */
export const RISK_CARD_DATA: Record<string, RiskCardData> = {
  red: {
    level: 'red',
    title: '红色风险',
    count: 28,
    unit: '客户',
    meta: [
      { label: '超过30天未下单', value: 17 },
      { label: '超过30天未拜访', value: 11 },
    ],
    linkText: '查看风险客户',
    linkHint: '打开弹窗查看名单与详情',
  },
  yellow: {
    level: 'yellow',
    title: '黄色预警',
    count: 46,
    unit: '客户',
    meta: [
      { label: '订单下滑', value: 19 },
      { label: '跟进不足', value: 27 },
      { label: '近7天新增', value: 8 },
    ],
    linkText: '查看预警客户',
    linkHint: '打开弹窗查看名单与详情',
  },
  blue: {
    level: 'blue',
    title: '蓝色机会',
    count: 33,
    unit: '客户',
    meta: [
      { label: '品类过少', value: 33 },
      { label: 'Top1机会客户', value: '城市便利店A03' },
      { label: '平均低于同类', value: '31%' },
    ],
    linkText: '查看扩品机会',
    linkHint: '打开弹窗查看名单与详情',
  },
};

/** 客户指标卡数据（替代 RiskCardData 在页面中使用） */
export const CUSTOMER_METRIC_DATA: Record<string, CustomerMetricData> = {
  visit_insufficient: {
    metricType: 'visit_insufficient',
    title: '拜访不足客户',
    count: 34,
    unit: '家',
    momChange: 6.3,
    isNegative: true,
    previousCount: 28,
    meta: [
      { label: 'A/B类超9天未拜访', value: 22 },
      { label: '拜访频次低于目标', value: 12 },
    ],
    linkText: '查看拜访不足客户',
    linkHint: '打开弹窗查看名单与详情',
  },
  order_decline: {
    metricType: 'order_decline',
    title: '订单下滑客户',
    count: 19,
    unit: '家',
    momChange: -3.8,
    isNegative: true,
    previousCount: 22,
    meta: [
      { label: '环比下降>20%', value: 14 },
      { label: '连续两期下滑', value: 5 },
    ],
    linkText: '查看订单下滑客户',
    linkHint: '打开弹窗查看名单与详情',
  },
  category_incomplete: {
    metricType: 'category_incomplete',
    title: '品类不齐客户',
    count: 33,
    unit: '家',
    momChange: 2.1,
    isNegative: true,
    previousCount: 30,
    meta: [
      { label: '品类低于同类60%', value: 21 },
      { label: '扩品空间>5类', value: 12 },
    ],
    linkText: '查看品类不齐客户',
    linkHint: '打开弹窗查看名单与详情',
  },
  low_expense_ratio: {
    metricType: 'low_expense_ratio',
    title: '费销比过低客户',
    count: 12,
    unit: '家',
    momChange: 15.4,
    isNegative: true,
    previousCount: 9,
    meta: [
      { label: '费用占比>同类1.5倍', value: 8 },
      { label: '连续2期费销比超标', value: 4 },
    ],
    linkText: '查看费销比过低客户',
    linkHint: '打开弹窗查看名单与详情',
  },
  public_pool: {
    metricType: 'public_pool',
    title: '公海客户',
    count: 15,
    unit: '家',
    momChange: -8.2,
    isNegative: false,
    previousCount: 23,
    meta: [
      { label: '无客户经理', value: 9 },
      { label: '长期未跟进(>30天)', value: 6 },
    ],
    linkText: '查看公海客户',
    linkHint: '打开弹窗查看名单与详情',
  },
};

/** 客户结构四象限数据 */
export const CUSTOMER_QUADRANT_DATA: CustomerQuadrantData = {
  salesMedian: 420,
  profitMedian: 8600,
  quadrants: {
    star: {
      key: 'star',
      label: '明星客户',
      tagColor: 'gold',
      tagText: '高销高利',
      count: 89,
      percentage: '28%',
      strategy: '重点维护，确保持续产出',
      salesLabel: '销量高于中位数',
      profitLabel: '毛利额高于中位数',
    },
    traffic: {
      key: 'traffic',
      label: '流量客户',
      tagColor: 'blue',
      tagText: '高销低利',
      count: 72,
      percentage: '23%',
      strategy: '优化产品组合提升毛利',
      salesLabel: '销量高于中位数',
      profitLabel: '毛利额低于中位数',
    },
    potential: {
      key: 'potential',
      label: '潜力客户',
      tagColor: 'green',
      tagText: '低销高利',
      count: 68,
      percentage: '22%',
      strategy: '扩大销量规模释放潜力',
      salesLabel: '销量低于中位数',
      profitLabel: '毛利额高于中位数',
    },
    problem: {
      key: 'problem',
      label: '问题客户',
      tagColor: 'default',
      tagText: '低销低利',
      count: 87,
      percentage: '27%',
      strategy: '评估价值，制定激活或退出策略',
      salesLabel: '销量低于中位数',
      profitLabel: '毛利额低于中位数',
    },
  },
  dimensionData: {
    channel: {
      star: [
        { label: '便利店', percentage: 100, count: 16, countLabel: '16 家' },
        { label: '餐饮店', percentage: 75, count: 12, countLabel: '12 家' },
        { label: '商超', percentage: 50, count: 8, countLabel: '8 家' },
      ],
      traffic: [
        { label: '便利店', percentage: 100, count: 18, countLabel: '18 家' },
        { label: '商超', percentage: 67, count: 12, countLabel: '12 家' },
        { label: '餐饮店', percentage: 33, count: 6, countLabel: '6 家' },
      ],
      potential: [
        { label: '餐饮店', percentage: 100, count: 15, countLabel: '15 家' },
        { label: '便利店', percentage: 67, count: 10, countLabel: '10 家' },
        { label: '商超', percentage: 40, count: 6, countLabel: '6 家' },
      ],
      problem: [
        { label: '便利店', percentage: 100, count: 22, countLabel: '22 家' },
        { label: '商超', percentage: 73, count: 16, countLabel: '16 家' },
        { label: '餐饮店', percentage: 36, count: 8, countLabel: '8 家' },
        { label: 'KTV', percentage: 27, count: 6, countLabel: '6 家' },
        { label: '麻将馆', percentage: 18, count: 4, countLabel: '4 家' },
      ],
    },
    district: {
      star: [
        { label: '华东', percentage: 100, count: 24, countLabel: '24 家' },
        { label: '华南', percentage: 54, count: 13, countLabel: '13 家' },
        { label: '华北', percentage: 38, count: 9, countLabel: '9 家' },
      ],
      traffic: [
        { label: '华东', percentage: 100, count: 20, countLabel: '20 家' },
        { label: '华中', percentage: 50, count: 10, countLabel: '10 家' },
        { label: '华南', percentage: 35, count: 7, countLabel: '7 家' },
      ],
      potential: [
        { label: '华南', percentage: 100, count: 18, countLabel: '18 家' },
        { label: '华东', percentage: 72, count: 13, countLabel: '13 家' },
        { label: '西南', percentage: 44, count: 8, countLabel: '8 家' },
      ],
      problem: [
        { label: '华东', percentage: 100, count: 28, countLabel: '28 家' },
        { label: '华南', percentage: 46, count: 13, countLabel: '13 家' },
        { label: '华中', percentage: 32, count: 9, countLabel: '9 家' },
        { label: '华北', percentage: 21, count: 6, countLabel: '6 家' },
        { label: '西南', percentage: 14, count: 4, countLabel: '4 家' },
      ],
    },
  },
};

/** Top 客户 */
export const TOP_CUSTOMERS: TopCustomerData[] = [
  { name: '华东旗舰店', sales: 92000, profit: 21800, percentage: 92 },
  { name: '盛安商贸', sales: 77600, profit: 17500, percentage: 78 },
  { name: '远拓连锁', sales: 66400, profit: 14600, percentage: 66 },
];

/** 片区占比 */
export const DISTRICT_SHARE: DistrictShareItem[] = [
  { name: '华东', percentage: 40 },
  { name: '华南', percentage: 27 },
  { name: '华北', percentage: 18 },
  { name: '其他', percentage: 15 },
];

/** 畅销/滞销产品排行 */
export const PRODUCT_RANKING: RankedProduct[] = [
  { name: 'A12 智能终端', sales: 1268, salesAmount: 168000, percentage: 88 },
  { name: 'M8 套装配件', sales: 964, salesAmount: 93500, percentage: 72 },
  { name: 'G4 入门机型', sales: 185, salesAmount: 18600, percentage: 22, isWorst: true },
];

/** 产品结构矩阵散点 */
export const PRODUCT_MATRIX: MatrixProduct[] = [
  { name: 'A12', volume: 80, marginRate: 75, color: '#1677ff' },
  { name: 'M8', volume: 60, marginRate: 45, color: '#fa8c16' },
  { name: 'K3', volume: 30, marginRate: 70, color: '#52c41a' },
  { name: 'G4', volume: 20, marginRate: 25, color: '#ff4d4f' },
];

/** 库存匹配 */
export const INVENTORY_MATCH: InventoryMatchItem[] = [
  { name: 'A12', inventoryPercent: 74, salesPercent: 68, status: 'healthy', statusLabel: '健康' },
  { name: 'M8', inventoryPercent: 38, salesPercent: 72, status: 'shortage', statusLabel: '缺货' },
  { name: 'G4', inventoryPercent: 82, salesPercent: 16, status: 'overstock', statusLabel: '积压' },
];

/** 业务员综合表现 */
export const SALES_REP_PERFORMANCE: SalesRepRow[] = [
  { name: '张晨', sales: 128000, orders: 46, collection: 96000, profit: 28600, status: { text: 'Top 1', color: 'green' } },
  { name: '李洋', sales: 104500, orders: 39, collection: 88200, profit: 21400, status: { text: '稳定', color: 'blue' } },
  { name: '周凯', sales: 76300, orders: 27, collection: 48900, profit: 11500, status: { text: '待帮扶', color: 'red' } },
];

/** 问题诊断卡 */
export const DIAGNOSIS_ITEMS: DiagnosisItem[] = [
  {
    title: '周凯：转化率偏低',
    description: '意向转成单仅 5%，低于团队平均 10%，建议复盘报价与跟进话术。',
  },
  {
    title: '王宁：拜访量不足',
    description: '本周拜访 8 次，低于团队均值 14 次，需要增加外勤覆盖频次。',
  },
  {
    title: '李洋：回款跟进需加强',
    description: '销售表现稳定，但部分客户回款节奏偏慢，建议增加月末回款催办动作。',
  },
];

/** 钻取弹窗 - 风险客户数据（拆分至 customerDrilldown.ts） */
export { CUSTOMER_DRILLDOWN } from './customerDrilldown';

/** ==================== 目标进展看板数据 ==================== */

export interface TargetProgressMarketer {
  marketerId: string;
  marketerName: string;
  targetAmount: number;
  actualAmount: number;
  completionRate: number;
  isOnTrack: boolean;
  customers: TargetProgressCustomer[];
}

export interface TargetProgressCustomer {
  customerId: string;
  customerName: string;
  targetAmount: number;
  actualAmount: number;
  completionRate: number;
  isOnTrack: boolean;
}

export interface TargetProgressData {
  monthLabel: string;
  timeProgress: number;
  timeProgressDays: number;
  totalDays: number;
  totalTargetAmount: number;
  totalActualAmount: number;
  completionRate: number;
  isOnTrack: boolean;
  marketers: TargetProgressMarketer[];
}

export const TARGET_PROGRESS_DATA: TargetProgressData = {
  monthLabel: '2026年7月',
  timeProgress: 86.7,
  timeProgressDays: 26,
  totalDays: 30,
  totalTargetAmount: 5800000,
  totalActualAmount: 3620000,
  completionRate: 62.4,
  isOnTrack: false,
  marketers: [
    {
      marketerId: 'm1', marketerName: '张三',
      targetAmount: 1800000, actualAmount: 1350000, completionRate: 75, isOnTrack: false,
      customers: [
        { customerId: 'c1', customerName: '张三商贸', targetAmount: 550000, actualAmount: 420000, completionRate: 76.4, isOnTrack: false },
        { customerId: 'c2', customerName: '李四超市', targetAmount: 620000, actualAmount: 480000, completionRate: 77.4, isOnTrack: false },
        { customerId: 'c3', customerName: '王五便利', targetAmount: 430000, actualAmount: 310000, completionRate: 72.1, isOnTrack: false },
        { customerId: 'c5', customerName: '百联集团', targetAmount: 200000, actualAmount: 140000, completionRate: 70, isOnTrack: false },
      ],
    },
    {
      marketerId: 'm2', marketerName: '李四',
      targetAmount: 2000000, actualAmount: 1080000, completionRate: 54, isOnTrack: false,
      customers: [
        { customerId: 'c6', customerName: '家乐福', targetAmount: 1200000, actualAmount: 680000, completionRate: 56.7, isOnTrack: false },
        { customerId: 'c7', customerName: '盒马鲜生', targetAmount: 800000, actualAmount: 400000, completionRate: 50, isOnTrack: false },
      ],
    },
    {
      marketerId: 'm3', marketerName: '王五',
      targetAmount: 2000000, actualAmount: 1190000, completionRate: 59.5, isOnTrack: false,
      customers: [
        { customerId: 'c9', customerName: '永辉超市', targetAmount: 1100000, actualAmount: 680000, completionRate: 61.8, isOnTrack: false },
        { customerId: 'c10', customerName: '大润发', targetAmount: 900000, actualAmount: 510000, completionRate: 56.7, isOnTrack: false },
      ],
    },
  ],
};
