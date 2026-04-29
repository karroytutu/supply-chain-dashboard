/**
 * 战略商品 - 业务操作 Hook
 * 负责增删改操作、批量操作、导出、同步等
 */
import { useState, useCallback } from 'react';
import { message } from 'antd';
import {
  deleteStrategicProduct,
  confirmStrategicProduct,
  batchConfirmStrategicProducts,
  batchDeleteStrategicProducts,
  syncCategoryPath,
  getStrategicProducts,
} from '@/services/api/strategic-product';
import { exportStrategicProducts } from '../utils/export';
import type { StrategicProduct, StrategicProductStatus } from '@/types/strategic-product';
import type { StrategicFilters } from './useStrategicFilters';

interface UseStrategicActionsParams {
  filters: StrategicFilters;
  dataSource: StrategicProduct[];
  selectedRowKeys: number[];
  selectAll: boolean;
  setSelectedRowKeys: (keys: number[]) => void;
  setSelectAll: (val: boolean) => void;
}

export function useStrategicActions({
  filters, dataSource, selectedRowKeys, selectAll,
  setSelectedRowKeys, setSelectAll,
}: UseStrategicActionsParams) {
  const [batchLoading, setBatchLoading] = useState(false);
  const [syncLoading, setSyncLoading] = useState(false);
  const [exportLoading, setExportLoading] = useState(false);

  const handleDelete = useCallback(async (id: number) => {
    try {
      await deleteStrategicProduct(id);
      message.success('删除成功');
      return true;
    } catch (error) {
      message.error('删除失败');
      return false;
    }
  }, []);

  const handleConfirm = useCallback(async (record: StrategicProduct, confirmed: boolean) => {
    try {
      await confirmStrategicProduct(record.id, { action: confirmed ? 'confirm' : 'reject' });
      message.success(confirmed ? '确认成功' : '驳回成功');
      return true;
    } catch (error) {
      message.error('操作失败');
      return false;
    }
  }, []);

  const handleBatchConfirm = useCallback(async (
    action: 'confirm' | 'reject',
    categoryPath?: string,
  ) => {
    if (!selectAll && selectedRowKeys.length === 0) {
      message.warning('请选择要操作的商品');
      return false;
    }
    setBatchLoading(true);
    try {
      await batchConfirmStrategicProducts({
        selectAll,
        ids: selectAll ? undefined : selectedRowKeys,
        action,
        status: filters.statusFilter,
        categoryPath,
        keyword: filters.keyword,
      });
      message.success(action === 'confirm' ? '批量确认成功' : '批量驳回成功');
      setSelectedRowKeys([]);
      setSelectAll(false);
      return true;
    } catch (error) {
      message.error('批量操作失败');
      return false;
    } finally {
      setBatchLoading(false);
    }
  }, [selectAll, selectedRowKeys, filters.statusFilter, filters.keyword, setSelectedRowKeys, setSelectAll]);

  const handleBatchDelete = useCallback(async (categoryPath?: string): Promise<boolean> => {
    if (!selectAll && selectedRowKeys.length === 0) {
      message.warning('请选择要删除的商品');
      return false;
    }
    setBatchLoading(true);
    try {
      await batchDeleteStrategicProducts({
        selectAll,
        ids: selectAll ? undefined : selectedRowKeys,
        status: filters.statusFilter,
        categoryPath,
        keyword: filters.keyword,
      });
      message.success('批量删除成功');
      setSelectedRowKeys([]);
      setSelectAll(false);
      return true;
    } catch (error) {
      message.error('批量删除失败');
      return false;
    } finally {
      setBatchLoading(false);
    }
  }, [selectAll, selectedRowKeys, filters.statusFilter, filters.keyword, setSelectedRowKeys, setSelectAll]);

  const handleSyncCategory = useCallback(async (): Promise<{ updatedCount: number; totalCount: number } | null> => {
    setSyncLoading(true);
    try {
      const result = await syncCategoryPath();
      message.success(`同步完成，更新了 ${result.updatedCount} 条记录`);
      return result;
    } catch (error) {
      message.error('同步品类失败');
      return null;
    } finally {
      setSyncLoading(false);
    }
  }, []);

  const handleExport = useCallback(async (
    type: 'all' | 'page' | 'selected',
    categoryPath?: string,
  ): Promise<void> => {
    setExportLoading(true);
    try {
      let dataToExport: StrategicProduct[] = [];
      if (type === 'page') {
        dataToExport = dataSource;
      } else if (type === 'selected') {
        if (selectAll) {
          const result = await getStrategicProducts({
            page: 1, pageSize: 9999, keyword: filters.keyword, status: filters.statusFilter, categoryPath,
          });
          dataToExport = result.data;
        } else {
          dataToExport = dataSource.filter(item => selectedRowKeys.includes(item.id));
        }
      } else {
        const result = await getStrategicProducts({
          page: 1, pageSize: 9999, keyword: filters.keyword, status: filters.statusFilter, categoryPath,
        });
        dataToExport = result.data;
      }
      if (dataToExport.length === 0) {
        message.warning('没有数据可导出');
        return;
      }
      exportStrategicProducts(dataToExport);
      message.success(`成功导出 ${dataToExport.length} 条数据`);
    } catch (error) {
      message.error('导出失败');
    } finally {
      setExportLoading(false);
    }
  }, [dataSource, selectedRowKeys, selectAll, filters.keyword, filters.statusFilter]);

  return {
    batchLoading,
    syncLoading,
    exportLoading,
    handleDelete,
    handleConfirm,
    handleBatchConfirm,
    handleBatchDelete,
    handleSyncCategory,
    handleExport,
  };
}
