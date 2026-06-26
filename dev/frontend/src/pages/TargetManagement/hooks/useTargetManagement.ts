/**
 * 目标管理页面主 Hook
 * 管理页面整体状态：营销师选择、月份、客户选择、审批状态、数据树
 */
import { useState, useMemo, useCallback } from 'react';
import dayjs from 'dayjs';
import type { TargetStatus, CustomerTarget, TargetMonth, UserRole, Marketer } from '@/types/target-management';
import {
  MARKETERS,
  ALL_CUSTOMER_TARGETS,
  DEFAULT_STATUS,
  DEFAULT_USER_ROLE,
  DEFAULT_MARKETER_ID,
} from '@/constants/targetManagement';
import { useTargetCalculation } from './useTargetCalculation';

export function useTargetManagement() {
  const calc = useTargetCalculation();

  // 基础状态
  const [selectedMarketerId, setSelectedMarketerId] = useState<string>(DEFAULT_MARKETER_ID);
  const [currentMonth, setCurrentMonth] = useState<TargetMonth>({
    year: dayjs().year(),
    month: dayjs().month() + 1,
  });
  const [status, setStatus] = useState<TargetStatus>(DEFAULT_STATUS);
  const [userRole] = useState<UserRole>(DEFAULT_USER_ROLE);

  // 数据树（按营销师筛选后的客户列表）
  const [allCustomers, setAllCustomers] = useState<CustomerTarget[]>(ALL_CUSTOMER_TARGETS);

  // 当前营销师下的客户列表
  const filteredCustomers = useMemo(() => {
    if (selectedMarketerId === 'all') return allCustomers;
    return allCustomers.filter((c) => c.marketerId === selectedMarketerId);
  }, [allCustomers, selectedMarketerId]);

  // 当前选中的客户
  const [selectedCustomerId, setSelectedCustomerId] = useState<string | null>(null);
  const selectedCustomer = useMemo(
    () => filteredCustomers.find((c) => c.customerId === selectedCustomerId) || null,
    [filteredCustomers, selectedCustomerId],
  );

  // 自动选中第一个客户
  useMemo(() => {
    if (!selectedCustomer && filteredCustomers.length > 0) {
      setSelectedCustomerId(filteredCustomers[0].customerId);
    }
  }, [filteredCustomers, selectedCustomer]);

  // 汇总数据
  const summary = useMemo(() => calc.calculateSummary(filteredCustomers), [calc, filteredCustomers]);

  // 是否历史月份
  const now = dayjs();
  const isHistoryMonth = useMemo(() => {
    const selected = dayjs(`${currentMonth.year}-${String(currentMonth.month).padStart(2, '0')}`);
    return selected.isBefore(now, 'month');
  }, [currentMonth, now]);

  // 操作：更新商品目标
  const handleUpdateProduct = useCallback((
    customerId: string, categoryId: string, productId: string,
    field: 'targetAmount' | 'remark',
    value: number | string, unitPrice: number,
  ) => {
    setAllCustomers((prev) => calc.updateProductTarget(prev, customerId, categoryId, productId, field, value, unitPrice));
  }, [calc]);

  // 操作：更新品类目标
  const handleUpdateCategory = useCallback((
    customerId: string, categoryId: string,
    field: 'targetAmount', value: number,
  ) => {
    setAllCustomers((prev) => calc.updateCategoryTarget(prev, customerId, categoryId, field, value));
  }, [calc]);

  // 操作：拆分
  const handleSplit = useCallback((customerId: string, categoryId: string, method: 'by_proportion' | 'even', targetAmount: number) => {
    setAllCustomers((prev) => calc.applySplit(prev, customerId, categoryId, method, targetAmount));
  }, [calc]);

  // 操作：添加客户
  const handleAddCustomers = useCallback((newCustomers: Array<{ customerId: string; customerName: string }>) => {
    const marketer = MARKETERS.find((m) => m.id === selectedMarketerId);
    if (!marketer) return;
    setAllCustomers((prev) => calc.addCustomers(prev, newCustomers, marketer.id, marketer.name));
  }, [calc, selectedMarketerId]);

  // 操作：添加商品
  const handleAddProducts = useCallback((
    customerId: string,
    products: Array<{ productId: string; productName: string; categoryId: string; categoryName: string; unit: string; unitPrice: number }>,
  ) => {
    setAllCustomers((prev) => calc.addProductsToCustomer(prev, customerId, products));
  }, [calc]);

  // 操作：审批状态切换（原型阶段模拟）
  const handleStatusAction = useCallback((action: TargetStatus) => {
    setStatus(action);
  }, []);

  // 月份切换
  const handlePrevMonth = useCallback(() => {
    setCurrentMonth((prev) => {
      const d = dayjs(`${prev.year}-${String(prev.month).padStart(2, '0')}-01`).subtract(1, 'month');
      return { year: d.year(), month: d.month() + 1 };
    });
  }, []);

  const handleNextMonth = useCallback(() => {
    setCurrentMonth((prev) => {
      const d = dayjs(`${prev.year}-${String(prev.month).padStart(2, '0')}-01`).add(1, 'month');
      return { year: d.year(), month: d.month() + 1 };
    });
  }, []);

  return {
    // 状态
    marketers: MARKETERS as Marketer[],
    selectedMarketerId,
    setSelectedMarketerId,
    currentMonth,
    status,
    userRole,
    isHistoryMonth,
    selectedCustomer,
    selectedCustomerId,
    setSelectedCustomerId,
    filteredCustomers,
    summary,
    // 操作
    handleUpdateProduct,
    handleUpdateCategory,
    handleSplit,
    handleAddCustomers,
    handleAddProducts,
    handleStatusAction,
    handlePrevMonth,
    handleNextMonth,
  };
}
