/**
 * 客户分析板块模拟数据
 */
import type {
  CustomerMetric,
  QuadrantConfig,
  QuadrantStat,
  TopCustomerRow,
  DistributionItem,
  CustomerConcentration,
  CustomerStructure,
  CategoryPenetration,
  CustomerDetailRow,
} from '@/types/sales-analysis';

/** 客户核心指标 */
export const CUSTOMER_METRICS: CustomerMetric[] = [
  { key: 'avgOrderValue', label: '客单价', value: 19462, momChange: 3.1, valueType: 'currency' },
  { key: 'avgProfit', label: '客户均毛利', value: 4634, momChange: 1.8, valueType: 'currency' },
  { key: 'repurchaseRate', label: '复购率', value: 68.2, momChange: -1.5, valueType: 'percent' },
  { key: 'avgCategoryCount', label: '平均品类数', value: 3.8, momChange: 0.5, valueType: 'count' },
  { key: 'avgOrderFreq', label: '平均下单频次', value: 4.2, momChange: 2.3, valueType: 'count' },
];

/** 客户四象限配置 */
export const CUSTOMER_QUADRANT_CONFIG: QuadrantConfig[] = [
  { key: 'star', label: '明星客户', tagColor: 'gold', tagText: '高销高利' },
  { key: 'traffic', label: '流量客户', tagColor: 'blue', tagText: '高销低利' },
  { key: 'potential', label: '潜力客户', tagColor: 'green', tagText: '低销高利' },
  { key: 'problem', label: '问题客户', tagColor: 'default', tagText: '低销低利' },
];

/** 客户四象限统计 */
export const CUSTOMER_QUADRANT_STATS: QuadrantStat[] = [
  { key: 'star', count: 89, percentage: '28%', salesPercentage: '52%' },
  { key: 'traffic', count: 72, percentage: '23%', salesPercentage: '26%' },
  { key: 'potential', count: 68, percentage: '22%', salesPercentage: '14%' },
  { key: 'problem', count: 87, percentage: '27%', salesPercentage: '8%' },
];

/** Top 客户排行 */
export const TOP_CUSTOMERS: TopCustomerRow[] = [
  { customerId: 'c1', customerName: '华东旗舰店', salesAmount: 920000, profitAmount: 218000, collectionAmount: 780000, categoryCount: 8, marketerName: '张晨', districtName: '华东' },
  { customerId: 'c2', customerName: '盛安商贸', salesAmount: 776000, profitAmount: 175000, collectionAmount: 650000, categoryCount: 6, marketerName: '李洋', districtName: '华南' },
  { customerId: 'c3', customerName: '远拓连锁', salesAmount: 664000, profitAmount: 146000, collectionAmount: 520000, categoryCount: 7, marketerName: '张晨', districtName: '华北' },
  { customerId: 'c4', customerName: '鑫源超市', salesAmount: 580000, profitAmount: 128000, collectionAmount: 490000, categoryCount: 5, marketerName: '周凯', districtName: '华东' },
  { customerId: 'c5', customerName: '百汇便利', salesAmount: 520000, profitAmount: 115000, collectionAmount: 430000, categoryCount: 4, marketerName: '李洋', districtName: '华中' },
  { customerId: 'c6', customerName: '家乐福', salesAmount: 480000, profitAmount: 86000, collectionAmount: 350000, categoryCount: 6, marketerName: '李洋', districtName: '华南' },
  { customerId: 'c7', customerName: '盒马鲜生', salesAmount: 420000, profitAmount: 95000, collectionAmount: 380000, categoryCount: 5, marketerName: '周凯', districtName: '华东' },
  { customerId: 'c8', customerName: '永辉超市', salesAmount: 380000, profitAmount: 72000, collectionAmount: 290000, categoryCount: 4, marketerName: '张晨', districtName: '华北' },
  { customerId: 'c9', customerName: '大润发', salesAmount: 350000, profitAmount: 68000, collectionAmount: 260000, categoryCount: 3, marketerName: '周凯', districtName: '华南' },
  { customerId: 'c10', customerName: '物美超市', salesAmount: 310000, profitAmount: 58000, collectionAmount: 240000, categoryCount: 4, marketerName: '张晨', districtName: '华北' },
];

/** 渠道分布 */
export const CHANNEL_DISTRIBUTION: DistributionItem[] = [
  { label: '便利店', count: 98, salesAmount: 1450000, salesPercentage: 40.1 },
  { label: '餐饮店', count: 65, salesAmount: 820000, salesPercentage: 22.7 },
  { label: '商超', count: 52, salesAmount: 680000, salesPercentage: 18.8 },
  { label: 'KTV', count: 28, salesAmount: 350000, salesPercentage: 9.7 },
  { label: '麻将馆', count: 18, salesAmount: 180000, salesPercentage: 5.0 },
  { label: '其他', count: 15, salesAmount: 140000, salesPercentage: 3.9 },
];

