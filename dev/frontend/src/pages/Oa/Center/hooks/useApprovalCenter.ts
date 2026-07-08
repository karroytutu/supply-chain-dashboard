/**
 * 流程中心 - 组合入口 Hook
 * 组合 Filters / Data 两个子 Hook，返回列表管理相关功能
 * 审批操作由 ApprovalDetailPanel 内部的共享 useApprovalActions 处理
 */
import { useCallback } from 'react';
import { useApprovalCenterFilters } from './useApprovalCenterFilters';
import { useApprovalCenterData } from './useApprovalCenterData';
import type { ApprovalInstance } from '@/types/oa';

export function useApprovalCenter() {
  const filters = useApprovalCenterFilters();
  const data = useApprovalCenterData({
    viewMode: filters.viewMode,
    page: filters.page,
    searchText: filters.searchText,
    formTypeCode: filters.formTypeCode,
    status: filters.status,
    startDate: filters.startDate,
    endDate: filters.endDate,
    applicantName: filters.applicantName,
  });

  /** 操作完成后选中列表中对应位置的下一项 */
  const selectNextPending = useCallback((processedId: number) => {
    return (newList: ApprovalInstance[]) => {
      if (newList.length === 0) {
        filters.setSelectedId(null);
        return;
      }
      // 用旧列表确定被处理项的原始位置，再用该位置在新列表中选中下一项
      const currentIndex = data.list.findIndex(item => item.id === processedId);
      if (currentIndex >= 0) {
        // 安全边界：确保索引不超出新列表范围
        const nextIndex = Math.min(currentIndex, newList.length - 1);
        filters.setSelectedId(newList[nextIndex].id);
      } else {
        // 项目不在旧列表中（异常场景） → 选中新列表第一项
        filters.setSelectedId(newList[0].id);
      }
    };
  }, [data.list, filters.setSelectedId]);

  /** 审批操作完成后的回调：刷新列表+统计，选中下一条 */
  const handleActionComplete = useCallback(async (instanceId: number) => {
    const newList = await data.loadList();
    data.loadStats();
    selectNextPending(instanceId)(newList);
  }, [data.loadList, data.loadStats, selectNextPending]);

  /** 撤回完成后的回调：只刷新列表+统计，不自动跳转（保持原有行为） */
  const handleWithdrawComplete = useCallback(async () => {
    await data.loadList();
    data.loadStats();
  }, [data.loadList, data.loadStats]);

  return {
    data: {
      loading: data.loading,
      stats: data.stats,
      list: data.list,
      total: data.total,
      loadList: data.loadList,
      loadStats: data.loadStats,
      formTypes: data.formTypes,
    },
    pagination: {
      page: filters.page,
    },
    filters: {
      viewMode: filters.viewMode,
      searchText: filters.searchText,
      selectedId: filters.selectedId,
      formTypeCode: filters.formTypeCode,
      status: filters.status,
      startDate: filters.startDate,
      endDate: filters.endDate,
      applicantName: filters.applicantName,
      activeFilterCount: filters.activeFilterCount,
      filterOpen: filters.filterOpen,
      switchViewMode: filters.switchViewMode,
      setPage: filters.setPage,
      setSearchText: filters.setSearchText,
      setSelectedId: filters.setSelectedId,
      setFormTypeCode: filters.setFormTypeCode,
      setStatus: filters.setStatus,
      setDateRange: filters.setDateRange,
      setApplicantName: filters.setApplicantName,
      clearFilters: filters.clearFilters,
      toggleFilterOpen: filters.toggleFilterOpen,
    },
    mobile: {
      isMobile: filters.isMobile,
      mobileView: filters.mobileView,
      setMobileView: filters.setMobileView,
    },
    handleActionComplete,
    handleWithdrawComplete,
  };
}
