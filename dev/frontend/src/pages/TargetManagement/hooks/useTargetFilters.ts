/**
 * 目标管理 - 筛选/导航状态 Hook
 * 管理营销师选择、月份切换、客户选择
 */
import { useState, useMemo, useCallback } from 'react';
import dayjs from 'dayjs';
import type { TargetMonth } from '@/types/target-management';

/** 目标管理模块起始月份（不能切换到更早的月份） */
const MIN_YEAR = 2026;
const MIN_MONTH = 7;

export function useTargetFilters() {
  const [selectedMarketerId, setSelectedMarketerId] = useState<number | null>(null);
  const [currentMonth, setCurrentMonth] = useState<TargetMonth>({
    year: dayjs().year(),
    month: dayjs().month() + 1,
  });
  const [selectedCustomerId, setSelectedCustomerId] = useState<number | null>(null);

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
    setCurrentMonth((prev) => {
      const d = dayjs(`${prev.year}-${String(prev.month).padStart(2, '0')}-01`).subtract(1, 'month');
      const newYear = d.year();
      const newMonth = d.month() + 1;
      if (newYear < MIN_YEAR || (newYear === MIN_YEAR && newMonth < MIN_MONTH)) {
        return prev;
      }
      return { year: newYear, month: newMonth };
    });
  }, []);

  const handleNextMonth = useCallback(() => {
    setCurrentMonth((prev) => {
      const d = dayjs(`${prev.year}-${String(prev.month).padStart(2, '0')}-01`).add(1, 'month');
      return { year: d.year(), month: d.month() + 1 };
    });
  }, []);

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
