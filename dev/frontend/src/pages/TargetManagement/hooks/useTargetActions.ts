/**
 * 目标管理 - 操作 Hook
 * 管理目标增删改保存操作
 */
import { useCallback } from 'react';
import { message } from 'antd';
import type { TargetMonth, CustomerTarget, SplitMethod } from '@/types/target-management';
import { splitByProportion, splitEvenly } from './useTargetCalculation';
import { createTarget, updateTarget } from '@/services/api/sales-target';
import type { MarketerItem, SaveTargetItemParam } from '@/services/api/sales-target';

interface UseTargetActionsParams {
  customers: CustomerTarget[];
  setCustomers: React.Dispatch<React.SetStateAction<CustomerTarget[]>>;
  selectedMarketerId: number | null;
  marketers: MarketerItem[];
  currentTargetId: number | null;
  currentMonth: TargetMonth;
  loadTargetData: () => void;
}

export function useTargetActions({
  customers,
  setCustomers,
  selectedMarketerId,
  marketers,
  currentTargetId,
  currentMonth,
  loadTargetData,
}: UseTargetActionsParams) {
  // 更新商品目标
  const handleUpdateProduct = useCallback(
    (
      customerId: number,
      categoryId: string,
      productId: string,
      field: 'targetAmount' | 'remark',
      value: number | string,
    ) => {
      setCustomers((prev) =>
        prev.map((c) => {
          if (c.customerId !== customerId) return c;
          return {
            ...c,
            categories: c.categories.map((cat) => {
              if (cat.categoryId !== categoryId) return cat;
              return {
                ...cat,
                products: cat.products.map((p) => {
                  if (p.productId !== productId) return p;
                  return { ...p, [field]: value };
                }),
              };
            }),
          };
        }),
      );
    },
    [setCustomers],
  );

  // 保存目标
  const handleSave = useCallback(async () => {
    if (!selectedMarketerId) {
      message.warning('请先选择一个营销师');
      return;
    }

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
      }
    }

    try {
      if (currentTargetId) {
        await updateTarget(currentTargetId, items);
        message.success('目标已更新');
      } else {
        await createTarget({
          marketerId: selectedMarketerId,
          year: currentMonth.year,
          month: currentMonth.month,
          items,
        });
        message.success('目标已创建');
      }
      loadTargetData();
    } catch (error: any) {
      message.error(error?.message || '保存失败');
    }
  }, [selectedMarketerId, customers, currentTargetId, currentMonth, loadTargetData]);

  // 添加客户
  const handleAddCustomers = useCallback(
    (newCustomers: Array<{ customerId: number; customerName: string }>) => {
      if (!selectedMarketerId) return;
      const existingIds = new Set(customers.map((c) => c.customerId));
      const marketerName = marketers.find((m) => m.id === selectedMarketerId)?.name || '';
      const additions: CustomerTarget[] = newCustomers
        .filter((nc) => !existingIds.has(nc.customerId))
        .map((nc) => ({
          customerId: nc.customerId,
          customerName: nc.customerName,
          isPlannedNew: true,
          marketerId: selectedMarketerId,
          marketerName,
          categories: [],
        }));
      setCustomers((prev) => [...prev, ...additions]);
    },
    [customers, selectedMarketerId, marketers, setCustomers],
  );

  // 添加商品到客户
  const handleAddProducts = useCallback(
    (
      customerId: number,
      products: Array<{
        productId: string;
        productName: string;
        categoryId: string;
        categoryName: string;
        unit: string;
        unitPrice: number;
      }>,
    ) => {
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
                products: [],
              });
              catIdx = cats.length - 1;
            }
            const existingIds = new Set(cats[catIdx].products.map((p) => p.productId));
            if (!existingIds.has(np.productId)) {
              cats[catIdx] = {
                ...cats[catIdx],
                products: [
                  ...cats[catIdx].products,
                  {
                    productId: np.productId,
                    productName: np.productName,
                    unit: np.unit,
                    unitPrice: np.unitPrice,
                    targetAmount: 0,
                    lastMonthTarget: 0,
                    actualAmountLastMonth: 0,
                    actualAmountPrevMonth: 0,
                    remark: '',
                    isPlannedNew: true,
                  },
                ],
              };
            }
          }
          return { ...c, categories: cats };
        }),
      );
    },
    [setCustomers],
  );

  // 拆分品类目标到商品
  const handleSplit = useCallback(
    (customerId: number, categoryId: string, method: SplitMethod, targetAmount: number) => {
      setCustomers((prev) =>
        prev.map((c) => {
          if (c.customerId !== customerId) return c;
          return {
            ...c,
            categories: c.categories.map((cat) => {
              if (cat.categoryId !== categoryId) return cat;
              const splitFn = method === 'by_proportion' ? splitByProportion : splitEvenly;
              const newProducts = splitFn(cat, targetAmount);
              return { ...cat, targetAmount, products: newProducts };
            }),
          };
        }),
      );
    },
    [setCustomers],
  );

  return {
    handleUpdateProduct,
    handleSave,
    handleAddCustomers,
    handleAddProducts,
    handleSplit,
  };
}
