/**
 * 目标管理 - 派生数据 Hook
 * 从 useTargetManagement 返回的原始数据计算弹窗选项、营销师摘要等派生值
 */
import { useMemo } from 'react';
import { computeMarketerSummary } from '../utils/target-calculations';
import type { MarketerOverview } from '@/services/api/sales-target';
import type { CustomerTarget } from '@/types/target-management';

interface UseTargetDerivedDataParams {
  marketers: Array<{ id: number; name: string }>;
  customers: CustomerTarget[];
  customerList: Array<{
    erpConsumerId: number;
    consumerName: string;
    consumerManagerName: string | null;
    channelName: string | null;
    areaName: string | null;
    cooperationTypeName: string | null;
    isPublicSea: boolean;
    isMine: boolean;
  }>;
  productCatalog: Array<{
    categoryName: string;
    products: Array<{
      erpGoodsId: number;
      goodsName: string;
      unit: string;
      unitPrice: number | null;
      hasStock: boolean;
    }>;
  }>;
  overviewData: { marketers: MarketerOverview[] } | null;
  currentTargetId: number | null;
  selectedMarketerId: number | null;
  selectedCustomerId: number | null;
}

export function useTargetDerivedData({
  marketers,
  customers,
  customerList,
  productCatalog,
  overviewData,
  currentTargetId,
  selectedMarketerId,
  selectedCustomerId,
}: UseTargetDerivedDataParams) {
  const marketerOptions = useMemo(
    () => marketers.map((m) => ({ id: String(m.id), name: m.name })),
    [marketers],
  );

  const existingCustomerIds = useMemo(
    () => new Set(customers.map((c) => c.customerId)),
    [customers],
  );

  const availableCustomers = useMemo(
    () =>
      customerList
        .filter((c) => !existingCustomerIds.has(c.erpConsumerId))
        .map((c) => ({
          customerId: c.erpConsumerId,
          customerName: c.consumerName,
          consumerManagerName: c.consumerManagerName,
          channelName: c.channelName,
          areaName: c.areaName || '',
          cooperationTypeName: c.cooperationTypeName,
          isPublicSea: c.isPublicSea,
        })),
    [customerList, existingCustomerIds],
  );

  const myCustomerIds = useMemo(
    () => new Set(customerList.filter((c) => c.isMine).map((c) => c.erpConsumerId)),
    [customerList],
  );

  const availableProducts = useMemo(
    () =>
      productCatalog.flatMap((cat) => {
        const leafName = cat.categoryName.includes('/')
          ? cat.categoryName.split('/').pop()!
          : cat.categoryName;
        return cat.products.map((p) => ({
          productId: String(p.erpGoodsId),
          productName: p.goodsName,
          categoryId: leafName,
          categoryName: leafName,
          unit: p.unit,
          unitPrice: p.unitPrice || 0,
          hasStock: p.hasStock,
        }));
      }),
    [productCatalog],
  );

  const existingProductIds = useMemo(() => {
    const ids = new Set<string>();
    for (const c of customers) {
      if (c.customerId !== selectedCustomerId) continue;
      for (const cat of c.categories) {
        for (const p of cat.products) {
          ids.add(p.productId);
        }
      }
    }
    return ids;
  }, [customers, selectedCustomerId]);

  const currentMarketerSummary: MarketerOverview | null = useMemo(
    () => computeMarketerSummary(customers, selectedMarketerId, currentTargetId, overviewData),
    [selectedMarketerId, customers, currentTargetId, overviewData],
  );

  return {
    marketerOptions,
    availableCustomers,
    myCustomerIds,
    availableProducts,
    existingProductIds,
    currentMarketerSummary,
  };
}
