/**
 * 选择字段统一控件（select）
 * mode=readonly: 文本展示（含 ERP 数据选择字段名称解析）
 * mode=editable: Select 组件
 *   - 有 options / optionsFromField → 静态下拉
 *   - 有 searchApi → 远程搜索（含 autoFill、级联、缓存等完整能力）
 *
 * 远程搜索策略：
 * - 服务端关键词类型（SERVER_KEYWORD_TYPES）：防抖 300ms 向后端发请求过滤
 * - 客户端过滤类型（其他类型）：Ant Design 原生 filterOption 即时本地过滤
 *
 * 性能优化：
 * - 模块级搜索结果缓存（5分钟 TTL），避免重复请求同一关键词
 * - 取消前一次进行中请求（AbortController），防止旧响应覆盖新结果
 */
import React, { useMemo, useState, useEffect, useCallback, useRef } from 'react';
import { Select, Spin, Typography } from 'antd';
import { useIsMobile } from '@/hooks/useMobileDetect';
import { MobileSelect } from '@/components/Mobile';
import type { FieldControlProps } from './types';
import { useEditableForm, type EditableFormContextValue } from '../EditableFormContext';
import { ERP_SEARCH_API_MAP, ERP_LABEL_FIELDS, ERP_VALUE_FIELDS, loadErpConfig } from '@/constants/oa-erp';
import { oaApi } from '@/services/api/oa';
import { isAbortError } from '@/services/api/request';
import { getCachedOptions, setCachedOptions, SERVER_KEYWORD_TYPES, MIN_SEARCH_LENGTH, buildCacheKey } from '@/pages/Oa/Form/components/erpSearchCache';
import SettlementOrderPicker from '@/pages/Oa/Form/components/SettlementOrderPicker';
import { resolveStoredName } from '../utils/resolveStoredName';
import ErpNameDisplay from '../ErpNameDisplay';

const { Text } = Typography;

// =====================================================
// 工具函数
// =====================================================

/** 解析点号路径取值，如 'units.0.id' -> obj.units[0].id */
function resolvePath(obj: Record<string, unknown>, path: string): unknown {
  if (!path.includes('.')) return obj[path];
  return path.split('.').reduce<unknown>((acc, key) => {
    if (acc == null || typeof acc !== 'object') return undefined;
    return (acc as Record<string, unknown>)[key];
  }, obj);
}

/** 将 optionsFromField 来源的数组转换为标准 options 格式 */
export function buildDynamicOptions(sourceData: unknown): Array<{ value: string | number; label: string }> | undefined {
  if (!Array.isArray(sourceData)) return undefined;
  return sourceData.map((item: unknown) => {
    if (typeof item === 'object' && item !== null) {
      const obj = item as Record<string, unknown>;
      return {
        value: (obj.id ?? obj.value ?? obj.key ?? String(item)) as string | number,
        label: String(obj.name ?? obj.label ?? obj.text ?? String(item)),
      };
    }
    return { value: String(item), label: String(item) };
  });
}

