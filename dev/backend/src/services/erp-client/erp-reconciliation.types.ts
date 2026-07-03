/**
 * ERP 对账单相关类型定义
 * @module services/erp-client/erp-reconciliation.types
 */

/** 应收单据（扩展版，包含对账单 save 接口需要的 bizId 和 billTypeEnum） */
export interface ReceivableOrder {
  /** 欠款记录ID → save 接口的 billId */
  id: number;
  /** 业务ID → save 接口的 bizId */
  bizId: number;
  /** 业务类型（内部枚举：SALES/RETURNED），不用于 save 接口 */
  bizType: string;
  /** 单据类型枚举（FUNDS_SALES/FUNDS_SALES_BACK）→ save 接口的 bizType */
  billTypeEnum: string;
  bizStr?: string;
  bizOrderStr?: string;
  totalAmount: string;
  leftAmount: string;
  billTypeName: string;
  workTime: string;
  salesmanId?: number;
  note?: string;
}

/** 对账单明细项（save 接口的 detail 数组元素） */
export interface StatementDetailItem {
  billId: number;
  bizId: number;
  leftAmount: string;
  totalAmount: string;
  note: string | null;
  bizType: string;
  seq: number;
}
