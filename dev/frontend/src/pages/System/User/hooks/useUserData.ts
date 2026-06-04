/**
 * 用户管理 - 数据获取 Hook
 */
import { useState, useCallback, useEffect } from 'react';
import { message } from 'antd';
import { getUserList, getAllRoles } from '@/services/api/auth';
import type { UserItem, UserStats, UserFilters, RoleInfo } from '../types';

export function useUserData(
  page: number,
  pageSize: number,
  filters: UserFilters,
  activeStatus?: 'active' | 'disabled'
) {
  const [loading, setLoading] = useState(false);
  const [dataSource, setDataSource] = useState<UserItem[]>([]);
  const [total, setTotal] = useState(0);
  const [stats, setStats] = useState<UserStats>({ total: 0, active: 0, disabled: 0 });
  const [roles, setRoles] = useState<RoleInfo[]>([]);

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
      const activeCount = result.data.filter((u: UserItem) => u.status === 1).length;
      const disabledCount = result.data.filter((u: UserItem) => u.status === 0).length;
      setStats({ total: result.total, active: activeCount, disabled: disabledCount });
    } catch (error) {
      message.error('加载用户列表失败');
    } finally {
      setLoading(false);
    }
  }, [page, pageSize, filters, activeStatus]);

  const fetchRoles = useCallback(async () => {
    try {
      const result = await getAllRoles();
      setRoles(result);
    } catch (error) {
      // ignore
    }
  }, []);

  useEffect(() => {
    fetchUsers();
    fetchRoles();
  // eslint-disable-next-line react-hooks/exhaustive-deps -- 依赖稳定无需重复触发
  }, [page, pageSize, activeStatus]);

  return {
    loading,
    dataSource,
    total,
    stats,
    roles,
    fetchUsers,
  };
}
