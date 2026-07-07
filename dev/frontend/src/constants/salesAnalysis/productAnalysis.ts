/**
 * 商品分析板块模拟数据
 */
import type {
  ProductMetric,
  TopProductRow,
  CategorySalesItem,
  InventoryHealthItem,
  ProductDetailRow,
} from '@/types/sales-analysis';
import type { QuadrantConfig, QuadrantStat } from '@/types/sales-analysis';

/** 商品核心指标 */
export const PRODUCT_METRICS: ProductMetric[] = [
  { key: 'activeSKU', label: '在售 SKU 数', value: 86, momChange: 2.4, valueType: 'count' },
  { key: 'avgSKUSales', label: 'SKU 均销售额', value: 42093, momChange: 1.8, valueType: 'currency' },
  { key: 'turnoverRate', label: '动销率', value: 78.2, momChange: -1.5, valueType: 'percent' },
  { key: 'avgSKUProfit', label: 'SKU 均毛利', value: 10023, momChange: 3.2, valueType: 'currency' },
];

/** 商品四象限配置 */
export const PRODUCT_QUADRANT_CONFIG: QuadrantConfig[] = [
  { key: 'star', label: '明星商品', tagColor: 'gold', tagText: '高销高利' },
  { key: 'traffic', label: '流量商品', tagColor: 'blue', tagText: '高销低利' },
  { key: 'potential', label: '利润商品', tagColor: 'green', tagText: '低销高利' },
  { key: 'problem', label: '问题商品', tagColor: 'default', tagText: '低销低利' },
];

/** 商品四象限统计 */
export const PRODUCT_QUADRANT_STATS: QuadrantStat[] = [
  { key: 'star', count: 22, percentage: '26%', salesPercentage: '55%' },
  { key: 'traffic', count: 18, percentage: '21%', salesPercentage: '25%' },
  { key: 'potential', count: 15, percentage: '17%', salesPercentage: '12%' },
  { key: 'problem', count: 31, percentage: '36%', salesPercentage: '8%' },
];

/** 品类销售排行 */
export const CATEGORY_SALES: CategorySalesItem[] = [
  { categoryId: 'cat1', categoryName: '饮料', salesAmount: 1450000, salesPercentage: 40.1 },
  { categoryId: 'cat2', categoryName: '食品', salesAmount: 820000, salesPercentage: 22.7 },
  { categoryId: 'cat3', categoryName: '日用品', salesAmount: 520000, salesPercentage: 14.4 },
  { categoryId: 'cat4', categoryName: '酒水', salesAmount: 380000, salesPercentage: 10.5 },
  { categoryId: 'cat5', categoryName: '零食', salesAmount: 280000, salesPercentage: 7.7 },
  { categoryId: 'cat6', categoryName: '其他', salesAmount: 170000, salesPercentage: 4.7 },
];

/** Top 商品排行 */
export const TOP_PRODUCTS: TopProductRow[] = [
  { productId: 'p1', productName: 'A12 智能终端', categoryName: '饮料', salesVolume: 1268, salesAmount: 1680000, profitAmount: 420000, momChange: 8.5 },
  { productId: 'p2', productName: 'M8 套装配件', categoryName: '食品', salesVolume: 964, salesAmount: 935000, profitAmount: 187000, momChange: 3.2 },
  { productId: 'p3', productName: 'K3 精选礼盒', categoryName: '日用品', salesVolume: 580, salesAmount: 520000, profitAmount: 156000, momChange: -1.8 },
  { productId: 'p4', productName: 'G4 入门机型', categoryName: '饮料', salesVolume: 185, salesAmount: 186000, profitAmount: 28000, momChange: -12.5 },
  { productId: 'p5', productName: 'B7 精品套装', categoryName: '酒水', salesVolume: 420, salesAmount: 380000, profitAmount: 95000, momChange: 5.6 },
  { productId: 'p6', productName: 'C2 经典款', categoryName: '食品', salesVolume: 350, salesAmount: 310000, profitAmount: 62000, momChange: 2.1 },
  { productId: 'p7', productName: 'D5 新品试用装', categoryName: '零食', salesVolume: 280, salesAmount: 168000, profitAmount: 42000, momChange: 15.8 },
  { productId: 'p8', productName: 'E1 高端系列', categoryName: '酒水', salesVolume: 120, salesAmount: 240000, profitAmount: 84000, momChange: -3.2 },
];

