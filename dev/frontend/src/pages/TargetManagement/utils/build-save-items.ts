/**
 * 目标管理 - 保存项构建工具
 * 将前端客户目标数据转换为后端保存接口所需的格式
 */
import type { CustomerTarget } from '@/types/target-management';
import type { SaveTargetItemParam } from '@/services/api/sales-target';
import { CATEGORY_REMARK_SENTINEL } from '@/constants/target';

/**
 * 将客户目标数据扁平化为保存接口所需的 items 数组
 * 包含品类说明行（__category_remark__）
 */
export function buildSaveItems(
  customers: CustomerTarget[],
  selectedMarketerId: number,
): SaveTargetItemParam[] {
  const items: SaveTargetItemParam[] = [];
  for (const c of customers) {
    if (c.marketerId !== selectedMarketerId) continue;
    for (const cat of c.categories) {
      for (const p of cat.products) {
        items.push({
          erpConsumerId: c.customerId || null,
          consumerName: c.customerName,
          isPlannedNew: c.isPlannedNew,
          erpGoodsId: Number(p.productId) || null,
          goodsName: p.productName,
          categoryName: cat.categoryName,
          unit: p.unit,
          unitPrice: p.unitPrice,
          targetAmount: p.targetAmount,
          remark: p.remark,
        });
      }
      // 品类说明存储为合成品类说明行
      if (cat.remark) {
        items.push({
          erpConsumerId: c.customerId || null,
          consumerName: c.customerName,
          isPlannedNew: false,
          erpGoodsId: null,
          goodsName: CATEGORY_REMARK_SENTINEL,
          categoryName: cat.categoryName,
          unit: null,
          unitPrice: null,
          targetAmount: 0,
          remark: cat.remark,
        });
      }
    }
  }
  return items;
}
