/**
 * 催收欠款共享类型定义
 * 统一 ERP 欠款记录接口，消除多文件重复定义
 * 供任务生成器、预警查询、预警提醒、同步任务共用
 */

// ============================================
// ERP 原始欠款记录
// ============================================

/** ERP 欠款原始记录（来自 "客户欠款明细" 视图） */
export interface ERPDebtRecord {
  billId: string;
  bizStr?: string;              // 结算单号（warning.query 有此字段）
  bizOrderStr: string;          // 订单号（单据编号）
  consumerName: string;
  managerUsers: string;
  totalAmount: number;
  leftAmount: number;
  settleMethod: number;
  consumerExpireDay: number;
  billTypeName: string;
  workTime: string;
  hoardTag?: string | null;      // 压单标记（视图可能包含）
}

// ============================================
// 客户限额信息
// ============================================

/** 客户限额信息（来自 ERP 客户档案） */
export interface CustomerLimits {
  traderId: number | null;
  maxDebtOrderNum: number | null;
  maxDebtDays: number | null;
  maxDebtAmount: number | null;
}

// ============================================
// 富化后的欠款记录
// ============================================

/** 富化后的欠款记录（所有消费者共用） */
export interface EnrichedDebtRecord extends ERPDebtRecord {
  // 压单标记（来自 ERP 结算单 API，null 表示获取失败或不可用）
  hoardTag: 'NORMAL' | 'HOARD' | null;
  // ERP 客户 ID
  traderId: number | null;

  // 计算字段（由富化服务从 settleMethod + consumerExpireDay + workTime 计算）
  overdueDays: number;
  overdueDateStr: string;
  maxAllowedDays: number;
  isOverdue: boolean;

  // 客户限额（来自 ERP 客户档案）
  customerMaxDebtOrderNum: number | null;
  customerMaxDebtDays: number | null;
  customerMaxDebtAmount: number | null;
}
