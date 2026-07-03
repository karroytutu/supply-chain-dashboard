/**
 * ERP 结算单相关类型定义
 * @module services/erp-client/erp-settlement.types
 */

/** ERP 结算单（欠款明细） */
export interface ErpSettlementOrder {
  /** 欠款明细记录ID（list-debt-list API 返回，不可用于 update-hoard） */
  id: number;
  /** 结算单业务ID（update-hoard API 使用此ID标记压单） */
  bizId: number;
  bizStr: string;
  bizOrderStr: string;
  totalAmount: string;
  /** 已结金额（ERP 可能不返回，需兜底计算 totalAmount - leftAmount） */
  paidAmount?: string;
  leftAmount: string;
  workTime: string;
  billTypeName: string;
  collectState: string;
  /** 压单标记（结算单 API 返回字段名为 hoardTag，值为 'NORMAL' / 'HOARD'） */
  hoardTag?: string;
  /** 单据类型枚举（如 FUNDS_SALES, FUNDS_SALES_BACK, INIT），对账单 save 接口需要 */
  billTypeEnum?: string;
  [key: string]: unknown;
}

/** 分页查询结果 */
export interface ErpSettlementOrderPagedResult {
  records: ErpSettlementOrder[];
  total: number;
  page: number;
  pageSize: number;
}
