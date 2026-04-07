/**
 * 退货考核类型定义
 */

import type { PaginatedResult } from '../warning/warning.types';

/** 考核类型 */
export type PenaltyType =
  | 'procurement_confirm_timeout'    // 规则1: 采购确认超时
  | 'marketing_sale_timeout'         // 规则2: 营销销售超时
  | 'return_expire_insufficient'     // 规则3: 退货时保质期不足
  | 'erp_fill_timeout'               // 规则4: ERP录入超时
  | 'warehouse_execute_timeout';     // 规则5: 仓储执行超时

/** 考核对象角色 */
export type PenaltyRole = 'procurement_manager' | 'marketing_manager' | 'warehouse_manager' | 'warehouse_keeper' | 'logistics_manager';

/** 考核记录状态 */
export type PenaltyStatus = 'pending' | 'confirmed' | 'appealed' | 'cancelled';

/** 考核记录实体 */
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
  penaltyRuleSnapshot: Record<string, any> | null;
  calculatedAt: Date;
  createdAt: Date;
  updatedAt: Date;
  // 关联信息
  returnNo?: string;
  goodsName?: string;
  quantity?: number;
}

/** 考核记录查询参数 */
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

/** 考核统计数据 */
export interface PenaltyStats {
  totalAmount: number;           // 总考核金额
  pendingCount: number;          // 待确认数量
  pendingAmount: number;         // 待确认金额
  confirmedCount: number;        // 已确认数量
  confirmedAmount: number;       // 已确认金额
  userCount: number;             // 涉及人数
  todayCount: number;            // 今日新增
  todayAmount: number;           // 今日新增金额
  // 按类型统计
  byType: {
    type: PenaltyType;
    typeName: string;
    count: number;
    amount: number;
  }[];
}

/** 创建考核记录参数 */
export interface CreatePenaltyParams {
  returnOrderId: number;
  penaltyType: PenaltyType;
  penaltyUserId: number;
  penaltyUserName: string;
  penaltyRole: PenaltyRole;
  baseAmount: number;
  penaltyRate: number;
  overdueDays: number;
  penaltyAmount: number;
  penaltyRuleSnapshot?: Record<string, any>;
}

/** 更新考核状态参数 */
export interface UpdatePenaltyStatusParams {
  id: number;
  status: PenaltyStatus;
  operatorId: number;
  operatorName: string;
  comment?: string;
}

/** 考核规则配置 */
export interface PenaltyRuleConfig {
  type: PenaltyType;
  name: string;
  description: string;
  deadlineDays: number;        // 截止天数
  penaltyPerDay: number;       // 每天考核金额
  penaltyFullAmount: boolean;  // 是否全额考核
}

/** 考核规则常量 */
export const PENALTY_RULES: Record<PenaltyType, PenaltyRuleConfig> = {
  procurement_confirm_timeout: {
    type: 'procurement_confirm_timeout',
    name: '采购确认超时考核',
    description: '退货单创建后，采购主管未在当天确认规则，超时期间按 10元/天/单 累计考核',
    deadlineDays: 0,
    penaltyPerDay: 10,
    penaltyFullAmount: false,
  },
  marketing_sale_timeout: {
    type: 'marketing_sale_timeout',
    name: '营销未完成销售考核',
    description: '无法采购退货的商品过期前未清仓，按商品进价全额考核营销师',
    deadlineDays: 0,
    penaltyPerDay: 0,
    penaltyFullAmount: true,
  },
  return_expire_insufficient: {
    type: 'return_expire_insufficient',
    name: '退货时保质期不足考核',
    description: '退货时剩余保质期低于15天，按商品进价全额考核营销师',
    deadlineDays: 15,
    penaltyPerDay: 0,
    penaltyFullAmount: true,
  },
  erp_fill_timeout: {
    type: 'erp_fill_timeout',
    name: 'ERP录入超时考核',
    description: '采购确认后30天内未录入ERP，超时期间按 10元/天/单 累计考核',
    deadlineDays: 30,
    penaltyPerDay: 10,
    penaltyFullAmount: false,
  },
  warehouse_execute_timeout: {
    type: 'warehouse_execute_timeout',
    name: '仓储执行超时考核',
    description: 'ERP录入后7天内未完成退货执行，超时期间按 10元/天/SKU 累计考核',
    deadlineDays: 7,
    penaltyPerDay: 10,
    penaltyFullAmount: false,
  },
};

/** 考核类型中文名称映射 */
export const PENALTY_TYPE_NAMES: Record<PenaltyType, string> = {
  procurement_confirm_timeout: '采购确认超时',
  marketing_sale_timeout: '营销销售超时',
  return_expire_insufficient: '退货保质期不足',
  erp_fill_timeout: 'ERP录入超时',
  warehouse_execute_timeout: '仓储执行超时',
};

/** 考核角色中文名称映射 */
export const PENALTY_ROLE_NAMES: Record<PenaltyRole, string> = {
  procurement_manager: '采购主管',
  marketing_manager: '营销师',
  warehouse_manager: '仓储主管',
  warehouse_keeper: '库管员',
  logistics_manager: '物流主管',
};

export type PenaltyListResult = PaginatedResult<PenaltyRecord>;
