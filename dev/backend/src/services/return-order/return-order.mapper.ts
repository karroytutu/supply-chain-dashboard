/**
 * 退货单 DTO 映射器
 * 负责数据库实体(snake_case) ↔ API DTO(camelCase) 的双向转换
 */

import { toCamelKeys, toSnakeKeys } from '../../utils/keyConvert';
import type { ReturnOrderRow } from './return-order-utils';
import type {
  ReturnOrder,
  ReturnAction,
  ReturnOrderStats,
  CreateReturnOrderParams,
} from './return-order.types';

// ==================== 实体 → DTO（用于响应） ====================

/**
 * 退货单行 → ReturnOrder 实体
 * 使用 toCamelKeys 做键名转换，额外处理数值精度和计算字段
 */
export function toReturnOrderDTO(row: ReturnOrderRow): ReturnOrder {
  const base = toCamelKeys<any>(row);
  return {
    ...base,
    // 数值精度修正：数据库返回的 numeric 字段可能是字符串
    quantity: parseFloat(row.quantity as any) || 0,
    daysToExpire: row.calculated_days_to_expire ?? row.days_to_expire,
    warehouseReturnQuantity: row.warehouse_return_quantity
      ? parseFloat(row.warehouse_return_quantity as any)
      : null,
    purchasePrice: row.purchase_price ? parseFloat(row.purchase_price as any) : null,
    // 关联字段映射
    erpFillerName: row.erp_filler_name || undefined,
    warehouseExecutorName: row.warehouse_executor_name || undefined,
    marketingCompleterName: row.marketing_completer_name || undefined,
    // 库存信息
    currentStock: row.current_stock ?? null,
    currentStockDisplay: row.current_stock_display ?? undefined,
    currentStockUnit: row.current_stock_unit ?? undefined,
  };
}

/**
 * 操作记录数据库行类型
 */
export interface ReturnActionRow {
  id: number;
  order_id: number;
  action_type: string;
  operator_id: number | null;
  operator_name: string | null;
  action_at: Date;
  comment: string | null;
  details: Record<string, any> | null;
}

/**
 * 操作记录行 → ReturnAction 实体
 */
export function toReturnActionDTO(row: ReturnActionRow): ReturnAction {
  return toCamelKeys<any>(row) as ReturnAction;
}

/**
 * 统计行数据库行类型
 */
export interface ReturnOrderStatsRow {
  pending_confirm?: string;
  pending_erp_fill?: string;
  pending_warehouse_execute?: string;
  pending_marketing_sale?: string;
  completed?: string;
  total?: string;
}

/**
 * 统计行 → ReturnOrderStats
 */
export function toReturnOrderStatsDTO(row: ReturnOrderStatsRow): ReturnOrderStats {
  return {
    pendingConfirm: parseInt(row?.pending_confirm as any) || 0,
    pendingErpFill: parseInt(row?.pending_erp_fill as any) || 0,
    pendingWarehouseExecute: parseInt(row?.pending_warehouse_execute as any) || 0,
    pendingMarketingSale: parseInt(row?.pending_marketing_sale as any) || 0,
    completed: parseInt(row?.completed as any) || 0,
    total: parseInt(row?.total as any) || 0,
  };
}

// ==================== DTO → 实体参数（用于请求） ====================

/**
 * 创建退货单请求 → 数据库插入参数
 */
export function fromCreateReturnOrderDTO(dto: CreateReturnOrderParams): unknown {
  return toSnakeKeys(dto);
}