/** 生成 ERP 搜索选项的富标签 */
function getErpLabel(item: Record<string, unknown>, type: string, searchApi?: string, displayFields?: string[]): string {
  const labelField = ERP_LABEL_FIELDS[type] || 'name';
  if (searchApi === 'erp_assets' && displayFields?.length) {
    return displayFields.map((f) => item[f]).filter(Boolean).join(' | ');
  }
  if (type === 'purchase-orders') {
    const billStr = item.billStr || '';
    const date = String(item.operDateTime || '').slice(0, 10);
    const amount = Number(item.totalAmount);
    const amountStr = isNaN(amount) ? ''
      : `¥${amount.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    return [billStr, date, amountStr].filter(Boolean).join(' | ');
  }
  if (type === 'prepayments') {
    const billStr = item.paidBillStr || '';
    const amount = Number(item.availableAmount);
    const amountStr = isNaN(amount) ? ''
      : `¥${amount.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    return [billStr, amountStr].filter(Boolean).join(' | ');
  }
  if (type === 'supplier-incomes') {
    const billStr = item.billStr || '';
    const amount = Number(item.leftAmount);
    const amountStr = isNaN(amount) ? ''
      : `¥${amount.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    return [billStr, amountStr].filter(Boolean).join(' | ');
  }
  return String(item[labelField] ?? '');
}

// =====================================================
// 组件
// =====================================================

const SelectFieldControl: React.FC<FieldControlProps> = ({
  mode, field, value, onChange, allowedOptionValues, formData, resolvedMap,
  form: formOverride, onCustomerSelect, formSchema, includeAllStates, onBlur, cascadeValue: propCascadeValue,
}) => {
  const editableForm = useEditableForm();
  const effectiveForm = formOverride ?? editableForm;
  const isMulti = !!field.multiple;
  const isMobile = useIsMobile();

  // 静态/动态选项（非 ERP 模式）
  const dynamicOptions = useMemo(() => {
    if (!field.optionsFromField || !formData) return undefined;
    return buildDynamicOptions(formData[field.optionsFromField]);
  }, [field.optionsFromField, formData]);
  const effectiveOptions = dynamicOptions ?? field.options ?? [];

  // =====================================================
  // readonly 模式
  // =====================================================
  if (mode === 'readonly') {
    if (value === null || value === undefined || value === '') {
      return <Text type="secondary">-</Text>;
    }
    if (isMulti && Array.isArray(value)) {
      const labels = value.map(v => {
        const option = effectiveOptions.find((o) => String(o.value) === String(v));
        return option?.label || String(v);
      });
      return <Text>{labels.join('、') || '-'}</Text>;
    }
    if (field.searchApi) {
      const storedName = resolveStoredName(field.nameField, formData);
      if (storedName) return <Text>{storedName}</Text>;
      const erpType = ERP_SEARCH_API_MAP[field.searchApi];
      if (erpType) {
        const cacheKey = `${erpType}:${value}`;
        if (resolvedMap?.[cacheKey]) return <Text>{resolvedMap[cacheKey]}</Text>;
        return <ErpNameDisplay erpType={erpType} id={value} />;
      }
      return <Text>{String(value)}</Text>;
    }
    const option = effectiveOptions.find((o) => o.value === value);
    return <Text>{option?.label || (value as string)}</Text>;
  }

  // =====================================================
  // editable 模式
  // =====================================================

  // 有 searchApi → ERP 远程搜索模式
  if (field.searchApi) {
    return (
      <ErpSearchSelect
        field={field} value={value} onChange={onChange}
        form={effectiveForm} cascadeValue={propCascadeValue}
        onCustomerSelect={onCustomerSelect} formSchema={formSchema}
        includeAllStates={includeAllStates} onBlur={onBlur}
      />
    );
  }

  // 无 searchApi → 静态选项模式
  let options = effectiveOptions;
  if (allowedOptionValues) {
    options = options.filter(opt => allowedOptionValues.includes(String(opt.value)));
  }

  // 移动端单选使用 MobileSelect（多选保持 antd Select）
  if (isMobile && !isMulti) {
    return (
      <MobileSelect
        value={value as string | number | undefined}
        onChange={v => onChange?.(v)}
        options={options.map(o => ({ value: o.value as string | number, label: String(o.label) }))}
        placeholder={field.placeholder || `请选择${field.label}`}
        disabled={field.disabled}
        allowClear
        title={field.label}
        style={{ width: '100%' }}
      />
    );
  }

  return (
    <Select
      mode={isMulti ? 'multiple' : undefined}
      value={isMulti ? (value as string[]) : (value as string | undefined)}
      onChange={v => onChange?.(v)}
      placeholder={field.placeholder || `请选择${field.label}`}
      options={options}
      disabled={field.disabled}
      style={{ width: '100%' }}
    />
  );
};

export default SelectFieldControl;

// =====================================================
// ERP 远程搜索 Select（内部子组件）
// =====================================================

interface ErpSearchSelectProps {
  field: FieldControlProps['field'];
  value: unknown;
  onChange?: (value: unknown) => void;
  form?: EditableFormContextValue | null;
  cascadeValue?: unknown;
  onCustomerSelect?: FieldControlProps['onCustomerSelect'];
  formSchema?: FieldControlProps['formSchema'];
  includeAllStates?: boolean;
  onBlur?: () => void;
}

const ErpSearchSelect: React.FC<ErpSearchSelectProps> = ({
  field, value, onChange, form, cascadeValue, onCustomerSelect, formSchema, includeAllStates, onBlur,
}) => {
  const [options, setOptions] = useState<Array<{ label: string; value: unknown; raw: unknown }>>([]);
  const [loading, setLoading] = useState(false);
  const searchTimer = useRef<ReturnType<typeof setTimeout>>();
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => { loadErpConfig(); }, []);

  const erpType = field.searchApi ? ERP_SEARCH_API_MAP[field.searchApi] : null;

  const getLabel = useCallback(
    (item: Record<string, unknown>, type: string) => getErpLabel(item, type, field.searchApi, field.displayFields),
    [field.searchApi, field.displayFields],
  );

  const getValue = useCallback((item: Record<string, unknown>, type: string): unknown => {
    return item[ERP_VALUE_FIELDS[type] || 'id'];
  }, []);

  const fetchOptions = useCallback(async (searchKeyword?: string) => {
    if (!erpType) return;
    if (field.cascadeFrom && cascadeValue === undefined) { setOptions([]); return; }

    const cascadeKeyPart = (erpType === 'settlement-orders' && cascadeValue) ? `:cid=${cascadeValue}`
      : (erpType === 'purchase-orders' && cascadeValue) ? `:sid=${cascadeValue}`
      : ((erpType === 'prepayments' || erpType === 'supplier-incomes') && cascadeValue) ? `:tid=${cascadeValue}`
      : '';
    const stateKeyPart = (erpType === 'customers' && includeAllStates) ? ':all' : '';
    const cacheKey = buildCacheKey(erpType, searchKeyword, cascadeKeyPart, stateKeyPart);
    const cached = getCachedOptions(cacheKey);
    if (cached) { setOptions(cached); return; }

    if (abortRef.current) abortRef.current.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setLoading(true);
    try {
      const extraParams: Record<string, string> = {};
      if (erpType === 'settlement-orders' && cascadeValue) extraParams.consumerId = String(cascadeValue);
      if (erpType === 'purchase-orders' && cascadeValue) extraParams.supplierIds = String(cascadeValue);
      if ((erpType === 'prepayments' || erpType === 'supplier-incomes') && cascadeValue) extraParams.traderId = String(cascadeValue);
      if (erpType === 'customers' && includeAllStates) extraParams.includeAllStates = 'true';
      const data = await oaApi.getErpReference(erpType, searchKeyword, extraParams, controller.signal);
      const items = (Array.isArray(data) ? data : []) as Record<string, unknown>[];
      const newOptions = items.map((item) => ({ label: getLabel(item, erpType), value: getValue(item, erpType), raw: item }));
      setOptions(newOptions);
      setCachedOptions(cacheKey, newOptions);
    } catch (error: unknown) {
      if (isAbortError(error)) return;
      setOptions([]);
    } finally {
      setLoading(false);
    }
  }, [erpType, getLabel, getValue, field.cascadeFrom, cascadeValue, includeAllStates]);

  useEffect(() => {
    if (field.cascadeFrom) return; // 级联场景由 cascadeValue effect 统一处理，避免首次挂载双重请求
    fetchOptions();
  }, [fetchOptions]);

  useEffect(() => {
    if (field.cascadeFrom && cascadeValue !== undefined) {
      fetchOptions();
      onChange?.(field.multiple ? [] : undefined);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps -- 依赖稳定无需重复触发
  }, [cascadeValue, field.cascadeFrom, field.multiple, fetchOptions]);

  const handleSearch = useCallback((newKeyword: string) => {
    if (!SERVER_KEYWORD_TYPES.has(erpType || '')) return;
    if (searchTimer.current) clearTimeout(searchTimer.current);
    if (newKeyword.length === 0) { fetchOptions(); return; }
    if (newKeyword.length < MIN_SEARCH_LENGTH) return;
    searchTimer.current = setTimeout(() => fetchOptions(newKeyword), 300);
  }, [erpType, fetchOptions]);

  useEffect(() => () => { if (searchTimer.current) clearTimeout(searchTimer.current); }, []);

  /**
   * 选中后处理 autoFill + nameField + 执照信息提取 + 采购明细拉取
   * 合并为一次 form.setFieldsValue 调用，消除多次同步覆盖的竞态
   */
  const handleChange = useCallback((selectedValue: unknown) => {
    const selectedOption = options.find((opt) => opt.value === selectedValue);

    if (selectedOption) {
      const raw = selectedOption.raw as Record<string, unknown>;
      if (form) {
        const allValues: Record<string, unknown> = { [field.key]: selectedValue };
        if (field.autoFill) {
          for (const [targetField, sourceField] of Object.entries(field.autoFill)) {
            const rawVal = resolvePath(raw, sourceField);
            if (typeof rawVal === 'string') {
              const parsed = parseFloat(rawVal);
              allValues[targetField] = !isNaN(parsed) && String(parsed) === rawVal.trim() ? parsed : rawVal;
            } else {
              allValues[targetField] = rawVal;
            }
          }
        }
        if (field.nameField) allValues[field.nameField] = selectedOption.label;
        form.setFieldsValue(allValues);
        onChange?.(selectedValue);
      } else {
        onChange?.(selectedValue);
      }

      // 采购订单选中后异步拉取行项明细
      if (erpType === 'purchase-orders' && form && selectedValue) {
        const billId = Number(selectedValue);
        if (billId > 0) {
          oaApi.getPurchaseOrderAnalysis(billId)
            .then(analysis => {
              if (analysis.purchaseLines?.length > 0) {
                form.setFieldsValue({ purchaseLines: analysis.purchaseLines });
              }
            })
            .catch(err => console.warn('获取采购订单明细失败:', err));
        }
      }
      // 客户执照信息提取
      if (field.searchApi === 'erp_customers' && onCustomerSelect) {
        const ext = (raw.ext as Record<string, unknown>) || {};
        const picIds = (ext.attachedPicIds as string[]) || [];
        const picUrls = (raw.attachedPicUrls as string[]) || [];
        onCustomerSelect({ hasLicense: picIds.length > 0, imageCount: picIds.length, attachedPicUrls: picUrls });
      }
      // bank_account_selector 级联填充
      if (form && formSchema?.fields) {
        const bankFields = formSchema.fields.filter(
          f => f.type === 'bank_account_selector' && f.cascadeFrom === field.key,
        );
        for (const bankField of bankFields) {
          const bankValue = (raw.bankAccountName || raw.openingBank || raw.account)
            ? {
                accountName: (raw.bankAccountName as string) || '',
                accountNumber: (raw.account as string) || '',
                bankName: (raw.openingBank as string) || '',
                branchName: '',
              }
            : null;
          form.setFieldsValue({ [bankField.key]: bankValue });
        }
      }
    } else if (field.searchApi === 'erp_customers' && onCustomerSelect) {
      onCustomerSelect(null);
      if (field.nameField && form) form.setFieldsValue({ [field.nameField]: '' });
    }
    // 供应商清空时级联清空银行账户
    if (!selectedOption && form && formSchema?.fields) {
      const bankFields = formSchema.fields.filter(
        f => f.type === 'bank_account_selector' && f.cascadeFrom === field.key,
      );
      for (const bankField of bankFields) {
        form.setFieldsValue({ [bankField.key]: null });
      }
    }
  }, [onChange, field.autoFill, field.nameField, field.type, field.key, field.searchApi, form, options, onCustomerSelect, erpType, formSchema]);

  const isDisabled = !!(field.cascadeFrom && cascadeValue === undefined);
  const notFound = loading ? <Spin size="small" /> : '无数据';
  const disabledPlaceholder = field.cascadeFrom
    ? (erpType === 'purchase-orders' || erpType === 'prepayments' || erpType === 'supplier-incomes' ? '请先选择供应商' : '请先选择客户')
    : `请选择${field.label}`;

  // 资产分类特殊渲染
  if (field.searchApi === 'erp_asset_categories') {
    return (
      <Select showSearch value={value as number | undefined} onChange={handleChange}
        onSearch={handleSearch} onBlur={onBlur} loading={loading} placeholder={`请选择${field.label}`}
        filterOption={false} notFoundContent={notFound}
        style={{ width: '100%' }} dropdownMatchSelectWidth={false}
        options={options.map((opt) => ({ label: opt.label, value: opt.value as number }))}
      />
    );
  }

  // 结算单多选特殊渲染
  if (erpType === 'settlement-orders' && field.multiple) {
    return (
      <SettlementOrderPicker
        value={(value as number[]) || []}
        consumerId={cascadeValue as string | number | undefined}
        extraQueryParams={field.defaultQueryParams}
        onChange={(ids, labels, records) => {
          onChange?.(ids);
          if (field.nameField && form) {
            const nameLabels = labels && labels.length > 0
              ? labels
              : options.filter(opt => ids.includes(opt.value as number)).map(opt => opt.label);
            form.setFieldsValue({ [field.nameField]: nameLabels.join(', ') });
          }
          if (form && records && records.length > 0) {
            const existingDetails = (form.getFieldValue('_details') as Record<string, unknown>) || {};
            form.setFieldsValue({ _details: { ...existingDetails, [field.key]: records } });
          }
        }}
        disabled={isDisabled}
        cachedOptions={options}
      />
    );
  }

  // 通用 ERP 搜索 Select
  return (
    <Select showSearch mode={field.multiple ? 'multiple' : undefined}
      value={value as (string | number | (string | number)[]) | undefined}
      onChange={handleChange} onSearch={handleSearch} onBlur={onBlur} loading={loading}
      placeholder={isDisabled ? disabledPlaceholder : `请选择${field.label}`}
      filterOption={SERVER_KEYWORD_TYPES.has(erpType || '') ? false : (input, option) =>
        (option?.label ?? '').toString().toLowerCase().includes(input.toLowerCase())
      } disabled={isDisabled} notFoundContent={notFound}
      style={{ width: '100%' }} dropdownMatchSelectWidth={false}
      options={options.map((opt) => ({ label: opt.label, value: opt.value as string | number }))}
    />
  );
};
