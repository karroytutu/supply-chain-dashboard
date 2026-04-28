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
import SettlementOrderPicker from './SettlementOrderPicker';

/** 客户执照信息（从 ERP 搜索结果提取） */
export interface CustomerLicenseInfo {
  hasLicense: boolean;
  imageCount: number;
  attachedPicUrls: string[];
}

// =====================================================
// 模块级搜索结果缓存
// =====================================================

interface CacheEntry {
  data: Array<{ label: string; value: unknown; raw: unknown }>;
  timestamp: number;
}

const erpSearchCache = new Map<string, CacheEntry>();
const ERP_SEARCH_CACHE_MAX = 50;
const ERP_SEARCH_CACHE_TTL = 5 * 60 * 1000; // 5分钟，与后端缓存 TTL 对齐

/** 需要防抖搜索 + 最小长度的 ERP 类型 */
const DEBOUNCED_SEARCH_TYPES = new Set(['assets', 'customers']);
const MIN_SEARCH_LENGTH = 2;

// =====================================================

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
  const abortRef = useRef<AbortController | null>(null);

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

  /** 加载选项数据（支持缓存 + 请求取消） */
  const fetchOptions = useCallback(async (searchKeyword?: string) => {
    if (!erpType) return;
    if (field.cascadeFrom && cascadeValue === undefined) { setOptions([]); return; }

    // 检查客户端缓存
    // 缓存键包含级联参数（如 consumerId），避免不同客户的数据互相污染
    const cascadeKeyPart = (erpType === 'settlement-orders' && cascadeValue) ? `:cid=${cascadeValue}` : '';
    const cacheKey = `${erpType}:${searchKeyword || ''}${cascadeKeyPart}`;
    const cached = erpSearchCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < ERP_SEARCH_CACHE_TTL) {
      setOptions(cached.data);
      return;
    }
    if (cached) {
      erpSearchCache.delete(cacheKey); // 过期条目清除
    }

    // 取消前一次进行中的请求
    if (abortRef.current) {
      abortRef.current.abort();
    }
    const controller = new AbortController();
    abortRef.current = controller;

    setLoading(true);
    try {
      const extraParams: Record<string, string> = {};
      if (erpType === 'settlement-orders' && cascadeValue) {
        extraParams.consumerId = String(cascadeValue);
      }
      const data = await oaApprovalApi.getErpReference(erpType, searchKeyword, extraParams, controller.signal);
      const items = (Array.isArray(data) ? data : []) as Record<string, unknown>[];
      const newOptions = items.map((item) => ({ label: getLabel(item, erpType), value: getValue(item, erpType), raw: item }));
      setOptions(newOptions);

      // 写入客户端缓存
      if (erpSearchCache.size >= ERP_SEARCH_CACHE_MAX) {
        const firstKey = erpSearchCache.keys().next().value;
        if (firstKey !== undefined) erpSearchCache.delete(firstKey);
      }
      erpSearchCache.set(cacheKey, { data: newOptions, timestamp: Date.now() });
    } catch (error: unknown) {
      // AbortError 不清空选项（新请求会覆盖）
      if (error instanceof DOMException && error.name === 'AbortError') return;
      setOptions([]);
    } finally {
      setLoading(false);
    }
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

  /** 搜索防抖（300ms）+ 最小搜索长度限制 */
  const handleSearch = useCallback(
    (newKeyword: string) => {
      if (DEBOUNCED_SEARCH_TYPES.has(erpType || '')) {
        // 空关键词：恢复初始列表
        if (newKeyword.length === 0) {
          if (searchTimer.current) clearTimeout(searchTimer.current);
          fetchOptions();
          return;
        }
        // 单字符搜索：不触发请求，保留当前选项
        if (newKeyword.length < MIN_SEARCH_LENGTH) {
          return;
        }
        // 正常搜索：防抖
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
        // autoFill 逻辑
        if (field.autoFill && form) {
          const fillValues: Record<string, unknown> = {};
          for (const [targetField, sourceField] of Object.entries(field.autoFill)) {
            fillValues[targetField] = raw[sourceField];
          }
          form.setFieldsValue(fillValues);
        }
        // nameField 写入：将选中项的显示名称存入 formData
        if (field.nameField && form) {
          form.setFieldsValue({ [field.nameField]: selectedOption.label });
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
        // 清空选择时重置执照信息和 nameField
        onCustomerSelect(null);
        if (field.nameField && form) {
          form.setFieldsValue({ [field.nameField]: '' });
        }
      }
    },
    [onChange, field.autoFill, field.nameField, field.type, form, options, onCustomerSelect]
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

  // 结算单多选：使用弹窗表格选择器（服务端分页）
  if (erpType === 'settlement-orders' && field.multiple) {
    return (
      <SettlementOrderPicker
        value={(value as number[]) || []}
        consumerId={cascadeValue as string | number | undefined}
        onChange={(ids, labels) => {
          onChange?.(ids);
          // 写入 nameField：优先使用 SettlementOrderPicker 返回的 labels
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
