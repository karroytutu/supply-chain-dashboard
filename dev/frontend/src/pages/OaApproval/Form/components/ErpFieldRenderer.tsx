/**
 * ERP 参考数据字段渲染组件
 * 处理 asset_search、erp_department、erp_staff、erp_payment_account、erp_asset_category 类型字段
 *
 * 性能优化：
 * - 模块级搜索结果缓存（5分钟 TTL），避免重复请求同一关键词
 * - 取消前一次进行中请求（AbortController），防止旧响应覆盖新结果
 * - 客户/资产搜索最小关键词长度 2 字符，避免无效请求
 */
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Select, Spin } from 'antd';
import { oaApprovalApi } from '@/services/api/oa-approval';
import type { FormField } from '@/types/oa-approval';
import { ERP_SEARCH_API_MAP, ERP_LABEL_FIELDS, ERP_VALUE_FIELDS } from '@/constants/oa-approval-erp';
import { getCachedOptions, setCachedOptions, DEBOUNCED_SEARCH_TYPES, MIN_SEARCH_LENGTH } from './erpSearchCache';
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
  cascadeValue?: unknown;
  /** 客户搜索是否包含所有状态（客户档案修改场景传 true） */
  includeAllStates?: boolean;
  form?: {
    setFieldsValue: (values: Record<string, unknown>) => void;
    getFieldValue: (name: string) => unknown;
  };
  onCustomerSelect?: (licenseInfo: CustomerLicenseInfo | null) => void;
}