/** 库存健康度 */
export const INVENTORY_HEALTH: InventoryHealthItem[] = [
  { productId: 'p2', productName: 'M8 套装配件', categoryName: '食品', type: 'shortage', inventory: 15, salesVolume: 964, severityLabel: '严重缺货' },
  { productId: 'p5', productName: 'B7 精品套装', categoryName: '酒水', type: 'shortage', inventory: 8, salesVolume: 420, severityLabel: '库存偏低' },
  { productId: 'p7', productName: 'D5 新品试用装', categoryName: '零食', type: 'shortage', inventory: 22, salesVolume: 280, severityLabel: '库存偏低' },
  { productId: 'p4', productName: 'G4 入门机型', categoryName: '饮料', type: 'overstock', inventory: 580, salesVolume: 185, severityLabel: '严重积压' },
  { productId: 'p9', productName: 'F3 旧款清仓', categoryName: '日用品', type: 'overstock', inventory: 420, salesVolume: 45, severityLabel: '严重积压' },
  { productId: 'p10', productName: 'H2 季节限定', categoryName: '食品', type: 'overstock', inventory: 350, salesVolume: 82, severityLabel: '库存偏高' },
  { productId: 'p11', productName: 'J6 联名款', categoryName: '零食', type: 'overstock', inventory: 180, salesVolume: 35, severityLabel: '库存偏高' },
  { productId: 'p12', productName: 'L9 进口系列', categoryName: '酒水', type: 'overstock', inventory: 95, salesVolume: 18, severityLabel: '滞销风险' },
];

/** 商品明细表数据 */
export const PRODUCT_DETAILS: ProductDetailRow[] = [
  { productId: 'p1', productName: 'A12 智能终端', categoryName: '饮料', salesVolume: 1268, salesAmount: 1680000, profitAmount: 420000, inventory: 320, momChange: 8.5, quadrant: 'star' },
  { productId: 'p2', productName: 'M8 套装配件', categoryName: '食品', salesVolume: 964, salesAmount: 935000, profitAmount: 187000, inventory: 15, momChange: 3.2, quadrant: 'star' },
  { productId: 'p3', productName: 'K3 精选礼盒', categoryName: '日用品', salesVolume: 580, salesAmount: 520000, profitAmount: 156000, inventory: 180, momChange: -1.8, quadrant: 'star' },
  { productId: 'p5', productName: 'B7 精品套装', categoryName: '酒水', salesVolume: 420, salesAmount: 380000, profitAmount: 95000, inventory: 8, momChange: 5.6, quadrant: 'star' },
  { productId: 'p6', productName: 'C2 经典款', categoryName: '食品', salesVolume: 350, salesAmount: 310000, profitAmount: 62000, inventory: 250, momChange: 2.1, quadrant: 'traffic' },
  { productId: 'p7', productName: 'D5 新品试用装', categoryName: '零食', salesVolume: 280, salesAmount: 168000, profitAmount: 42000, inventory: 22, momChange: 15.8, quadrant: 'traffic' },
  { productId: 'p8', productName: 'E1 高端系列', categoryName: '酒水', salesVolume: 120, salesAmount: 240000, profitAmount: 84000, inventory: 95, momChange: -3.2, quadrant: 'potential' },
  { productId: 'p4', productName: 'G4 入门机型', categoryName: '饮料', salesVolume: 185, salesAmount: 186000, profitAmount: 28000, inventory: 580, momChange: -12.5, quadrant: 'problem' },
  { productId: 'p9', productName: 'F3 旧款清仓', categoryName: '日用品', salesVolume: 45, salesAmount: 42000, profitAmount: 5800, inventory: 420, momChange: -35.2, quadrant: 'problem' },
  { productId: 'p10', productName: 'H2 季节限定', categoryName: '食品', salesVolume: 82, salesAmount: 68000, profitAmount: 12000, inventory: 350, momChange: -18.6, quadrant: 'problem' },
];
