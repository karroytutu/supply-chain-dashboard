/**
 * 目标追踪板块类型定义
 */

/** 营销师排名行 */
export interface MarketerRankRow {
  marketerId: string;
  marketerName: string;
  targetAmount: number;
  salesAmount: number;
  completionRate: number;
  collectionAmount: number;
  collectionRate: number;
  expenseAmount: number;
  expenseSalesRatio: number;
  collectedProfit: number;
  estimatedCommission: number;
  /** 是否标记为异常 */
  isAlert: boolean;
  /** 异常原因 */
  alertReason?: string;
  /** 名下客户列表 */
  customers: MarketerCustomerRow[];
}

/** 营销师名下客户行 */
export interface MarketerCustomerRow {
  customerId: string;
  customerName: string;
  targetAmount: number;
  actualAmount: number;
  completionRate: number;
  gap: number;
  /** 品类明细 */
  categories: CustomerCategoryRow[];
}

/** 客户品类行 */
export interface CustomerCategoryRow {
  categoryId: string;
  categoryName: string;
  targetAmount: number;
  actualAmount: number;
  completionRate: number;
  gap: number;
  /** 商品明细 */
  products: CategoryProductRow[];
}

/** 品类商品行 */
export interface CategoryProductRow {
  productId: string;
  productName: string;
  targetAmount: number;
  actualAmount: number;
  completionRate: number;
  gap: number;
}

/** 目标追踪整体数据 */
export interface TargetTrackingOverview {
  monthLabel: string;
  timeProgress: number;
  timeProgressDays: number;
  totalDays: number;
  totalTargetAmount: number;
  totalActualAmount: number;
  completionRate: number;
  /** 按当前速度预测的月末完成率 */
  predictedCompletionRate: number;
}
