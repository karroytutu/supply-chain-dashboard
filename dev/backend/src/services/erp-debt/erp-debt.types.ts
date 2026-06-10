/**
 * 催收欠款共享类型定义
 * 统一 ERP 欠款记录接口，消除多文件重复定义
 * 供任务生成器、预警查询、预警提醒、同步任务共用
 */

import { type ArHoldType, AR_HOARD_TAG_NORMAL, AR_HOARD_TAG_HOARD } from '../../utils/constants';

// ============================================
// ERP 原始欠款记录
// ============================================

/** ERP 欠款原始记录（来自 "客户欠款明细" 视图） */
export interface ERPDebtRecord {
  billId: string;
  bizStr?: string; // 结算单号（warning.query 有此字段）
  bizOrderStr: string; // 订单号（单据编号）
  consumerName: string;
  managerUsers: string;
  totalAmount: number;
  leftAmount: number;
  settleMethod: number;
  consumerExpireDay: number;
  billTypeName: string;
  workTime: string;
  hoardTag?: string | null; // 压单标记（视图可能包含）
  writeOffAmount: number; // 已结金额（核销金额）
  billNote: string; // 单据备注，如 "XD241107000036访销订单"
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
  hoardTag: typeof AR_HOARD_TAG_NORMAL | typeof AR_HOARD_TAG_HOARD | null;
  // 压单类型（来自本地 ar_collection_details，null 表示非压单或未对账）
  holdType: ArHoldType | null;
  // 期限压单到期日（ISO 日期字符串，仅 time_limited 有效）
  holdUntil: string | null;
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
