/**
 * 目标追踪板块模拟数据
 */
import type { TargetTrackingOverview, MarketerRankRow } from '@/types/sales-analysis';

export const TARGET_OVERVIEW: TargetTrackingOverview = {
  monthLabel: '2026年7月',
  timeProgress: 86.7,
  timeProgressDays: 26,
  totalDays: 30,
  totalTargetAmount: 5800000,
  totalActualAmount: 3620000,
  completionRate: 62.4,
  predictedCompletionRate: 72.0,
};

export const MARKETER_RANKINGS: MarketerRankRow[] = [
  {
    marketerId: 'm1',
    marketerName: '张晨',
    targetAmount: 1800000,
    salesAmount: 1350000,
    completionRate: 75.0,
    collectionAmount: 1080000,
    collectionRate: 80.0,
    expenseAmount: 142000,
    expenseSalesRatio: 10.5,
    collectedProfit: 286000,
    estimatedCommission: 23880,
    isAlert: false,
    customers: [
      {
        customerId: 'c1', customerName: '张三商贸',
        targetAmount: 550000, actualAmount: 420000, completionRate: 76.4, gap: 130000,
        categories: [
          {
            categoryId: 'cat1', categoryName: '饮料',
            targetAmount: 250000, actualAmount: 200000, completionRate: 80.0, gap: 50000,
            products: [
              { productId: 'p1', productName: 'A12 智能终端', targetAmount: 150000, actualAmount: 130000, completionRate: 86.7, gap: 20000 },
              { productId: 'p2', productName: 'M8 套装配件', targetAmount: 100000, actualAmount: 70000, completionRate: 70.0, gap: 30000 },
            ],
          },
          {
            categoryId: 'cat2', categoryName: '食品',
            targetAmount: 300000, actualAmount: 220000, completionRate: 73.3, gap: 80000,
            products: [
              { productId: 'p3', productName: 'G4 入门机型', targetAmount: 180000, actualAmount: 140000, completionRate: 77.8, gap: 40000 },
            ],
          },
        ],
      },
      {
        customerId: 'c2', customerName: '李四超市',
        targetAmount: 620000, actualAmount: 480000, completionRate: 77.4, gap: 140000,
        categories: [
          {
            categoryId: 'cat1', categoryName: '饮料',
            targetAmount: 400000, actualAmount: 320000, completionRate: 80.0, gap: 80000,
            products: [
              { productId: 'p1', productName: 'A12 智能终端', targetAmount: 250000, actualAmount: 210000, completionRate: 84.0, gap: 40000 },
            ],
          },
        ],
      },
      {
        customerId: 'c3', customerName: '王五便利',
        targetAmount: 430000, actualAmount: 310000, completionRate: 72.1, gap: 120000,
        categories: [],
      },
      {
        customerId: 'c5', customerName: '百联集团',
        targetAmount: 200000, actualAmount: 140000, completionRate: 70.0, gap: 60000,
        categories: [],
      },
    ],
  },
  {
    marketerId: 'm2',
    marketerName: '李洋',
    targetAmount: 2000000,
    salesAmount: 1080000,
    completionRate: 54.0,
    collectionAmount: 648000,
    collectionRate: 60.0,
    expenseAmount: 118000,
    expenseSalesRatio: 10.9,
    collectedProfit: 185000,
    estimatedCommission: 12950,
    isAlert: true,
    alertReason: '完成率严重落后时间进度',
    customers: [
      {
        customerId: 'c6', customerName: '家乐福',
        targetAmount: 1200000, actualAmount: 680000, completionRate: 56.7, gap: 520000,
        categories: [],
      },
      {
        customerId: 'c7', customerName: '盒马鲜生',
        targetAmount: 800000, actualAmount: 400000, completionRate: 50.0, gap: 400000,
        categories: [],
      },
    ],
  },
  {
    marketerId: 'm3',
    marketerName: '周凯',
    targetAmount: 2000000,
    salesAmount: 1190000,
    completionRate: 59.5,
    collectionAmount: 553000,
    collectionRate: 46.5,
    expenseAmount: 125000,
    expenseSalesRatio: 10.5,
    collectedProfit: 163000,
    estimatedCommission: 11410,
    isAlert: true,
    alertReason: '回款率低于50%',
    customers: [
      {
        customerId: 'c9', customerName: '永辉超市',
        targetAmount: 1100000, actualAmount: 680000, completionRate: 61.8, gap: 420000,
        categories: [],
      },
      {
        customerId: 'c10', customerName: '大润发',
        targetAmount: 900000, actualAmount: 510000, completionRate: 56.7, gap: 390000,
        categories: [],
      },
    ],
  },
];
