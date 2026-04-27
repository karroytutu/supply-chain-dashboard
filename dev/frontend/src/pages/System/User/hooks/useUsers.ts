/**
 * 用户数据管理 Hook
 * 组合 useUserFilters + useUserData + 业务操作
 */
import { useState, useCallback } from 'react';
import { message } from 'antd';
import {
  updateUserStatus,
  batchUpdateUserStatus,
  batchAssignUserRoles,
} from '@/services/api/auth';
import type { UserItem } from '../types';
import { useUserFilters } from './useUserFilters';
import { useUserData } from './useUserData';

export function useUsers() {
  const {
    page,
    pageSize,
    filters,
    activeStatus,
    setFilters,
    setActiveStatus,
    setPage,
    handleSearch: searchFilter,
    handleReset: resetFilter,
    handlePageChange,
  } = useUserFilters();

  const {
    loading,
    dataSource,
    total,
    stats,
    roles,
    fetchUsers,
  } = useUserData(page, pageSize, filters, activeStatus);

  const [selectedRowKeys, setSelectedRowKeys] = useState<number[]>([]);
  const [batchLoading, setBatchLoading] = useState(false);

  const handleSearch = useCallback(() => {
    searchFilter();
    setSelectedRowKeys([]);
  }, [searchFilter]);

  const handleReset = useCallback(() => {
    resetFilter();
    setSelectedRowKeys([]);
  }, [resetFilter]);

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
  }, [selectedRowKeys, fetchUsers]);

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
  }, [selectedRowKeys, fetchUsers]);

  const handleBatchAssignRoles = useCallback(async (roleIds: number[]): Promise<boolean> => {
    if (selectedRowKeys.length === 0) return false;
    setBatchLoading(true);
    try {
      await batchAssignUserRoles(selectedRowKeys, roleIds);
      message.success(`成功为 ${selectedRowKeys.length} 个用户分配角色`);
      setSelectedRowKeys([]);
      fetchUsers();
      return true;
    } catch (error) {
      message.error('批量分配角色失败');
      return false;
    } finally {
      setBatchLoading(false);
    }
  }, [selectedRowKeys, fetchUsers]);

  return {
    loading,
    dataSource,
    total,
    page,
    pageSize,
    stats,
    selectedRowKeys,
    batchLoading,
    roles,
    filters,
    activeStatus,
    setFilters,
    setActiveStatus,
    setSelectedRowKeys,
    fetchUsers,
    handleSearch,
    handleReset,
    handlePageChange,
    handleToggleStatus,
    handleBatchEnable,
    handleBatchDisable,
    handleBatchAssignRoles,
  };
}
