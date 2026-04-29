/**
 * 客户钻取弹窗状态管理 Hook
 * 管理：当前钻取维度、视图模式、筛选条件、选中客户、弹窗开关
 */

import { useState, useCallback, useMemo } from 'react';
import type { DrilldownRiskGroup, DrilldownCustomer } from '@/types/sales-analysis';
import { CUSTOMER_DRILLDOWN } from '@/constants/salesAnalysis';

const CURRENT_USER = '张晨';

const INITIAL_STATE = {
  open: false,
  drilldownKey: '' as string,
  viewMode: 'all' as 'all' | 'mine',
  filterKey: 'all',
  selectedCustomerId: null as string | null,
};

export function useCustomerDrilldown() {
  const [state, setState] = useState(INITIAL_STATE);

  const openModal = useCallback((key: string) => {
    setState({ open: true, drilldownKey: key, viewMode: 'all', filterKey: 'all', selectedCustomerId: null });
  }, []);

  const closeModal = useCallback(() => {
    setState((prev) => ({ ...prev, open: false }));
  }, []);

  const setViewMode = useCallback((mode: 'all' | 'mine') => {
    setState((prev) => ({ ...prev, viewMode: mode, selectedCustomerId: null }));
  }, []);

  const setFilterKey = useCallback((key: string) => {
    setState((prev) => ({ ...prev, filterKey: key, selectedCustomerId: null }));
  }, []);

  const selectCustomer = useCallback((id: string) => {
    setState((prev) => ({ ...prev, selectedCustomerId: id }));
  }, []);

  const riskGroup = CUSTOMER_DRILLDOWN[state.drilldownKey];
  const filteredCustomers = useFilteredCustomers(riskGroup, state.viewMode, state.filterKey);
  const selectedCustomer = useSelectedCustomer(filteredCustomers, state.selectedCustomerId);

  return {
    state,
    actions: { openModal, closeModal, setViewMode, setFilterKey, selectCustomer },
    riskGroup,
    filteredCustomers,
    selectedCustomer,
  };
}

/** 筛选客户列表 */
function useFilteredCustomers(riskGroup: DrilldownRiskGroup | undefined, viewMode: string, filterKey: string) {
  return useMemo(() => {
    if (!riskGroup) return [];
    let customers = riskGroup.customers;
    if (viewMode === 'mine') {
      customers = customers.filter((c) => c.owner === CURRENT_USER);
    }
    if (filterKey !== 'all') {
      customers = customers.filter((c) => c.filters.includes(filterKey));
    }
    return customers;
  }, [riskGroup, viewMode, filterKey]);
}

/** 获取选中的客户 */
function useSelectedCustomer(customers: DrilldownCustomer[], id: string | null) {
  return useMemo(() => {
    if (id) {
      const found = customers.find((c) => c.id === id);
      if (found) return found;
    }
    return customers[0] || null;
  }, [customers, id]);
}
