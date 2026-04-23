/**
 * 销售分析模块模拟数据
 * 原型阶段使用，所有数据均为静态模拟值
 */

import type {
  MetricSparkData,
  RiskCardData,
  GradeData,
  TypeDistributionItem,
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
    kicker: '风险等级',
    title: '红色高风险',
    tag: { text: '立即处理', color: 'red' },
    count: 28,
    unit: '客户',
    caption: '当前优先级最高，建议管理层先处理回款与停单风险。',
    meta: [
      { label: '回款异常', value: 11 },
      { label: '30天未下单', value: 17 },
      { label: '最高风险客户', value: '华东旗舰店' },
    ],
    linkText: '查看高风险客户',
    linkHint: '打开弹窗查看名单与详情',
  },
  yellow: {
    level: 'yellow',
    kicker: '风险等级',
    title: '黄色预警',
    tag: { text: '尽快跟进', color: 'orange' },
    count: 46,
    unit: '客户',
    caption: '关注订单下滑和跟进不足，适合销售主管分派跟进动作。',
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
    kicker: '机会等级',
    title: '蓝色机会',
    tag: { text: '增长机会', color: 'blue' },
    count: 33,
    unit: '客户',
    caption: '用于优先识别扩品空间，辅助制定增购与品类覆盖策略。',
    meta: [
      { label: '品类过少', value: 33 },
      { label: 'Top1机会客户', value: '城市便利店A03' },
      { label: '平均低于同类', value: '31%' },
    ],
    linkText: '查看扩品机会',
    linkHint: '打开弹窗查看名单与详情',
  },
};

/** 客户等级分布 */
export const GRADES_DATA: GradeData[] = [
  {
    label: 'A级客户',
    count: 32,
    percentage: '10%',
    strategy: '重点保留',
    tagColor: 'blue',
    tagText: '核心',
    note: '核心维护，重点关注回款与续单稳定性。',
  },
  {
    label: 'B级客户',
    count: 87,
    percentage: '28%',
    strategy: '兼顾增长',
    tagColor: 'green',
    tagText: '稳定',
    note: '兼顾潜力开发与风险防控。',
  },
  {
    label: 'C级客户',
    count: 156,
    percentage: '49%',
    strategy: '轻量触达',
    tagColor: 'orange',
    tagText: '批量维护',
    note: '适合批量管理和轻量化维护。',
  },
  {
    label: '沉睡客户',
    count: 41,
    percentage: '13%',
    strategy: '挽回优先',
    tagColor: 'red',
    tagText: '待唤醒',
    note: '优先评估是否存在挽回价值。',
  },
];

/** 客户类型分布 */
export const TYPE_DISTRIBUTION: TypeDistributionItem[] = [
  { label: '便利店', percentage: 82, count: 96, countLabel: '96 家' },
  { label: '商超', percentage: 58, count: 68, countLabel: '68 家' },
  { label: '餐饮店', percentage: 76, count: 89, countLabel: '89 家' },
  { label: '网吧', percentage: 31, count: 24, countLabel: '24 家' },
  { label: 'KTV', percentage: 25, count: 18, countLabel: '18 家' },
  { label: '麻将馆', percentage: 22, count: 15, countLabel: '15 家' },
];

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
