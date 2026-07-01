/**
 * 目标管理模块类型定义
 * 用于营销师目标制定、品类商品分层编辑
 */

/** 拆分方式 */
export type SplitMethod = 'by_proportion' | 'even';

/** 目标月份 */
export interface TargetMonth {
  year: number;
  month: number; // 1-12
}

/** 商品目标 */
export interface ProductTarget {
  productId: string;
  productName: string;
  unit: string;
  unitPrice: number;
  /** 上月目标 */
  lastMonthTarget: number;
  /** 上月实际 */
  actualAmountLastMonth: number;
  /** 上上月实际（用于计算环比） */
  actualAmountPrevMonth: number;
  /** 本月目标 */
  targetAmount: number;
  remark: string;
  isPlannedNew: boolean;
}

/** 品类目标 */
export interface CategoryTarget {
  categoryId: string;
  categoryName: string;
  targetAmount: number;
  actualAmountLastMonth: number;
  actualAmountPrevMonth: number;
  products: ProductTarget[];
}

/** 客户目标 */
export interface CustomerTarget {
  customerId: number;
  customerName: string;
  isPlannedNew: boolean;
  marketerId: number;
  marketerName: string;
  categories: CategoryTarget[];
}

/** 汇总数据 */
export interface TargetSummary {
  totalTargetAmount: number;
  marketerCount: number;
  coveredCustomers: number;
  totalCustomers: number;
  coveredProducts: number;
  totalProducts: number;
  amountPerMarketer: number;
  amountPerCustomer: number;
  completionRate: number | null;
  fillProgress: number;
}
