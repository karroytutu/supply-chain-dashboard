/**
 * 客户钻取弹窗状态管理 Hook
 * 管理：当前钻取维度、视图模式、筛选条件、搜索关键词、负责人筛选、弹窗开关
 */

import { useState, useCallback, useMemo } from 'react';
import type { DrilldownRiskGroup } from '@/types/sales-analysis';
import { CUSTOMER_DRILLDOWN } from '@/constants/salesAnalysis';

const CURRENT_USER = '张晨';

const INITIAL_STATE = {
  open: false,
  drilldownKey: '' as string,
  viewMode: 'all' as 'all' | 'mine',
  filterKey: 'all',
  keyword: '',
  ownerFilter: '',
};

export function useCustomerDrilldown() {
  const [state, setState] = useState(INITIAL_STATE);

  const openModal = useCallback((key: string) => {
    setState({ open: true, drilldownKey: key, viewMode: 'all', filterKey: 'all', keyword: '', ownerFilter: '' });
  }, []);

  const closeModal = useCallback(() => {
    setState((prev) => ({ ...prev, open: false }));
  }, []);

  const setViewMode = useCallback((mode: 'all' | 'mine') => {
    setState((prev) => ({ ...prev, viewMode: mode }));
  }, []);

  const setFilterKey = useCallback((key: string) => {
    setState((prev) => ({ ...prev, filterKey: key }));
  }, []);

  const setKeyword = useCallback((keyword: string) => {
    setState((prev) => ({ ...prev, keyword }));
  }, []);

  const setOwnerFilter = useCallback((ownerFilter: string) => {
    setState((prev) => ({ ...prev, ownerFilter }));
  }, []);

  const riskGroup = CUSTOMER_DRILLDOWN[state.drilldownKey];

  const ownerOptions = useMemo(() => {
    if (!riskGroup) return [];
    const owners = new Set(riskGroup.customers.map((c) => c.owner).filter(Boolean));
    return Array.from(owners);
  }, [riskGroup]);

  const filteredCustomers = useFilteredCustomers(
    riskGroup, state.viewMode, state.filterKey, state.keyword, state.ownerFilter,
  );

  return {
    state,
    actions: { openModal, closeModal, setViewMode, setFilterKey, setKeyword, setOwnerFilter },
    riskGroup,
    filteredCustomers,
    ownerOptions,
  };
}

/** 筛选客户列表 */
function useFilteredCustomers(
  riskGroup: DrilldownRiskGroup | undefined,
  viewMode: string,
  filterKey: string,
  keyword: string,
  ownerFilter: string,
) {
  return useMemo(() => {
    if (!riskGroup) return [];
    let customers = riskGroup.customers;
    if (viewMode === 'mine') {
      customers = customers.filter((c) => c.owner === CURRENT_USER);
    }
    if (filterKey !== 'all') {
      customers = customers.filter((c) => c.filters.includes(filterKey));
    }
    if (keyword) {
      customers = customers.filter((c) => c.name.includes(keyword));
    }
    if (ownerFilter) {
      customers = customers.filter((c) => c.owner === ownerFilter);
    }
    return customers;
  }, [riskGroup, viewMode, filterKey, keyword, ownerFilter]);
}
