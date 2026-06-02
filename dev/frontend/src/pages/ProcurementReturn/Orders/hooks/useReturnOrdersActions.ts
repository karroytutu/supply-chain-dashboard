import { useState, useCallback } from 'react';
import { message } from 'antd';
import { batchConfirmReturnOrders } from '@/services/api/procurement-return';
import type { ReturnOrder } from '@/types/procurement-return';

export interface ReturnOrdersActions {
  selectedRowKeys: number[];
  batchLoading: boolean;
  setSelectedRowKeys: (keys: number[]) => void;
  handleBatchConfirm: (canReturn: boolean) => Promise<boolean>;
}

export function useReturnOrdersActions(
  dataSource: ReturnOrder[],
  fetchReturnOrders: () => Promise<void>,
  fetchStats: () => Promise<void>,
): ReturnOrdersActions {
  const [selectedRowKeys, setSelectedRowKeys] = useState<number[]>([]);
  const [batchLoading, setBatchLoading] = useState(false);

  const handleBatchConfirm = useCallback(async (canReturn: boolean) => {
    if (selectedRowKeys.length === 0) {
      message.warning('请选择要操作的退货单');
      return false;
    }

    const selectedOrders = dataSource.filter(item => selectedRowKeys.includes(item.id));
    const nonPendingOrders = selectedOrders.filter(item => item.status !== 'pending_confirm');

    if (nonPendingOrders.length > 0) {
      message.warning(
        `所选订单中有 ${nonPendingOrders.length} 条非待确认状态，批量确认仅对待确认状态订单生效`
      );
      return false;
    }

    setBatchLoading(true);
    try {
      const result = await batchConfirmReturnOrders({
        orderIds: selectedRowKeys,
        ruleDecision: canReturn ? 'can_return' : 'cannot_return',
      });
      message.success(
        canReturn
          ? `批量确认可退货成功 ${result.successCount} 条`
          : `批量确认不可退货成功 ${result.successCount} 条`
      );
      setSelectedRowKeys([]);
      fetchReturnOrders();
      fetchStats();
      return true;
    } catch (error) {
      message.error('批量操作失败');
      return false;
    } finally {
      setBatchLoading(false);
    }
  }, [selectedRowKeys, dataSource, fetchReturnOrders, fetchStats]);

  return { selectedRowKeys, batchLoading, setSelectedRowKeys, handleBatchConfirm };
}