const ErpFieldRenderer: React.FC<ErpFieldRendererProps> = ({
  field, value, onChange, cascadeValue, includeAllStates, form, onCustomerSelect,
}) => {
  const [options, setOptions] = useState<Array<{ label: string; value: unknown; raw: unknown }>>([]);
  const [loading, setLoading] = useState(false);
  const searchTimer = useRef<ReturnType<typeof setTimeout>>();
  const abortRef = useRef<AbortController | null>(null);

  const erpType = field.searchApi ? ERP_SEARCH_API_MAP[field.searchApi] : null;

  const getLabel = useCallback((item: Record<string, unknown>, type: string): string => {
    const labelField = ERP_LABEL_FIELDS[type] || 'name';
    if (field.type === 'asset_search' && field.displayFields?.length) {
      return field.displayFields.map((f) => item[f]).filter(Boolean).join(' | ');
    }
    return String(item[labelField] ?? '');
  }, [field.type, field.displayFields]);

  const getValue = useCallback((item: Record<string, unknown>, type: string): unknown => {
    return item[ERP_VALUE_FIELDS[type] || 'id'];
  }, []);

  /** 加载选项数据（支持缓存 + 请求取消） */
  const fetchOptions = useCallback(async (searchKeyword?: string) => {
    if (!erpType) return;
    if (field.cascadeFrom && cascadeValue === undefined) { setOptions([]); return; }

    const cascadeKeyPart = (erpType === 'settlement-orders' && cascadeValue) ? `:cid=${cascadeValue}` : '';
    // 缓存键需区分 includeAllStates 模式，避免同关键词返回错误模式的缓存
    const stateKeyPart = (erpType === 'customers' && includeAllStates) ? ':all' : '';
    const cacheKey = `${erpType}:${searchKeyword || ''}${cascadeKeyPart}${stateKeyPart}`;
    const cached = getCachedOptions(cacheKey);
    if (cached) { setOptions(cached); return; }

    if (abortRef.current) abortRef.current.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setLoading(true);
    try {
      const extraParams: Record<string, string> = {};
      if (erpType === 'settlement-orders' && cascadeValue) {
        extraParams.consumerId = String(cascadeValue);
      }
      // 客户档案修改场景：搜索包含所有状态的客户（含停用/待确认）
      if (erpType === 'customers' && includeAllStates) {
        extraParams.includeAllStates = 'true';
      }
      const data = await oaApprovalApi.getErpReference(erpType, searchKeyword, extraParams, controller.signal);
      const items = (Array.isArray(data) ? data : []) as Record<string, unknown>[];
      const newOptions = items.map((item) => ({ label: getLabel(item, erpType), value: getValue(item, erpType), raw: item }));
      setOptions(newOptions);
      setCachedOptions(cacheKey, newOptions);
    } catch (error: unknown) {
      if (error instanceof DOMException && error.name === 'AbortError') return;
      setOptions([]);
    } finally {
      setLoading(false);
    }
  }, [erpType, getLabel, getValue, field.cascadeFrom, cascadeValue, includeAllStates]);

  useEffect(() => { fetchOptions(); }, [fetchOptions]);

  useEffect(() => {
    if (field.cascadeFrom && cascadeValue !== undefined) {
      fetchOptions();
      onChange?.(field.multiple ? [] : undefined);
    }
  }, [cascadeValue, field.cascadeFrom, field.multiple, fetchOptions]);

  const handleSearch = useCallback(
    (newKeyword: string) => {
      if (DEBOUNCED_SEARCH_TYPES.has(erpType || '')) {
        if (newKeyword.length === 0) {
          if (searchTimer.current) clearTimeout(searchTimer.current);
          fetchOptions();
          return;
        }
        if (newKeyword.length < MIN_SEARCH_LENGTH) return;
        if (searchTimer.current) clearTimeout(searchTimer.current);
        searchTimer.current = setTimeout(() => fetchOptions(newKeyword), 300);
      }
    },
    [erpType, fetchOptions]
  );

  useEffect(() => () => { if (searchTimer.current) clearTimeout(searchTimer.current); }, []);

  /** 选中后处理 autoFill + nameField + 执照信息提取 */
  const handleChange = useCallback(
    (selectedValue: unknown) => {
      onChange?.(selectedValue);
      const selectedOption = options.find((opt) => opt.value === selectedValue);
      if (selectedOption) {
        const raw = selectedOption.raw as Record<string, unknown>;
        if (field.autoFill && form) {
          const fillValues: Record<string, unknown> = {};
          for (const [targetField, sourceField] of Object.entries(field.autoFill)) {
            fillValues[targetField] = raw[sourceField];
          }
          form.setFieldsValue(fillValues);
        }
        if (field.nameField && form) {
          form.setFieldsValue({ [field.nameField]: selectedOption.label });
        }
        if (field.type === 'erp_customer' && onCustomerSelect) {
          const ext = (raw.ext as Record<string, unknown>) || {};
          const picIds = (ext.attachedPicIds as string[]) || [];
          const picUrls = (raw.attachedPicUrls as string[]) || [];
          onCustomerSelect({ hasLicense: picIds.length > 0, imageCount: picIds.length, attachedPicUrls: picUrls });
        }
      } else if (field.type === 'erp_customer' && onCustomerSelect) {
        onCustomerSelect(null);
        if (field.nameField && form) form.setFieldsValue({ [field.nameField]: '' });
      }
    },
    [onChange, field.autoFill, field.nameField, field.type, form, options, onCustomerSelect]
  );

  const isDisabled = !!(field.cascadeFrom && cascadeValue === undefined);
  const notFound = loading ? <Spin size="small" /> : '无数据';

  if (field.type === 'erp_asset_category') {
    return (
      <Select showSearch value={value as number | undefined} onChange={handleChange}
        onSearch={handleSearch} loading={loading} placeholder={`请选择${field.label}`}
        filterOption={false} notFoundContent={notFound}
        options={options.map((opt) => ({ label: opt.label, value: opt.value as number }))}
      />
    );
  }

  if (erpType === 'settlement-orders' && field.multiple) {
    return (
      <SettlementOrderPicker
        value={(value as number[]) || []}
        consumerId={cascadeValue as string | number | undefined}
        onChange={(ids, labels) => {
          onChange?.(ids);
          if (field.nameField && form) {
            const nameLabels = labels && labels.length > 0
              ? labels
              : options.filter(opt => ids.includes(opt.value as number)).map(opt => opt.label);
            form.setFieldsValue({ [field.nameField]: nameLabels.join(', ') });
          }
        }}
        disabled={isDisabled}
        cachedOptions={options}
      />
    );
  }

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
