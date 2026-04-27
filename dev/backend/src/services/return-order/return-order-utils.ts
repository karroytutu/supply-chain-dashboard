/**
 * 退货单工具函数
 * mapRowToReturnOrder 和 recordAction 已迁移到 return-order.mapper.ts 和 return-order.repository.ts
 */

import type { ReturnOrderStatus } from './return-order.types';

/** 数据库行类型 */
export interface ReturnOrderRow {
  id: number;
  return_no: string;
  goods_id: string;
  goods_name: string;
  quantity: number;
  unit: string | null;
  batch_date: Date | null;
  return_date: Date | null;
  expire_date: Date | null;
  shelf_life: number | null;
  days_to_expire: number | null;
  days_to_expire_at_return: number | null;
  calculated_days_to_expire?: number | null;
  status: ReturnOrderStatus;
  source_bill_no: string | null;
  consumer_name: string | null;
  marketing_manager: string | null;
  erp_return_no: string | null;
  erp_filled_by: number | null;
  erp_filled_at: Date | null;
  warehouse_executed_by: number | null;
  warehouse_executed_at: Date | null;
  warehouse_return_quantity: number | null;
  warehouse_evidence_url: string | null;
  warehouse_comment: string | null;
  marketing_completed_by: number | null;
  marketing_completed_at: Date | null;
  marketing_comment: string | null;
  rule_id: number | null;
  purchase_price: number | null;
  rule_confirmed_at: Date | null;
  rule_confirmed_by: number | null;
  created_at: Date;
  updated_at: Date;
  erp_filler_name?: string | null;
  warehouse_executor_name?: string | null;
  marketing_completer_name?: string | null;
  current_stock?: number | null;
  current_stock_display?: string | null;
  current_stock_unit?: string | null;
}
