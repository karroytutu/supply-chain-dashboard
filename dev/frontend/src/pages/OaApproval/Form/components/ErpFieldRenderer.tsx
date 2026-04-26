/**
 * ERP 参考数据字段渲染组件
 * 处理 asset_search、erp_department、erp_staff、erp_payment_account、erp_asset_category 类型字段
 */
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Select, Spin } from 'antd';
import { oaApprovalApi } from '@/services/api/oa-approval';
import type { FormField } from '@/types/oa-approval';
import { ERP_SEARCH_API_MAP, ERP_LABEL_FIELDS, ERP_VALUE_FIELDS } from '@/constants/oa-approval-erp';
import SettlementOrderPicker from './SettlementOrderPicker';

/** 客户执照信息（从 ERP 搜索结果提取） */
export interface CustomerLicenseInfo {
  hasLicense: boolean;
  imageCount: number;
  attachedPicUrls: string[];
}

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
  /** 客户选中时回调，提取执照信息（仅 erp_customer 类型触发） */
  onCustomerSelect?: (licenseInfo: CustomerLicenseInfo | null) => void;
}

const ErpFieldRenderer: React.FC<ErpFieldRendererProps> = ({
  field, value, onChange, cascadeValue, form, onCustomerSelect,
}) => {
  const [options, setOptions] = useState<Array<{ label: string; value: unknown; raw: unknown }>>([]);
  const [loading, setLoading] = useState(false);
  const searchTimer = useRef<ReturnType<typeof setTimeout>>();

  const erpType = field.searchApi ? ERP_SEARCH_API_MAP[field.searchApi] : null;

  /** 从 ERP 对象中提取 label */
  const getLabel = useCallback((item: Record<string, unknown>, type: string): string => {
    const labelField = ERP_LABEL_FIELDS[type] || 'name';
    if (field.type === 'asset_search' && field.displayFields?.length) {
      return field.displayFields.map((f) => item[f]).filter(Boolean).join(' | ');
    }
    return String(item[labelField] ?? '');
  }, [field.type, field.displayFields]);

  /** 从 ERP 对象中提取 value */
  const getValue = useCallback((item: Record<string, unknown>, type: string): unknown => {
    return item[ERP_VALUE_FIELDS[type] || 'id'];
  }, []);

  /** 加载选项数据 */
  const fetchOptions = useCallback(async (searchKeyword?: string) => {
    if (!erpType) return;
    if (field.cascadeFrom && cascadeValue === undefined) { setOptions([]); return; }
    setLoading(true);
    try {
      const extraParams: Record<string, string> = {};
      if (erpType === 'settlement-orders' && cascadeValue) {
        extraParams.consumerId = String(cascadeValue);
      }
      const data = await oaApprovalApi.getErpReference(erpType, searchKeyword, extraParams);
      const items = (Array.isArray(data) ? data : []) as Record<string, unknown>[];
      setOptions(items.map((item) => ({ label: getLabel(item, erpType), value: getValue(item, erpType), raw: item })));
    } catch { setOptions([]); } finally { setLoading(false); }
  }, [erpType, getLabel, getValue, field.cascadeFrom, cascadeValue]);

  /** 初始加载 */
  useEffect(() => { fetchOptions(); }, [fetchOptions]);

  /** 级联值变化时重新加载并清空旧选择 */
  useEffect(() => {
    if (field.cascadeFrom && cascadeValue !== undefined) {
      fetchOptions();
      onChange?.(field.multiple ? [] : undefined);
    }
  }, [cascadeValue, field.cascadeFrom, field.multiple, fetchOptions]);

  /** 搜索防抖（500ms） */
  const handleSearch = useCallback(
    (newKeyword: string) => {
      if (erpType === 'assets' || erpType === 'customers') {
        if (searchTimer.current) clearTimeout(searchTimer.current);
        searchTimer.current = setTimeout(() => fetchOptions(newKeyword), 500);
      }
    },
    [erpType, fetchOptions]
  );

  useEffect(() => () => { if (searchTimer.current) clearTimeout(searchTimer.current); }, []);

  /** 选中后处理 autoFill + 执照信息提取 */
  const handleChange = useCallback(
    (selectedValue: unknown) => {
      onChange?.(selectedValue);
      const selectedOption = options.find((opt) => opt.value === selectedValue);
      if (selectedOption) {
        const raw = selectedOption.raw as Record<string, unknown>;
        // autoFill 逻辑
        if (field.autoFill && form) {
          const fillValues: Record<string, unknown> = {};
          for (const [targetField, sourceField] of Object.entries(field.autoFill)) {
            fillValues[targetField] = raw[sourceField];
          }
          form.setFieldsValue(fillValues);
        }
        // 客户选中时提取执照信息
        if (field.type === 'erp_customer' && onCustomerSelect) {
          const ext = (raw.ext as Record<string, unknown>) || {};
          const picIds = (ext.attachedPicIds as string[]) || [];
          const picUrls = (raw.attachedPicUrls as string[]) || [];
          onCustomerSelect({
            hasLicense: picIds.length > 0,
            imageCount: picIds.length,
            attachedPicUrls: picUrls,
          });
        }
      } else if (field.type === 'erp_customer' && onCustomerSelect) {
        // 清空选择时重置执照信息
        onCustomerSelect(null);
      }
    },
    [onChange, field.autoFill, field.type, form, options, onCustomerSelect]
  );

  const isDisabled = !!(field.cascadeFrom && cascadeValue === undefined);
  const notFound = loading ? <Spin size="small" /> : '无数据';

  // asset_category 类型（存的是数字ID）
  if (field.type === 'erp_asset_category') {
    return (
      <Select showSearch value={value as number | undefined} onChange={handleChange}
        onSearch={handleSearch} loading={loading} placeholder={`请选择${field.label}`}
        filterOption={false} notFoundContent={notFound}
        options={options.map((opt) => ({ label: opt.label, value: opt.value as number }))}
      />
    );
  }

  // 结算单多选：使用弹窗表格选择器
  if (erpType === 'settlement-orders' && field.multiple) {
    return (
      <SettlementOrderPicker options={options} value={(value as number[]) || []}
        onChange={(ids) => onChange?.(ids)} loading={loading} disabled={isDisabled}
      />
    );
  }

  // 通用 ERP 选择器（支持多选）
  return (
    <Select showSearch mode={field.multiple ? 'multiple' : undefined}
      value={value as (string | number | (string | number)[]) | undefined}
      onChange={handleChange} onSearch={handleSearch} loading={loading}
      placeholder={isDisabled ? '请先选择客户' : `请选择${field.label}`}
      filterOption={false} disabled={isDisabled} notFoundContent={notFound}
      options={options.map((opt) => ({ label: opt.label, value: opt.value as string | number }))}
    />
  );
};

export default ErpFieldRenderer;
