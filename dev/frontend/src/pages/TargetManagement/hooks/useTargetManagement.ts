/**
 * 目标管理页面主 Hook（组合层）
 * 组合 useTargetFilters + useTargetData + useTargetActions
 * 返回值按 filters / data / actions 分组
 */
import { useMemo, useEffect, useRef } from 'react';
import { calcSummary } from '../utils/target-calculations';
import { useTargetFilters } from './useTargetFilters';
import { useTargetData } from './useTargetData';
import { useTargetActions } from './useTargetActions';

export function useTargetManagement() {
  const filters = useTargetFilters();
  const data = useTargetData({
    selectedMarketerId: filters.selectedMarketerId,
    currentMonth: filters.currentMonth,
  });
  const actions = useTargetActions({
    customers: data.customers,
    setCustomers: data.setCustomers,
    selectedMarketerId: filters.selectedMarketerId,
    marketers: data.marketers,
    currentTargetId: data.currentTargetId,
    currentMonth: filters.currentMonth,
    loadTargetData: data.loadTargetData,
  });

  // 当前选中客户（依赖 filters + data）
  const selectedCustomer = useMemo(
    () => data.customers.find((c) => c.customerId === filters.selectedCustomerId) || null,
    [data.customers, filters.selectedCustomerId],
  );

  // 汇总数据
  const summary = useMemo(() => calcSummary(data.customers), [data.customers]);

  // 只读 = 历史月份 或 无编辑权限 或 未选中特定营销师
  const readOnly = filters.isHistoryMonth || !data.canEdit || filters.selectedMarketerId === null;

  // 进入编辑模式后自动选中第一个客户
  // 场景：从概览点击某营销师 / 通过下拉框切换营销师 / 月份切换后重新加载
  const pendingAutoSelectRef = useRef(false);

  // 当选中营销师发生变化时，标记需要自动选中
  const prevMarketerIdRef = useRef(filters.selectedMarketerId);
  useEffect(() => {
    if (prevMarketerIdRef.current !== filters.selectedMarketerId) {
      prevMarketerIdRef.current = filters.selectedMarketerId;
      if (filters.selectedMarketerId !== null) {
        pendingAutoSelectRef.current = true;
      } else {
        // 回到概览模式，清空客户选中
        filters.setSelectedCustomerId(null);
        pendingAutoSelectRef.current = false;
      }
    }
  }, [filters.selectedMarketerId, filters.setSelectedCustomerId]);

  // 数据加载完成后执行自动选中
  useEffect(() => {
    if (pendingAutoSelectRef.current && !data.loading && data.customers.length > 0) {
      pendingAutoSelectRef.current = false;
      filters.setSelectedCustomerId(data.customers[0].customerId);
    }
  }, [data.loading, data.customers, filters.setSelectedCustomerId]);

  // 月份切换时，如果当前有选中的营销师，重新标记需要自动选中
  const prevMonthRef = useRef(filters.currentMonth);
  useEffect(() => {
    if (prevMonthRef.current !== filters.currentMonth) {
      prevMonthRef.current = filters.currentMonth;
      if (filters.selectedMarketerId !== null) {
        pendingAutoSelectRef.current = true;
      }
    }
  }, [filters.currentMonth, filters.selectedMarketerId]);

  return {
    filters: {
      ...filters,
      readOnly,
    },
    data: {
      ...data,
      selectedCustomer,
      summary,
    },
    actions,
  };
}
