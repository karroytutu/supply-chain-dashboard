import { useCallback } from 'react';
import type { StrategicProductStatus } from '@/types/strategic-product';

interface UseProductActionsParams {
  handleDelete: (id: number) => Promise<boolean>;
  handleConfirm: (record: any, confirmed: boolean) => Promise<boolean>;
  handleBatchConfirm: (action: 'confirm' | 'reject', categoryPath?: string) => Promise<boolean>;
  handleBatchDelete: (categoryPath?: string) => Promise<boolean>;
  handleSyncCategory: () => Promise<{ updatedCount: number; totalCount: number } | null>;
  handleExport: (type: 'all' | 'page' | 'selected', categoryPath?: string) => Promise<void>;
  loadStrategicProducts: (categoryPath?: string, filterStatus?: StrategicProductStatus, searchKeyword?: string) => Promise<void>;
  loadStats: () => void;
  loadCategoryTree: (force?: boolean) => void;
  selectedCategoryPath: string | undefined;
  statusFilter: StrategicProductStatus | undefined;
  keyword: string;
  selectAll: boolean;
  selectedRowKeys: number[];
  total: number;
  setPage: (page: number) => void;
}

export function useProductActions(params: UseProductActionsParams) {
  const {
    handleDelete, handleConfirm, handleBatchConfirm, handleBatchDelete,
    handleSyncCategory, handleExport,
    loadStrategicProducts, loadStats, loadCategoryTree,
    selectedCategoryPath, statusFilter, keyword,
    selectAll, selectedRowKeys, total, setPage,
  } = params;

  const refresh = useCallback(() => {
    loadStrategicProducts(selectedCategoryPath, statusFilter, keyword);
    loadStats();
  }, [loadStrategicProducts, loadStats, selectedCategoryPath, statusFilter, keyword]);

  // 搜索
  const onSearch = useCallback(() => {
    setPage(1);
    loadStrategicProducts(selectedCategoryPath, statusFilter, keyword);
  }, [loadStrategicProducts, selectedCategoryPath, statusFilter, keyword, setPage]);

  // 删除后刷新
  const onDelete = useCallback(async (id: number) => {
    const success = await handleDelete(id);
    if (success) refresh();
  }, [handleDelete, refresh]);

  // 确认后刷新
  const onConfirm = useCallback(async (record: any, confirmed: boolean) => {
    const success = await handleConfirm(record, confirmed);
    if (success) refresh();
  }, [handleConfirm, refresh]);

  // 批量确认
  const onBatchConfirm = useCallback(async (action: 'confirm' | 'reject') => {
    const success = await handleBatchConfirm(action, selectedCategoryPath);
    if (success) refresh();
  }, [handleBatchConfirm, refresh, selectedCategoryPath]);

  // 批量删除
  const onBatchDelete = useCallback(async () => {
    const confirmContent = selectAll
      ? `确定要删除全部 ${total} 个符合条件的战略商品吗？`
      : `确定要删除选中的 ${selectedRowKeys.length} 个战略商品吗？`;
    if (!window.confirm(confirmContent)) return;
    const success = await handleBatchDelete(selectedCategoryPath);
    if (success) refresh();
  }, [handleBatchDelete, refresh, selectedCategoryPath, selectAll, selectedRowKeys.length, total]);

  // 同步品类
  const onSyncCategory = useCallback(async () => {
    const result = await handleSyncCategory();
    if (result) {
      loadCategoryTree(true);
      refresh();
    }
  }, [handleSyncCategory, loadCategoryTree, refresh]);

  // 导出
  const onExport = useCallback((type: 'all' | 'page' | 'selected') => {
    handleExport(type, selectedCategoryPath);
  }, [handleExport, selectedCategoryPath]);

  return {
    onSearch, onDelete, onConfirm, onBatchConfirm,
    onBatchDelete, onSyncCategory, onExport, refresh,
  };
}
