/**
 * 目标管理 - 数据加载 Hook
 * 管理营销师列表、概览汇总、客户目标数据、商品目录的加载
 *
 * 加载分阶段进行：
 * 阶段1: 并行加载 (营销师列表 + 当前用户信息)
 * 阶段2: 营销师列表就绪 → 加载概览数据（全部营销师汇总）
 * 阶段3: 选中某营销师 → 加载该营销师的客户+商品明细
 */
import { useState, useCallback, useEffect, useRef } from 'react';
import { message } from 'antd';
import type { TargetMonth, CustomerTarget } from '@/types/target-management';
import { getCurrentUser } from '@/services/api/auth';
import {
  fetchMarketers,
  fetchInitData,
  fetchOverview,
  fetchCustomers,
  fetchProductCatalog,
} from '@/services/api/sales-target';
import type {
  MarketerItem,
  CustomerListItem,
  ProductCatalogItem,
  InitDataResponse,
  OverviewResponse,
} from '@/services/api/sales-target';

interface UseTargetDataParams {
  selectedMarketerId: number | null;
  currentMonth: TargetMonth;
}

export function useTargetData({ selectedMarketerId, currentMonth }: UseTargetDataParams) {
  const [loading, setLoading] = useState(false);
  const [marketers, setMarketers] = useState<MarketerItem[]>([]);
  const [marketersLoaded, setMarketersLoaded] = useState(false);
  const [overviewData, setOverviewData] = useState<OverviewResponse | null>(null);
  const [currentTargetId, setCurrentTargetId] = useState<number | null>(null);
  const [customers, setCustomers] = useState<CustomerTarget[]>([]);
  const [customerList, setCustomerList] = useState<CustomerListItem[]>([]);
  const [productCatalog, setProductCatalog] = useState<ProductCatalogItem[]>([]);

  // 当前用户信息
  const [currentUser, setCurrentUser] = useState<{ id: number; role: string } | null>(null);
  const canEdit = currentUser?.role === 'manager';

  // 竞态修复：请求序列号
  const requestIdRef = useRef(0);

  // 将 init-data 响应转为 CustomerTarget 数组，按上月实际销售额降序排列
  const mapInitDataToCustomers = useCallback(
    (data: InitDataResponse): CustomerTarget[] => {
      const customers = data.customers.map((c) => ({
        customerId: c.erpConsumerId ?? 0,
        customerName: c.consumerName,
        isPlannedNew: c.isPlannedNew,
        marketerId: data.marketerId,
        marketerName: data.marketerName,
        categories: c.categories.map((cat) => ({
          categoryId: cat.categoryName,
          categoryName: cat.categoryName,
          targetAmount: cat.targetAmount,
          actualAmountLastMonth: cat.actualAmountLastMonth,
          actualAmountPrevMonth: cat.actualAmountPrevMonth,
          products: cat.products.map((p) => ({
            productId: String(p.erpGoodsId),
            productName: p.goodsName,
            unit: p.unit || '',
            unitPrice: p.unitPrice || 0,
            targetAmount: p.targetAmount,
            lastMonthTarget: 0,
            actualAmountLastMonth: p.actualAmountLastMonth,
            actualAmountPrevMonth: p.actualAmountPrevMonth,
            remark: p.remark,
            isPlannedNew: false,
          })),
        })),
      }));
      // 按上月实际销售额降序排列
      return customers.sort((a, b) => {
        const sumA = a.categories.reduce((s, cat) => s + cat.actualAmountLastMonth, 0);
        const sumB = b.categories.reduce((s, cat) => s + cat.actualAmountLastMonth, 0);
        return sumB - sumA;
      });
    },
    [],
  );

  // 加载单个营销师的完整数据
  const loadMarketerData = useCallback(
    async (marketerId: number): Promise<CustomerTarget[]> => {
      const data = await fetchInitData({
        marketerId,
        year: currentMonth.year,
        month: currentMonth.month,
      });
      if (data.isSaved && data.targetId) {
        setCurrentTargetId(data.targetId);
      } else {
        setCurrentTargetId(null);
      }
      return mapInitDataToCustomers(data);
    },
    [currentMonth, mapInitDataToCustomers],
  );

  // 加载概览数据（全部营销师汇总）
  const loadOverview = useCallback(async () => {
    try {
      const data = await fetchOverview(currentMonth.year, currentMonth.month);
      setOverviewData(data);
    } catch {
      message.error('加载概览数据失败');
      setOverviewData(null);
    }
  }, [currentMonth]);

  // 加载目标数据（仅当选中某营销师时加载明细）
  const loadTargetData = useCallback(async () => {
    if (!selectedMarketerId) {
      // 概览模式：清空明细，加载概览
      setCustomers([]);
      setCurrentTargetId(null);
      await loadOverview();
      return;
    }

    const currentId = ++requestIdRef.current;
    setLoading(true);
    try {
      const allCustomers = await loadMarketerData(selectedMarketerId);
      // 竞态检查
      if (currentId !== requestIdRef.current) return;
      setCustomers(allCustomers);
    } catch {
      if (currentId !== requestIdRef.current) return;
      message.error('加载目标数据失败');
      setCustomers([]);
    } finally {
      if (currentId === requestIdRef.current) {
        setLoading(false);
      }
    }
  }, [selectedMarketerId, loadMarketerData, loadOverview]);

  // 阶段1：加载营销师列表
  useEffect(() => {
    fetchMarketers()
      .then((data) => {
        setMarketers(data);
        setMarketersLoaded(true);
      })
      .catch(() => message.error('加载营销师列表失败'));
  }, []);

  // 阶段1：加载当前用户信息
  useEffect(() => {
    getCurrentUser()
      .then((user) => {
        const roleCodes = user?.roles?.map((r: { code: string }) => r.code) || [];
        const isEditor = roleCodes.includes('marketing_manager') || roleCodes.includes('admin');
        setCurrentUser({ id: user.id, role: isEditor ? 'manager' : 'marketer' });
      })
      .catch(() => message.error('加载用户信息失败'));
  }, []);

  // 阶段2+3：营销师列表就绪后，根据选中状态加载概览或明细
  useEffect(() => {
    if (!marketersLoaded) return;
    loadTargetData();
  }, [marketersLoaded, selectedMarketerId, currentMonth, loadTargetData]);

  // 加载客户列表（添加客户弹窗用，按需调用）
  const loadCustomerList = useCallback(async () => {
    try {
      const data = await fetchCustomers();
      setCustomerList(data);
    } catch {
      message.error('加载客户列表失败');
      setCustomerList([]);
    }
  }, []);

  // 加载商品目录（添加商品弹窗用，按需调用）
  const loadProductCatalog = useCallback(async () => {
    try {
      const data = await fetchProductCatalog();
      setProductCatalog(data);
    } catch {
      message.error('加载商品目录失败');
      setProductCatalog([]);
    }
  }, []);

  return {
    loading,
    marketers,
    overviewData,
    currentTargetId,
    customers,
    setCustomers,
    customerList,
    productCatalog,
    canEdit,
    loadTargetData,
    loadCustomerList,
    loadProductCatalog,
  };
}
