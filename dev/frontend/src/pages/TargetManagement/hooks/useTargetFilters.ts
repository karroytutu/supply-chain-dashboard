/**
 * 目标管理 - 筛选/导航状态 Hook
 * 管理营销师选择、月份切换、客户选择
 * 使用 URL 参数持久化筛选状态，刷新/分享链接后状态保留
 */
import { useMemo, useCallback } from 'react';
import { useSearchParams } from 'umi';
import dayjs from 'dayjs';
import type { TargetMonth } from '@/types/target-management';

/** 目标管理模块起始月份（不能切换到更早的月份） */
const MIN_YEAR = 2026;
const MIN_MONTH = 7;

export function useTargetFilters() {
  const [searchParams, setSearchParams] = useSearchParams();

  const selectedMarketerId = useMemo(() => {
    const v = searchParams.get('marketer');
    return v ? Number(v) : null;
  }, [searchParams]);

  const currentMonth: TargetMonth = useMemo(() => ({
    year: Number(searchParams.get('year')) || dayjs().year(),
    month: Number(searchParams.get('month')) || dayjs().month() + 1,
  }), [searchParams]);

  const selectedCustomerId = useMemo(() => {
    const v = searchParams.get('customer');
    return v ? Number(v) : null;
  }, [searchParams]);

  const setSelectedMarketerId = useCallback((id: number | null) => {
    const next = new URLSearchParams(searchParams);
    if (id !== null) next.set('marketer', String(id));
    else next.delete('marketer');
    next.delete('customer');
    setSearchParams(next);
  }, [searchParams, setSearchParams]);

  const setSelectedCustomerId = useCallback((id: number | null) => {
    const next = new URLSearchParams(searchParams);
    if (id !== null) next.set('customer', String(id));
    else next.delete('customer');
    setSearchParams(next);
  }, [searchParams, setSearchParams]);

  // 是否历史月份
  const isHistoryMonth = useMemo(() => {
    const selected = dayjs(`${currentMonth.year}-${String(currentMonth.month).padStart(2, '0')}`);
    return selected.isBefore(dayjs(), 'month');
  }, [currentMonth]);

  // 月份切换
  const canPrevMonth = useMemo(() => {
    return currentMonth.year > MIN_YEAR || currentMonth.month > MIN_MONTH;
  }, [currentMonth]);

  const handlePrevMonth = useCallback(() => {
    const d = dayjs(`${currentMonth.year}-${String(currentMonth.month).padStart(2, '0')}-01`).subtract(1, 'month');
    const newYear = d.year();
    const newMonth = d.month() + 1;
    if (newYear < MIN_YEAR || (newYear === MIN_YEAR && newMonth < MIN_MONTH)) return;
    const next = new URLSearchParams(searchParams);
    next.set('year', String(newYear));
    next.set('month', String(newMonth));
    setSearchParams(next);
  }, [currentMonth, searchParams, setSearchParams]);

  const handleNextMonth = useCallback(() => {
    const d = dayjs(`${currentMonth.year}-${String(currentMonth.month).padStart(2, '0')}-01`).add(1, 'month');
    const next = new URLSearchParams(searchParams);
    next.set('year', String(d.year()));
    next.set('month', String(d.month() + 1));
    setSearchParams(next);
  }, [currentMonth, searchParams, setSearchParams]);

  return {
    selectedMarketerId,
    setSelectedMarketerId,
    currentMonth,
    selectedCustomerId,
    setSelectedCustomerId,
    isHistoryMonth,
    canPrevMonth,
    handlePrevMonth,
    handleNextMonth,
  };
}
