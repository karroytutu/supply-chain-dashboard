/**
 * 流程中心 - 组合入口 Hook
 * 组合 Filters / Data / Actions 三个子 Hook，返回按逻辑分组的结构
 */
import { useApprovalCenterFilters } from './useApprovalCenterFilters';
import { useApprovalCenterData } from './useApprovalCenterData';
import { useApprovalCenterActions } from './useApprovalCenterActions';

export function useApprovalCenter() {
  const filters = useApprovalCenterFilters();
  const data = useApprovalCenterData({
    viewMode: filters.viewMode,
    page: filters.page,
    searchText: filters.searchText,
    selectedId: filters.selectedId,
  });
  const actions = useApprovalCenterActions({
    selectedId: filters.selectedId,
    setSelectedId: filters.setSelectedId,
    currentList: data.list,
    reloadList: data.loadList,
    reloadStats: data.loadStats,
    reloadDetail: data.loadDetail,
  });

  return {
    data: {
      loading: data.loading,
      detailLoading: data.detailLoading,
      stats: data.stats,
      list: data.list,
      total: data.total,
      detail: data.detail,
      loadList: data.loadList,
      loadStats: data.loadStats,
    },
    pagination: {
      page: filters.page,
    },
    filters: {
      viewMode: filters.viewMode,
      searchText: filters.searchText,
      selectedId: filters.selectedId,
      switchViewMode: filters.switchViewMode,
      setPage: filters.setPage,
      setSearchText: filters.setSearchText,
      setSelectedId: filters.setSelectedId,
    },
    mobile: {
      isMobile: filters.isMobile,
      mobileView: filters.mobileView,
      setMobileView: filters.setMobileView,
    },
    rejectModal: actions.reject,
    transferModal: actions.transfer,
    actions: {
      approve: actions.handleApprove,
      reject: actions.handleReject,
      withdraw: actions.handleWithdraw,
      openTransfer: actions.openTransferModal,
      transfer: actions.handleTransfer,
      update: actions.handleUpdate,
    },
  };
}
