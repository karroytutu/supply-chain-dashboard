/**
 * 目标管理模块类型定义
 * 用于营销师目标制定、审批、跟踪的全流程
 */

/** 目标状态 */
export type TargetStatus = 'draft' | 'pending' | 'approved' | 'rejected';

/** 拆分方式 */
export type SplitMethod = 'by_proportion' | 'even';

/** 目标月份 */
export interface TargetMonth {
  year: number;
  month: number; // 1-12
}

/** 营销师 */
export interface Marketer {
  id: string;
  name: string;
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
  customerId: string;
  customerName: string;
  isPlannedNew: boolean;
  marketerId: string;
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

/** 审批状态显示配置 */
export interface StatusConfig {
  label: string;
  color: string;
  tagColor: 'gold' | 'blue' | 'green' | 'red' | 'default';
}

/** 用户角色（审批相关） */
export type UserRole = 'marketer' | 'manager';

/** 审批操作 */
export type ApprovalAction = 'save_draft' | 'submit' | 'withdraw' | 'approve' | 'reject' | 'resubmit';

/** 目标进展 - 营销师排名 */
export interface MarketerProgress {
  marketerId: string;
  marketerName: string;
  targetAmount: number;
  actualAmount: number;
  completionRate: number;
  isOnTrack: boolean;
  customers: CustomerProgress[];
}

/** 目标进展 - 客户进展 */
export interface CustomerProgress {
  customerId: string;
  customerName: string;
  targetAmount: number;
  actualAmount: number;
  completionRate: number;
  isOnTrack: boolean;
  categories: CategoryProgress[];
}

/** 目标进展 - 品类进展 */
export interface CategoryProgress {
  categoryId: string;
  categoryName: string;
  targetAmount: number;
  actualAmount: number;
  completionRate: number;
  products: ProductProgress[];
}

/** 目标进展 - 商品进展 */
export interface ProductProgress {
  productId: string;
  productName: string;
  targetAmount: number;
  actualAmount: number;
  completionRate: number;
}

/** 看板目标进展总览 */
export interface TargetProgressOverview {
  month: TargetMonth;
  timeProgress: number;
  timeProgressDays: number;
  totalDays: number;
  totalTargetAmount: number;
  totalActualAmount: number;
  completionRate: number;
  isOnTrack: boolean;
  marketers: MarketerProgress[];
}