/** 片区分布 */
export const DISTRICT_DISTRIBUTION: DistributionItem[] = [
  { label: '华东', count: 105, salesAmount: 1520000, salesPercentage: 42.0 },
  { label: '华南', count: 72, salesAmount: 850000, salesPercentage: 23.5 },
  { label: '华北', count: 48, salesAmount: 520000, salesPercentage: 14.4 },
  { label: '华中', count: 32, salesAmount: 380000, salesPercentage: 10.5 },
  { label: '西南', count: 19, salesAmount: 350000, salesPercentage: 9.7 },
];

/** 客户集中度 */
export const CUSTOMER_CONCENTRATION: CustomerConcentration = {
  top5Percentage: 43.5,
  top10Percentage: 62.8,
  top5SalesAmount: 3450000,
  top10SalesAmount: 4960000,
  totalSalesAmount: 7920000,
};

/** 新老客户结构 */
export const CUSTOMER_STRUCTURE_DATA: CustomerStructure = {
  newCustomerCount: 28,
  newCustomerSales: 420000,
  existingCustomerCount: 158,
  existingCustomerSales: 3200000,
};

/** 品类渗透分析 */
export const CATEGORY_PENETRATION: CategoryPenetration = {
  avgCategoryCount: 3.8,
  belowAvgCount: 95,
  totalCustomers: 186,
};

/** 客户明细表数据 */
export const CUSTOMER_DETAILS: CustomerDetailRow[] = [
  { customerId: 'c1', customerName: '华东旗舰店', channel: '商超', district: '华东', marketerName: '张晨', salesAmount: 920000, profitAmount: 218000, collectionAmount: 780000, orderCount: 18, categoryCount: 8, momChange: 5.2, quadrant: 'star' },
  { customerId: 'c2', customerName: '盛安商贸', channel: '便利店', district: '华南', marketerName: '李洋', salesAmount: 776000, profitAmount: 175000, collectionAmount: 650000, orderCount: 15, categoryCount: 6, momChange: 3.8, quadrant: 'star' },
  { customerId: 'c3', customerName: '远拓连锁', channel: '商超', district: '华北', marketerName: '张晨', salesAmount: 664000, profitAmount: 146000, collectionAmount: 520000, orderCount: 12, categoryCount: 7, momChange: -2.1, quadrant: 'star' },
  { customerId: 'c4', customerName: '鑫源超市', channel: '便利店', district: '华东', marketerName: '周凯', salesAmount: 580000, profitAmount: 128000, collectionAmount: 490000, orderCount: 14, categoryCount: 5, momChange: 1.5, quadrant: 'star' },
  { customerId: 'c5', customerName: '百汇便利', channel: '便利店', district: '华中', marketerName: '李洋', salesAmount: 520000, profitAmount: 115000, collectionAmount: 430000, orderCount: 11, categoryCount: 4, momChange: 4.2, quadrant: 'star' },
  { customerId: 'c6', customerName: '家乐福', channel: '商超', district: '华南', marketerName: '李洋', salesAmount: 480000, profitAmount: 86000, collectionAmount: 350000, orderCount: 9, categoryCount: 6, momChange: -5.3, quadrant: 'traffic' },
  { customerId: 'c7', customerName: '盒马鲜生', channel: '商超', district: '华东', marketerName: '周凯', salesAmount: 420000, profitAmount: 95000, collectionAmount: 380000, orderCount: 8, categoryCount: 5, momChange: 2.8, quadrant: 'traffic' },
  { customerId: 'c8', customerName: '永辉超市', channel: '商超', district: '华北', marketerName: '张晨', salesAmount: 380000, profitAmount: 72000, collectionAmount: 290000, orderCount: 10, categoryCount: 4, momChange: -1.2, quadrant: 'traffic' },
  { customerId: 'c11', customerName: '好邻居便利', channel: '便利店', district: '华东', marketerName: '张晨', salesAmount: 180000, profitAmount: 52000, collectionAmount: 150000, orderCount: 6, categoryCount: 3, momChange: 8.5, quadrant: 'potential' },
  { customerId: 'c12', customerName: '福满多餐饮', channel: '餐饮店', district: '华南', marketerName: '李洋', salesAmount: 150000, profitAmount: 45000, collectionAmount: 120000, orderCount: 5, categoryCount: 2, momChange: 12.1, quadrant: 'potential' },
  { customerId: 'c13', customerName: '金鑫KTV', channel: 'KTV', district: '华东', marketerName: '周凯', salesAmount: 85000, profitAmount: 12000, collectionAmount: 60000, orderCount: 3, categoryCount: 2, momChange: -15.8, quadrant: 'problem' },
  { customerId: 'c14', customerName: '休闲麻将馆', channel: '麻将馆', district: '华北', marketerName: '李洋', salesAmount: 42000, profitAmount: 5800, collectionAmount: 35000, orderCount: 2, categoryCount: 1, momChange: -22.3, quadrant: 'problem' },
];
