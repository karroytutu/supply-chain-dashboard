/**
 * 用户管理 - 数据获取 Hook
 */
import { useState, useCallback, useEffect } from 'react';
import { message } from 'antd';
import { getUserList, getAllRoles } from '@/services/api/auth';
import type { UserItem, UserFilters, RoleInfo } from '../types';

export function useUserData(
  page: number,
  pageSize: number,
  filters: UserFilters,
  searchVersion: number
) {
  const [loading, setLoading] = useState(false);
  const [dataSource, setDataSource] = useState<UserItem[]>([]);
  const [total, setTotal] = useState(0);
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
        status: filters.status,
      };
      const result = await getUserList(params);
      setDataSource(result.data);
      setTotal(result.total);
    } catch (error) {
      message.error('加载用户列表失败');
    } finally {
      setLoading(false);
    }
  }, [page, pageSize, filters]);

  // 角色列表仅加载一次（静态数据，无需随搜索重复请求）
  useEffect(() => {
    const fetchRoles = async () => {
      try {
        const result = await getAllRoles();
        setRoles(result);
      } catch (error) {
        // ignore
      }
    };
    fetchRoles();
  }, []);

  // 搜索/翻页/筛选变更时重新加载用户列表
  // searchVersion 确保点击"搜索"或"重置"按钮时始终触发 refetch
  useEffect(() => {
    fetchUsers();
  // eslint-disable-next-line react-hooks/exhaustive-deps -- fetchUsers 引用随 filters 更新，searchVersion 控制显式触发
  }, [page, pageSize, filters, searchVersion]);

  return {
    loading,
    dataSource,
    total,
    roles,
    fetchUsers,
  };
}
