/**
 * 目标管理 - 数据映射工具
 * 将 API 响应映射为前端 UI 模型
 */
import type { CustomerTarget } from '@/types/target-management';
import type { InitDataResponse } from '@/services/api/sales-target';
import { CATEGORY_REMARK_SENTINEL } from '@/constants/target';

/**
 * 将 init-data API 响应映射为客户目标数组
 * 按上月实际销售额降序排列
 */
export function mapInitDataToCustomers(data: InitDataResponse): CustomerTarget[] {
  const customers = data.customers.map((c) => ({
    customerId: c.erpConsumerId ?? 0,
    customerName: c.consumerName,
    isPlannedNew: c.isPlannedNew,
    marketerId: data.marketerId,
    marketerName: data.marketerName,
    categories: c.categories
      .map((cat) => {
        const catRemarkItem = cat.products.find(
          (p) => p.goodsName === CATEGORY_REMARK_SENTINEL
        );
        const catRemark = catRemarkItem?.remark || '';
        return {
          categoryId: cat.categoryName,
          categoryName: cat.categoryName,
          targetAmount: cat.targetAmount,
          actualAmountLastMonth: cat.actualAmountLastMonth,
          actualAmountPrevMonth: cat.actualAmountPrevMonth,
          remark: catRemark,
          products: cat.products
            .filter((p) => p.goodsName !== CATEGORY_REMARK_SENTINEL)
            .map((p) => ({
              productId: String(p.erpGoodsId),
              productName: p.goodsName,
              unit: p.unit || '',
              unitPrice: p.unitPrice || 0,
              targetAmount: p.targetAmount,
              lastMonthTarget: 0,
              actualAmountLastMonth: p.actualAmountLastMonth,
              actualAmountPrevMonth: p.actualAmountPrevMonth,
              grossMarginRate: p.grossMarginRate || 0,
              remark: p.remark,
              isPlannedNew: false,
            }))
            .sort((a, b) => b.actualAmountLastMonth - a.actualAmountLastMonth),
        };
      })
      .sort((a, b) => b.actualAmountLastMonth - a.actualAmountLastMonth),
  }));
  return customers.sort((a, b) => {
    const sumA = a.categories.reduce((s, cat) => s + cat.actualAmountLastMonth, 0);
    const sumB = b.categories.reduce((s, cat) => s + cat.actualAmountLastMonth, 0);
    return sumB - sumA;
  });
}
