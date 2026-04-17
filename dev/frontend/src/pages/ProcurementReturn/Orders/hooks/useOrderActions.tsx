import { useCallback } from 'react';
import { Modal, message } from 'antd';
import { ExclamationCircleOutlined } from '@ant-design/icons';
import type { ReturnOrder, ReturnOrderStatus } from '@/types/procurement-return';
import { rollbackReturnOrder } from '@/services/api/procurement-return';

interface UseOrderActionsParams {
  handleStatusChange: (status?: ReturnOrderStatus) => void;
  handleDateRangeChange: (dates: [any, any] | null) => void;
  handleBatchConfirm: (canReturn: boolean) => Promise<boolean>;
  setSelectedRowKeys: (keys: number[]) => void;
  setSelectAll: (selectAll: boolean) => void;
  setKeyword: (keyword: string) => void;
  dataSource: ReturnOrder[];
  total: number;
  selectedRowKeys: number[];
  selectAll: boolean;
  fetchReturnOrders: () => void;
  fetchStats: () => void;
  handleSearch: () => void;
}

export function useOrderActions(params: UseOrderActionsParams) {
  const {
    handleStatusChange, handleDateRangeChange, handleBatchConfirm,
    setSelectedRowKeys, setSelectAll, setKeyword,
    dataSource, total, selectedRowKeys, selectAll,
    fetchReturnOrders, fetchStats, handleSearch,
  } = params;

  // 处理状态筛选点击
  const onStatusClick = useCallback((status?: ReturnOrderStatus) => {
    handleStatusChange(status);
  }, [handleStatusChange]);

  // 处理选择变更
  const onSelectChange = useCallback((keys: number[]) => {
    setSelectedRowKeys(keys);
    setSelectAll(false);
  }, [setSelectedRowKeys, setSelectAll]);

  // 处理全选变更
  const onSelectAllChange = useCallback((checked: boolean) => {
    setSelectAll(checked);
    if (checked) {
      setSelectedRowKeys(dataSource.map(item => item.id));
    } else {
      setSelectedRowKeys([]);
    }
  }, [dataSource, setSelectedRowKeys, setSelectAll]);

  // 批量确认
  const onBatchConfirm = useCallback(async (canReturn: boolean) => {
    const success = await handleBatchConfirm(canReturn);
    if (success) {
      setSelectAll(false);
    }
  }, [handleBatchConfirm, setSelectAll]);

  // 刷新
  const onRefresh = useCallback(() => {
    fetchReturnOrders();
    fetchStats();
  }, [fetchReturnOrders, fetchStats]);

  // 回退退货单
  const onRollback = useCallback((record: ReturnOrder) => {
    Modal.confirm({
      title: '确认回退',
      icon: <ExclamationCircleOutlined />,
      content: (
        <div>
          <p>确定要将退货单 <strong>{record.sourceBillNo}</strong> 回退到待确认状态吗？</p>
          <p>回退后可以重新选择「可退货」或「不可退货」。</p>
        </div>
      ),
      okText: '确认回退',
      cancelText: '取消',
      onOk: async () => {
        try {
          await rollbackReturnOrder(record.id);
          message.success('回退成功');
          onRefresh();
        } catch (error) {
          message.error(error instanceof Error ? error.message : '回退失败');
        }
      },
    });
  }, [onRefresh]);

  // 清除筛选
  const onClearFilters = useCallback(() => {
    setKeyword('');
    handleStatusChange(undefined);
    handleDateRangeChange(null);
  }, [setKeyword, handleStatusChange, handleDateRangeChange]);

  // 应用移动端筛选
  const onApplyMobileFilters = useCallback(() => {
    handleSearch();
  }, [handleSearch]);

  return {
    onStatusClick,
    onSelectChange,
    onSelectAllChange,
    onBatchConfirm,
    onRefresh,
    onRollback,
    onClearFilters,
    onApplyMobileFilters,
  };
}
