/**
 * 目标管理 - CRUD 操作 Hook
 * 管理客户/商品的增删操作
 */
import { useCallback } from 'react';
import type { CustomerTarget, ProductTarget } from '@/types/target-management';
import type { MarketerItem } from '@/services/api/sales-target';

interface UseTargetCrudActionsParams {
  customers: CustomerTarget[];
  setCustomers: (customers: CustomerTarget[] | ((prev: CustomerTarget[]) => CustomerTarget[])) => void;
  selectedMarketerId: number | null;
  marketers: MarketerItem[];
}

export function useTargetCrudActions({
  customers,
  setCustomers,
  selectedMarketerId,
  marketers,
}: UseTargetCrudActionsParams) {
  // 添加客户（使用 prev 参数检查重复，避免捕获 customers 导致不稳定引用）
  const handleAddCustomers = useCallback(
    (newCustomers: Array<{ customerId: number; customerName: string }>) => {
      if (!selectedMarketerId) return;
      const marketerName = marketers.find((m) => m.id === selectedMarketerId)?.name || '';
      setCustomers((prev) => {
        const existingIds = new Set(prev.map((c) => c.customerId));
        const additions: CustomerTarget[] = newCustomers
          .filter((nc) => !existingIds.has(nc.customerId))
          .map((nc) => ({
            customerId: nc.customerId, customerName: nc.customerName,
            isPlannedNew: true, marketerId: selectedMarketerId!, marketerName, categories: [],
          }));
        return [...prev, ...additions];
      });
    },
    [selectedMarketerId, marketers, setCustomers],
  );

  // 添加商品到客户
  const handleAddProducts = useCallback(
    (customerId: number, products: Array<{ productId: string; productName: string; categoryId: string; categoryName: string; unit: string; unitPrice: number }>) => {
      setCustomers((prev) =>
        prev.map((c) => {
          if (c.customerId !== customerId) return c;
          const cats = [...c.categories];
          for (const np of products) {
            let catIdx = cats.findIndex((cat) => cat.categoryId === np.categoryId);
            if (catIdx === -1) {
              cats.push({
                categoryId: np.categoryId,
                categoryName: np.categoryName,
                targetAmount: 0,
                actualAmountLastMonth: 0,
                actualAmountPrevMonth: 0,
                remark: '',
                products: [],
              });
              catIdx = cats.length - 1;
            }
            const existingIds = new Set(cats[catIdx].products.map((p) => p.productId));
            if (!existingIds.has(np.productId)) {
              const newProduct: ProductTarget = {
                productId: np.productId,
                productName: np.productName,
                unit: np.unit,
                unitPrice: np.unitPrice,
                targetAmount: 0,
                lastMonthTarget: 0,
                actualAmountLastMonth: 0,
                actualAmountPrevMonth: 0,
                grossMarginRate: 0,
                remark: '',
                isPlannedNew: true,
              };
              cats[catIdx] = {
                ...cats[catIdx],
                products: [...cats[catIdx].products, newProduct],
              };
            }
          }
          return { ...c, categories: cats };
        }),
      );
    },
    [setCustomers],
  );

  // 删除客户
  const handleRemoveCustomer = useCallback(
    (customerId: number) => { setCustomers((prev) => prev.filter((c) => c.customerId !== customerId)); },
    [setCustomers],
  );

  return { handleAddCustomers, handleAddProducts, handleRemoveCustomer };
}
