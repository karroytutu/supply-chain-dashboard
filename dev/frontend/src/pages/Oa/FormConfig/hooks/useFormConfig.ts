/**
 * 表单管理列表页 Hook
 * @module pages/Oa/FormConfig/hooks/useFormConfig
 */
import { useState, useCallback, useEffect } from 'react';
import { message } from 'antd';
import { getAdminFormTypes } from '@/services/api/oa';

/** 表单类型管理视图 */
export interface AdminFormType {
  code: string;
  name: string;
  icon: string;
  category: string;
  sortOrder: number;
  description: string;
  version: number;
  allowedRoles?: string[];
  workflowDef: {
    nodes: Array<{
      order: number;
      name: string;
      type: string;
    }>;
    ccRoles?: string[];
  };
}

export function useFormConfig() {
  const [formTypes, setFormTypes] = useState<AdminFormType[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchText, setSearchText] = useState('');

  const loadFormTypes = useCallback(async () => {
    setLoading(true);
    try {
      const data = await getAdminFormTypes();
      setFormTypes(data as unknown as AdminFormType[]);
    } catch (error) {
      message.error('获取表单类型失败');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadFormTypes();
  }, [loadFormTypes]);

  // 按搜索文本过滤
  const filteredFormTypes = searchText
    ? formTypes.filter(
        (ft) =>
          ft.name.includes(searchText) ||
          ft.code.includes(searchText) ||
          ft.description?.includes(searchText)
      )
    : formTypes;

  return {
    formTypes: filteredFormTypes,
    loading,
    searchText,
    setSearchText,
    reload: loadFormTypes,
  };
}
