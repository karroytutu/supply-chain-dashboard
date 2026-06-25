/**
 * 表单管理列表页 Hook
 * @module pages/Oa/FormConfig/hooks/useFormConfig
 *
 * 管理列表页的数据加载、分类筛选、搜索过滤和内联编辑保存。
 */
import { useState, useCallback, useEffect, useMemo } from 'react';
import { message } from 'antd';
import type { FormTypeDefinition, ActiveCategory } from '@/types/oa';
import { getAdminFormTypes, getAdminRoles, updateAdminFormType, batchGetUsersByIds } from '@/services/api/oa';

export function useFormConfig() {
  const [formTypes, setFormTypes] = useState<FormTypeDefinition[]>([]);
  const [roles, setRoles] = useState<Array<{ code: string; name: string }>>([]);
  const [userMap, setUserMap] = useState<Map<number, string>>(new Map());
  const [loading, setLoading] = useState(false);
  const [searchText, setSearchText] = useState('');
  const [activeCategory, setActiveCategory] = useState<ActiveCategory>('all');

  const loadFormTypes = useCallback(async () => {
    setLoading(true);
    try {
      const [types, rolesList] = await Promise.all([
        getAdminFormTypes(),
        getAdminRoles(),
      ]);
      setFormTypes(types as FormTypeDefinition[]);
      setRoles(rolesList);

      // 收集所有表单中的用户 ID，批量解析姓名
      const allUserIds = new Set<number>();
      for (const ft of types as FormTypeDefinition[]) {
        (ft as any).allowedUsers?.forEach((id: number) => allUserIds.add(id));
        (ft as any).dataReadUsers?.forEach((id: number) => allUserIds.add(id));
        (ft as any).dataExportUsers?.forEach((id: number) => allUserIds.add(id));
      }
      if (allUserIds.size > 0) {
        batchGetUsersByIds([...allUserIds]).then(users => {
          const map = new Map<number, string>();
          for (const u of users) map.set(u.id, u.name);
          setUserMap(map);
        }).catch(() => { /* 忽略失败，标签降级显示 ID */ });
      }
    } catch (error) {
      message.error('获取表单类型失败');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadFormTypes();
  }, [loadFormTypes]);

  /** 按分类统计数量 */
  const categoryCounts = useMemo<Record<string, number>>(() => {
    const counts: Record<string, number> = {};
    for (const ft of formTypes) {
      counts[ft.category] = (counts[ft.category] || 0) + 1;
    }
    return counts;
  }, [formTypes]);

  /** 按搜索文本 + 分类过滤 */
  const filteredFormTypes = useMemo(() => {
    let result = formTypes;

    // 分类过滤
    if (activeCategory !== 'all') {
      result = result.filter(ft => ft.category === activeCategory);
    }

    // 搜索过滤
    if (searchText) {
      const keyword = searchText.toLowerCase();
      result = result.filter(ft =>
        ft.name.toLowerCase().includes(keyword) ||
        ft.code.toLowerCase().includes(keyword) ||
        ft.description?.toLowerCase().includes(keyword)
      );
    }

    return result;
  }, [formTypes, activeCategory, searchText]);

  /** 保存表单配置（单字段更新） */
  const inlineUpdate = useCallback(
    async (code: string, data: Partial<{
      name: string;
      description: string;
      icon: string;
      category: string;
      allowedRoles: string[];
      dataReadRoles: string[];
      dataExportRoles: string[];
      allowedUsers: number[];
      dataReadUsers: number[];
      dataExportUsers: number[];
    }>) => {
      try {
        await updateAdminFormType(code, data);
        message.success('已保存');
        // 保存成功后刷新列表
        await loadFormTypes();
      } catch (error: any) {
        if (error?.status === 409) {
          message.error('数据已被其他用户修改，已自动刷新');
          await loadFormTypes();
        } else {
          message.error(error?.message || '保存失败');
        }
        throw error;
      }
    },
    [loadFormTypes]
  );

  return {
    formTypes: filteredFormTypes,
    allFormTypes: formTypes,
    loading,
    searchText,
    setSearchText,
    activeCategory,
    setActiveCategory,
    categoryCounts,
    roles,
    userMap,
    reload: loadFormTypes,
    inlineUpdate,
    saveFormType: inlineUpdate, // 新命名，向后兼容
  };
}
