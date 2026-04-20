/**
 * 用户数据管理 Hook
 */
import { useState, useEffect, useCallback } from 'react';
import { message } from 'antd';
import {
  getUserList,
  updateUserStatus,
  assignUserRoles,
  batchUpdateUserStatus,
  batchAssignUserRoles,
  getAllRoles,
} from '@/services/api/auth';
import type { UserItem, UserStats, UserFilters, RoleInfo } from '../types';

interface UseUsersReturn {
  // 数据状态
  loading: boolean;
  dataSource: UserItem[];
  total: number;
  page: number;
  pageSize: number;
  stats: UserStats;
  selectedRowKeys: number[];
  batchLoading: boolean;
  roles: RoleInfo[];

  // 筛选状态
  filters: UserFilters;
  activeStatus?: 'active' | 'disabled';

  // 筛选操作
  setFilters: (filters: Partial<UserFilters>) => void;
  setActiveStatus: (status?: 'active' | 'disabled') => void;
  setSelectedRowKeys: (keys: number[]) => void;

  // 数据操作
  fetchUsers: () => Promise<void>;
  handleSearch: () => void;
  handleReset: () => void;
  handlePageChange: (page: number, pageSize: number) => void;
  handleToggleStatus: (user: UserItem) => Promise<boolean>;
  handleBatchEnable: () => Promise<boolean>;
  handleBatchDisable: () => Promise<boolean>;
  handleBatchAssignRoles: (roleIds: number[]) => Promise<boolean>;
}

export function useUsers(): UseUsersReturn {
  // 数据状态
  const [loading, setLoading] = useState(false);
  const [dataSource, setDataSource] = useState<UserItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [stats, setStats] = useState<UserStats>({ total: 0, active: 0, disabled: 0 });
  const [selectedRowKeys, setSelectedRowKeys] = useState<number[]>([]);
  const [batchLoading, setBatchLoading] = useState(false);
  const [roles, setRoles] = useState<RoleInfo[]>([]);

  // 筛选状态
  const [filters, setFiltersState] = useState<UserFilters>({
    keyword: '',
    departmentId: undefined,
    roleId: undefined,
    status: undefined,
  });
  const [activeStatus, setActiveStatus] = useState<'active' | 'disabled' | undefined>();

  // 设置筛选条件
  const setFilters = useCallback((newFilters: Partial<UserFilters>) => {
    setFiltersState(prev => ({ ...prev, ...newFilters }));
  }, []);

  // 获取用户列表
  const fetchUsers = useCallback(async () => {
    setLoading(true);
    try {
      const params = {
        page,
        pageSize,
        keyword: filters.keyword || undefined,
        departmentId: filters.departmentId,
        roleId: filters.roleId,
        status: activeStatus === 'active' ? 1 : activeStatus === 'disabled' ? 0 : filters.status,
      };
      const result = await getUserList(params);
      setDataSource(result.data);
      setTotal(result.total);

      // 计算统计数据
      const activeCount = result.data.filter((u: UserItem) => u.status === 1).length;
      const disabledCount = result.data.filter((u: UserItem) => u.status === 0).length;
      setStats({
        total: result.total,
        active: activeCount,
        disabled: disabledCount,
      });
    } catch (error) {
      message.error('加载用户列表失败');
    } finally {
      setLoading(false);
    }
  }, [page, pageSize, filters, activeStatus]);

  // 加载角色列表
  const fetchRoles = useCallback(async () => {
    try {
      const result = await getAllRoles();
      setRoles(result);
    } catch (error) {
      // ignore
    }
  }, []);

  // 初始化加载
  useEffect(() => {
    fetchUsers();
    fetchRoles();
  }, [page, pageSize, activeStatus]);

  // 搜索
  const handleSearch = useCallback(() => {
    setPage(1);
    setSelectedRowKeys([]);
    fetchUsers();
  }, [fetchUsers]);

  // 重置
  const handleReset = useCallback(() => {
    setFiltersState({
      keyword: '',
      departmentId: undefined,
      roleId: undefined,
      status: undefined,
    });
    setActiveStatus(undefined);
    setPage(1);
    setSelectedRowKeys([]);
  }, []);

  // 分页变化
  const handlePageChange = useCallback((newPage: number, newPageSize: number) => {
    setPage(newPage);
    setPageSize(newPageSize);
    setSelectedRowKeys([]);
  }, []);

  // 切换单个用户状态
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

  // 批量启用
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

  // 批量禁用
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

  // 批量分配角色
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
    // 数据状态
    loading,
    dataSource,
    total,
    page,
    pageSize,
    stats,
    selectedRowKeys,
    batchLoading,
    roles,

    // 筛选状态
    filters,
    activeStatus,

    // 筛选操作
    setFilters,
    setActiveStatus,
    setSelectedRowKeys,

    // 数据操作
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
