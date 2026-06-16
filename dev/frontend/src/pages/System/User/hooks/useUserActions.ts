/**
 * 用户管理 - 业务操作 Hook
 * 负责用户状态切换、批量操作等
 */
import { useState, useCallback } from 'react';
import { message } from 'antd';
import {
  updateUserStatus,
  batchUpdateUserStatus,
} from '@/services/api/auth';
import type { UserItem } from '../types';

interface UseUserActionsParams {
  selectedRowKeys: number[];
  setSelectedRowKeys: (keys: number[]) => void;
  fetchUsers: () => void;
}

export function useUserActions({
  selectedRowKeys, setSelectedRowKeys, fetchUsers,
}: UseUserActionsParams) {
  const [batchLoading, setBatchLoading] = useState(false);

  const handleToggleStatus = useCallback(async (user: UserItem): Promise<boolean> => {
    const newStatus = user.status === 1 ? 0 : 1;
    try {
      await updateUserStatus(user.id, newStatus);
      message.success(newStatus === 1 ? '用户已启用' : '用户已禁用');
      fetchUsers();
      return true;
    } catch (error) {
      message.error('操作失败');
      return false;
    }
  }, [fetchUsers]);

  const handleBatchEnable = useCallback(async (): Promise<boolean> => {
    if (selectedRowKeys.length === 0) return false;
    setBatchLoading(true);
    try {
      await batchUpdateUserStatus(selectedRowKeys, 1);
      message.success(`成功启用 ${selectedRowKeys.length} 个用户`);
      setSelectedRowKeys([]);
      fetchUsers();
      return true;
    } catch (error) {
      message.error('批量启用失败');
      return false;
    } finally {
      setBatchLoading(false);
    }
  }, [selectedRowKeys, fetchUsers, setSelectedRowKeys]);

  const handleBatchDisable = useCallback(async (): Promise<boolean> => {
    if (selectedRowKeys.length === 0) return false;
    setBatchLoading(true);
    try {
      await batchUpdateUserStatus(selectedRowKeys, 0);
      message.success(`成功禁用 ${selectedRowKeys.length} 个用户`);
      setSelectedRowKeys([]);
      fetchUsers();
      return true;
    } catch (error) {
      message.error('批量禁用失败');
      return false;
    } finally {
      setBatchLoading(false);
    }
  }, [selectedRowKeys, fetchUsers, setSelectedRowKeys]);

  return {
    batchLoading,
    handleToggleStatus,
    handleBatchEnable,
    handleBatchDisable,
  };
}
