/**
 * 目标管理 - DTO Mapper
 * 负责请求体 camelCase → snake_case 转换
 * @usedBy sales-target.controller.ts
 */
import type { SaveTargetItemParams } from './sales-target.types';
import { CATEGORY_REMARK_SENTINEL } from './sales-target.types';

/** 原始请求项类型（兼容 camelCase 和 snake_case 两种命名） */
interface RawSaveItem {
  erp_consumer_id?: number | null;
  erpConsumerId?: number | null;
  consumer_name?: string;
  consumerName?: string;
  is_planned_new?: boolean;
  isPlannedNew?: boolean;
  erp_goods_id?: number | null;
  erpGoodsId?: number | null;
  goods_name?: string;
  goodsName?: string;
  category_name?: string | null;
  categoryName?: string | null;
  unit?: string | null;
  unit_price?: number | null;
  unitPrice?: number | null;
  target_amount?: number;
  targetAmount?: number;
  remark?: string;
}

/**
 * 将前端请求项转为 snake_case 的 SaveTargetItemParams
 * 兼容前端发送 camelCase 或 snake_case 两种格式
 */
export function fromSaveItemDTO(item: RawSaveItem): SaveTargetItemParams {
  return {
    erp_consumer_id: item.erp_consumer_id ?? item.erpConsumerId ?? null,
    consumer_name: item.consumer_name ?? item.consumerName ?? '',
    is_planned_new: item.is_planned_new ?? item.isPlannedNew ?? false,
    erp_goods_id: item.erp_goods_id ?? item.erpGoodsId ?? null,
    goods_name: item.goods_name ?? item.goodsName ?? '',
    category_name: item.category_name ?? item.categoryName ?? null,
    unit: item.unit ?? null,
    unit_price: item.unit_price ?? item.unitPrice ?? null,
    target_amount: item.target_amount ?? item.targetAmount ?? 0,
    remark: item.remark ?? '',
  };
}

/**
 * 校验请求体 items 数组结构
 * 返回 null 表示校验通过，否则返回错误信息
 */
export function validateSaveItems(items: unknown): string | null {
  if (!Array.isArray(items)) {
    return 'items 必须是数组';
  }
  if (items.length === 0) {
    return 'items 不能为空';
  }
  if (items.length > 1000) {
    return 'items 数量不能超过 1000';
  }
  for (let i = 0; i < items.length; i++) {
    const item = items[i] as Record<string, unknown>;
    const targetAmount = item.target_amount ?? item.targetAmount;
    if (targetAmount !== undefined && typeof targetAmount !== 'number') {
      return `items[${i}].target_amount 必须为数字`;
    }
    const consumerId = item.erp_consumer_id ?? item.erpConsumerId;
    if (consumerId !== null && consumerId !== undefined && typeof consumerId !== 'number') {
      return `items[${i}].erp_consumer_id 必须为数字或 null`;
    }
    // 品类说明行跳过 goods_name 校验
    const goodsName = (item.goods_name ?? item.goodsName ?? '') as string;
    if (goodsName !== CATEGORY_REMARK_SENTINEL && !goodsName.trim()) {
      return `items[${i}].goods_name 不能为空`;
    }
    const consumerName = (item.consumer_name ?? item.consumerName ?? '') as string;
    if (!consumerName.trim()) {
      return `items[${i}].consumer_name 不能为空`;
    }
  }
  return null;
}
