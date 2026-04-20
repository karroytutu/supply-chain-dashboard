/**
 * ERP 参考数据字段渲染组件
 * 处理 asset_search、erp_department、erp_staff、erp_payment_account、erp_asset_category 类型字段
 */
import React, { useState, useEffect, useCallback } from 'react';
import { Select, Spin, InputNumber } from 'antd';
import { oaApprovalApi, ErpReferenceType } from '@/services/api/oa-approval';
import type { FormField } from '@/types/oa-approval';

interface ErpFieldRendererProps {
  field: FormField;
  value?: unknown;
  onChange?: (value: unknown) => void;
  /** 级联父字段的值（如部门ID，用于员工筛选） */
  cascadeValue?: unknown;
  /** 表单实例，用于 autoFill */
  form?: {
    setFieldsValue: (values: Record<string, unknown>) => void;
    getFieldValue: (name: string) => unknown;
  };
}

/** searchApi 到 erp-reference 路由 type 参数的映射 */
const SEARCH_API_MAP: Record<string, ErpReferenceType> = {
  erp_assets: 'assets',
  erp_departments: 'departments',
  erp_staff: 'staff',
  erp_payment_accounts: 'payment-accounts',
  erp_asset_categories: 'asset-categories',
};

/** ERP 字段标签字段映射 */
const LABEL_FIELDS: Record<string, string> = {
  assets: 'name',
  departments: 'name',
  staff: 'name',
  'payment-accounts': 'name',
  'asset-categories': 'name',
};

/** ERP 字段值字段映射 */
const VALUE_FIELDS: Record<string, string> = {
  assets: 'id',
  departments: 'id',
  staff: 'id',
  'payment-accounts': 'id',
  'asset-categories': 'id',
};

const ErpFieldRenderer: React.FC<ErpFieldRendererProps> = ({
  field,
  value,
  onChange,
  cascadeValue,
  form,
}) => {
  const [options, setOptions] = useState<Array<{ label: string; value: unknown; raw: unknown }>>([]);
  const [loading, setLoading] = useState(false);
  const [keyword, setKeyword] = useState('');

  const erpType = field.searchApi ? SEARCH_API_MAP[field.searchApi] : null;

  /** 从 ERP 对象中提取 label */
  const getLabel = useCallback((item: Record<string, unknown>, type: string): string => {
    const labelField = LABEL_FIELDS[type] || 'name';
    if (field.type === 'asset_search' && field.displayFields?.length) {
      return field.displayFields
        .map((f) => item[f])
        .filter(Boolean)
        .join(' | ');
    }
    return String(item[labelField] ?? '');
  }, [field.type, field.displayFields]);

  /** 从 ERP 对象中提取 value */
  const getValue = useCallback((item: Record<string, unknown>, type: string): unknown => {
    const valueField = VALUE_FIELDS[type] || 'id';
    return item[valueField];
  }, []);

  /** 加载选项数据 */
  const fetchOptions = useCallback(async (searchKeyword?: string) => {
    if (!erpType) return;
    setLoading(true);
    try {
      const data = await oaApprovalApi.getErpReference(erpType, searchKeyword);
      const items = (Array.isArray(data) ? data : []) as Record<string, unknown>[];
      setOptions(
        items.map((item) => ({
          label: getLabel(item, erpType),
          value: getValue(item, erpType),
          raw: item,
        }))
      );
    } catch {
      setOptions([]);
    } finally {
      setLoading(false);
    }
  }, [erpType, getLabel, getValue]);

  /** 初始加载 */
  useEffect(() => {
    fetchOptions();
  }, [fetchOptions]);

  /** 级联值变化时重新加载 */
  useEffect(() => {
    if (field.cascadeFrom && cascadeValue !== undefined) {
      fetchOptions();
    }
  }, [cascadeValue, field.cascadeFrom, fetchOptions]);

  /** 搜索防抖 */
  const handleSearch = useCallback(
    (newKeyword: string) => {
      setKeyword(newKeyword);
      if (erpType === 'assets') {
        fetchOptions(newKeyword);
      }
    },
    [erpType, fetchOptions]
  );

  /** 选中后处理 autoFill */
  const handleChange = useCallback(
    (selectedValue: unknown) => {
      onChange?.(selectedValue);

      if (field.autoFill && form) {
        const selectedOption = options.find((opt) => opt.value === selectedValue);
        if (selectedOption) {
          const fillValues: Record<string, unknown> = {};
          const raw = selectedOption.raw as Record<string, unknown>;
          for (const [targetField, sourceField] of Object.entries(field.autoFill)) {
            fillValues[targetField] = raw[sourceField];
          }
          form.setFieldsValue(fillValues);
        }
      }
    },
    [onChange, field.autoFill, form, options]
  );

  // asset_category 类型用 InputNumber（存的是数字ID）
  if (field.type === 'erp_asset_category') {
    return (
      <Select
        showSearch
        value={value as number | undefined}
        onChange={handleChange}
        onSearch={handleSearch}
        loading={loading}
        placeholder={`请选择${field.label}`}
        filterOption={false}
        notFoundContent={loading ? <Spin size="small" /> : '无数据'}
        options={options.map((opt) => ({ label: opt.label, value: opt.value as number }))}
      />
    );
  }

  // 通用 ERP 选择器
  return (
    <Select
      showSearch
      value={value as (string | number) | undefined}
      onChange={handleChange}
      onSearch={handleSearch}
      loading={loading}
      placeholder={`请选择${field.label}`}
      filterOption={false}
      notFoundContent={loading ? <Spin size="small" /> : '无数据'}
      options={options.map((opt) => ({ label: opt.label, value: opt.value as string | number }))}
    />
  );
};

export default ErpFieldRenderer;
