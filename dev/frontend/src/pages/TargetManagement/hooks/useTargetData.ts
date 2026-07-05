/**
 * 目标管理 - 数据加载 Hook
 * 管理营销师列表、概览汇总、客户目标数据、商品目录的加载
 */
import { useReducer, useCallback, useEffect, useRef } from 'react';
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
import type { MarketerItem } from '@/services/api/sales-target';
import { dataReducer, initialState } from './useTargetDataReducer';
import { mapInitDataToCustomers } from '../utils/target-data-mapper';

interface UseTargetDataParams {
  selectedMarketerId: number | null;
  currentMonth: TargetMonth;
}

export function useTargetData({ selectedMarketerId, currentMonth }: UseTargetDataParams) {
  const [state, dispatch] = useReducer(dataReducer, initialState);
  const requestIdRef = useRef(0);

  const canEdit = state.currentUser?.role === 'manager';

  const loadMarketerData = useCallback(
    async (marketerId: number): Promise<CustomerTarget[]> => {
      const data = await fetchInitData({
        marketerId,
        year: currentMonth.year,
        month: currentMonth.month,
      });
      dispatch({ type: 'SET_TARGET_ID', id: (data.isSaved && data.targetId) ? data.targetId : null });
      dispatch({ type: 'SET_TARGET_STATUS', status: data.status || 'draft' });
      return mapInitDataToCustomers(data);
    },
    [currentMonth],
  );

  const loadOverview = useCallback(async () => {
    try {
      const data = await fetchOverview(currentMonth.year, currentMonth.month);
      dispatch({ type: 'SET_OVERVIEW', data });
    } catch {
      message.error('加载概览数据失败');
      dispatch({ type: 'SET_OVERVIEW', data: null });
    }
  }, [currentMonth]);

  const loadTargetData = useCallback(async () => {
    if (!selectedMarketerId) {
      dispatch({ type: 'SET_CUSTOMERS', customers: [] });
      dispatch({ type: 'SET_TARGET_ID', id: null });
      await loadOverview();
      return;
    }

    const currentId = ++requestIdRef.current;
    dispatch({ type: 'SET_LOADING', loading: true });
    try {
      const allCustomers = await loadMarketerData(selectedMarketerId);
      if (currentId !== requestIdRef.current) return;
      dispatch({ type: 'SET_CUSTOMERS', customers: allCustomers });
    } catch {
      if (currentId !== requestIdRef.current) return;
      message.error('加载目标数据失败');
      dispatch({ type: 'SET_CUSTOMERS', customers: [] });
    } finally {
      if (currentId === requestIdRef.current) {
        dispatch({ type: 'SET_LOADING', loading: false });
      }
    }
  }, [selectedMarketerId, loadMarketerData, loadOverview]);

  // 阶段1：并行加载营销师列表和当前用户信息
  useEffect(() => {
    Promise.all([
      fetchMarketers().catch(() => {
        message.error('加载营销师列表失败');
        return [] as MarketerItem[];
      }),
      getCurrentUser().catch(() => {
        message.error('加载用户信息失败');
        return null;
      }),
    ]).then(([marketersData, user]) => {
      dispatch({ type: 'SET_MARKETERS', marketers: marketersData });
      if (user) {
        const roleCodes = user?.roles?.map((r: { code: string }) => r.code) || [];
        const isEditor = roleCodes.includes('marketing_manager') || roleCodes.includes('admin');
        dispatch({ type: 'SET_CURRENT_USER', user: { id: user.id, role: isEditor ? 'manager' : 'marketer' } });
      }
    });
  }, []);

  // 辅助数据加载（客户列表 + 商品目录）
  const loadCustomerList = useCallback(async (marketerId?: number) => {
    dispatch({ type: 'SET_CUSTOMER_LIST', list: [], loading: true });
    try {
      const data = await fetchCustomers(marketerId);
      dispatch({ type: 'SET_CUSTOMER_LIST', list: data, loading: false });
    } catch {
      message.error('加载客户列表失败');
      dispatch({ type: 'SET_CUSTOMER_LIST', list: [], loading: false });
    }
  }, []);

  const loadProductCatalog = useCallback(async () => {
    try {
      const data = await fetchProductCatalog();
      dispatch({ type: 'SET_PRODUCT_CATALOG', catalog: data });
    } catch {
      message.error('加载商品目录失败');
      dispatch({ type: 'SET_PRODUCT_CATALOG', catalog: [] });
    }
  }, []);

  // 阶段2+3：营销师列表就绪后加载概览或明细
  useEffect(() => {
    if (!state.marketersLoaded) return;
    loadTargetData();
  }, [state.marketersLoaded, selectedMarketerId, currentMonth, loadTargetData]);

  // 进入编辑模式或切换营销师时预加载客户列表
  // isMine 标记依赖当前营销师，切换时必须重新加载
  useEffect(() => {
    if (selectedMarketerId) {
      loadCustomerList(selectedMarketerId);
    }
  }, [selectedMarketerId, loadCustomerList]);

  // 稳定的 setCustomers 引用，支持直接值和 updater 函数两种模式
  const setCustomers = useCallback(
    (customers: CustomerTarget[] | ((prev: CustomerTarget[]) => CustomerTarget[])) => {
      if (typeof customers === 'function') {
        dispatch({ type: 'SET_CUSTOMERS_FN', updater: customers });
      } else {
        dispatch({ type: 'SET_CUSTOMERS', customers });
      }
    },
    [],
  );

  return {
    loading: state.loading,
    marketers: state.marketers,
    overviewData: state.overviewData,
    currentTargetId: state.currentTargetId,
    targetStatus: state.targetStatus,
    customers: state.customers,
    setCustomers,
    customerList: state.customerList,
    customerListLoading: state.customerListLoading,
    productCatalog: state.productCatalog,
    canEdit,
    loadTargetData,
    loadCustomerList,
    loadProductCatalog,
  };
}
