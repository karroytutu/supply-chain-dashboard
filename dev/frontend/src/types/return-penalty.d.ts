/**
 * 退货考核类型定义
 */
import type { PaginatedResult as BasePaginatedResult } from './warning';

/** 分页结果 - 重新导出以兼容现有代码 */
export type PaginatedResult<T> = BasePaginatedResult<T>;

/** 考核类型 */
export type PenaltyType =
  | 'procurement_confirm_timeout'
  | 'marketing_sale_timeout'
  | 'return_expire_insufficient'
  | 'erp_fill_timeout'
  | 'warehouse_execute_timeout';

/** 考核对象角色 */
export type PenaltyRole = 'procurement_manager' | 'marketing_manager' | 'warehouse_manager' | 'warehouse_keeper' | 'logistics_manager';

/** 考核记录状态 */
export type PenaltyStatus = 'pending' | 'confirmed' | 'appealed' | 'cancelled';

/** 考核记录 */
export interface PenaltyRecord {
  id: number;
  returnOrderId: number;
  penaltyType: PenaltyType;
  penaltyUserId: number;
  penaltyUserName: string;
  penaltyRole: PenaltyRole;
  baseAmount: number;
  penaltyRate: number;
  overdueDays: number;
  penaltyAmount: number;
  status: PenaltyStatus;
  calculatedAt: string;
  createdAt: string;
  // 关联信息
  returnNo?: string;
  goodsName?: string;
  quantity?: number;
}

/** 考核查询参数 */
export interface PenaltyQueryParams {
  page?: number;
  pageSize?: number;
  penaltyType?: PenaltyType;
  penaltyUserId?: number;
  penaltyRole?: PenaltyRole;
  status?: PenaltyStatus;
  startDate?: string;
  endDate?: string;
  keyword?: string;
}

/** 考核统计 */
export interface PenaltyStats {
  totalAmount: number;
  pendingCount: number;
  pendingAmount: number;
  confirmedCount: number;
  confirmedAmount: number;
  userCount: number;
  todayCount: number;
  todayAmount: number;
  byType: {
    type: PenaltyType;
    typeName: string;
    count: number;
    amount: number;
  }[];
}

/** 考核类型名称映射 */
export const PENALTY_TYPE_NAMES: Record<PenaltyType, string> = {
  procurement_confirm_timeout: '采购确认超时',
  marketing_sale_timeout: '营销销售超时',
  return_expire_insufficient: '退货保质期不足',
  erp_fill_timeout: 'ERP录入超时',
  warehouse_execute_timeout: '仓储执行超时',
};

/** 考核角色名称映射 */
export const PENALTY_ROLE_NAMES: Record<PenaltyRole, string> = {
  procurement_manager: '采购主管',
  marketing_manager: '营销师',
  warehouse_manager: '仓储主管',
  warehouse_keeper: '库管员',
  logistics_manager: '物流主管',
};

/** 考核状态名称映射 */
export const PENALTY_STATUS_NAMES: Record<PenaltyStatus, string> = {
  pending: '待确认',
  confirmed: '已确认',
  appealed: '已申诉',
  cancelled: '已取消',
};
