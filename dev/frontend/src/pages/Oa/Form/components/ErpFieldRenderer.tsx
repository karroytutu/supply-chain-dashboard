/**
 * ERP 参考数据字段渲染组件
 * 处理 asset_search、erp_department、erp_staff、erp_payment_account、erp_asset_category 类型字段
 *
 * 搜索策略：
 * - 服务端关键词类型（SERVER_KEYWORD_TYPES）：防抖 300ms 向后端发请求过滤，最小关键词 1 字符
 * - 客户端过滤类型（其他类型）：Ant Design 原生 filterOption 即时本地过滤，零额外 API 调用
 *
 * 性能优化：
 * - 模块级搜索结果缓存（5分钟 TTL），避免重复请求同一关键词
 * - 取消前一次进行中请求（AbortController），防止旧响应覆盖新结果
 */
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Select, Spin } from 'antd';
import { oaApi } from '@/services/api/oa';
import type { FormField } from '@/types/oa';
import { ERP_SEARCH_API_MAP, ERP_LABEL_FIELDS, ERP_VALUE_FIELDS } from '@/constants/oa-erp';
import { getCachedOptions, setCachedOptions, SERVER_KEYWORD_TYPES, MIN_SEARCH_LENGTH, buildCacheKey } from './erpSearchCache';
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
    // 采购订单富标签：单号 | 日期 | ¥金额
    if (type === 'purchase-orders') {
      const billStr = item.billStr || '';
      const date = String(item.operDateTime || '').slice(0, 10);
      const amount = Number(item.totalAmount);
      const amountStr = isNaN(amount) ? ''
        : `¥${amount.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
      return [billStr, date, amountStr].filter(Boolean).join(' | ');
    }
    // 预付款单富标签：单号 | ¥可用金额
    if (type === 'prepayments') {
      const billStr = item.paidBillStr || '';
      const amount = Number(item.availableAmount);
      const amountStr = isNaN(amount) ? ''
        : `¥${amount.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
      return [billStr, amountStr].filter(Boolean).join(' | ');
    }
    // 供应商收入单富标签：单号 | ¥剩余金额
    if (type === 'supplier-incomes') {
      const billStr = item.billStr || '';
      const amount = Number(item.leftAmount);
      const amountStr = isNaN(amount) ? ''
        : `¥${amount.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
      return [billStr, amountStr].filter(Boolean).join(' | ');
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

    const cascadeKeyPart = (erpType === 'settlement-orders' && cascadeValue) ? `:cid=${cascadeValue}`
      : (erpType === 'purchase-orders' && cascadeValue) ? `:sid=${cascadeValue}`
      : ((erpType === 'prepayments' || erpType === 'supplier-incomes') && cascadeValue) ? `:tid=${cascadeValue}`
      : '';
    // 缓存键需区分 includeAllStates 模式，避免同关键词返回错误模式的缓存
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
      if (erpType === 'settlement-orders' && cascadeValue) {
        extraParams.consumerId = String(cascadeValue);
      }
      // 采购订单级联：传递供应商 ID
      if (erpType === 'purchase-orders' && cascadeValue) {
        extraParams.supplierIds = String(cascadeValue);
      }
      // 预付款/供应商收入单级联：传递供应商 ID 作为 traderId
      if ((erpType === 'prepayments' || erpType === 'supplier-incomes') && cascadeValue) {
        extraParams.traderId = String(cascadeValue);
      }
      // 客户档案修改场景：搜索包含所有状态的客户（含停用/待确认）
      if (erpType === 'customers' && includeAllStates) {
        extraParams.includeAllStates = 'true';
      }
      const data = await oaApi.getErpReference(erpType, searchKeyword, extraParams, controller.signal);
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
  // eslint-disable-next-line react-hooks/exhaustive-deps -- 依赖稳定无需重复触发
  }, [cascadeValue, field.cascadeFrom, field.multiple, fetchOptions]);

  const handleSearch = useCallback(
    (newKeyword: string) => {
      if (!SERVER_KEYWORD_TYPES.has(erpType || '')) return; // 客户端类型：不处理，由 filterOption 过滤
      if (searchTimer.current) clearTimeout(searchTimer.current);
      if (newKeyword.length === 0) { fetchOptions(); return; }
      if (newKeyword.length < MIN_SEARCH_LENGTH) return;
      searchTimer.current = setTimeout(() => fetchOptions(newKeyword), 300);
    },
    [erpType, fetchOptions]
  );

  useEffect(() => () => { if (searchTimer.current) clearTimeout(searchTimer.current); }, []);

  /** 选中后处理 autoFill + nameField + 执照信息提取 + 采购明细拉取 */
  const handleChange = useCallback(
    (selectedValue: unknown) => {
      onChange?.(selectedValue);
      const selectedOption = options.find((opt) => opt.value === selectedValue);
      if (selectedOption) {
        const raw = selectedOption.raw as Record<string, unknown>;
        if (field.autoFill && form) {
          const fillValues: Record<string, unknown> = {};
          for (const [targetField, sourceField] of Object.entries(field.autoFill)) {
            const rawVal = raw[sourceField];
            // 纯数字字符串自动转为 number，确保 money 类型字段精度正确
            if (typeof rawVal === 'string') {
              const parsed = parseFloat(rawVal);
              fillValues[targetField] = !isNaN(parsed) && String(parsed) === rawVal.trim()
                ? parsed : rawVal;
            } else {
              fillValues[targetField] = rawVal;
            }
          }
          form.setFieldsValue(fillValues);
        }
        if (field.nameField && form) {
          form.setFieldsValue({ [field.nameField]: selectedOption.label });
        }
        // 采购订单选中后异步拉取行项明细，填充 purchaseLines 表格
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
    [onChange, field.autoFill, field.nameField, field.type, form, options, onCustomerSelect, erpType]
  );

  const isDisabled = !!(field.cascadeFrom && cascadeValue === undefined);
  const notFound = loading ? <Spin size="small" /> : '无数据';
  // 级联禁用态占位符：根据级联父字段类型显示不同提示
  const disabledPlaceholder = field.cascadeFrom
    ? (erpType === 'purchase-orders' || erpType === 'prepayments' || erpType === 'supplier-incomes' ? '请先选择供应商' : '请先选择客户')
    : `请选择${field.label}`;

  if (field.type === 'erp_asset_category') {
    return (
      <Select showSearch value={value as number | undefined} onChange={handleChange}
        onSearch={handleSearch} loading={loading} placeholder={`请选择${field.label}`}
        filterOption={false} notFoundContent={notFound}
        style={{ width: '100%' }}
        options={options.map((opt) => ({ label: opt.label, value: opt.value as number }))}
      />
    );
  }

  if (erpType === 'settlement-orders' && field.multiple) {
    return (
      <SettlementOrderPicker
        value={(value as number[]) || []}
        consumerId={cascadeValue as string | number | undefined}
        onChange={(ids, labels, records) => {
          onChange?.(ids);
          if (field.nameField && form) {
            const nameLabels = labels && labels.length > 0
              ? labels
              : options.filter(opt => ids.includes(opt.value as number)).map(opt => opt.label);
            form.setFieldsValue({ [field.nameField]: nameLabels.join(', ') });
          }
          // 存储结构化明细（供详情页表格渲染）
          if (field.detailsField && form) {
            const details = ids.map((bizId, idx) => {
              const rec = records?.[idx];
              return {
                bizStr: rec?.bizStr || labels?.[idx] || String(bizId),
                leftAmount: rec?.leftAmount || '0',
              };
            });
            form.setFieldsValue({ [field.detailsField]: JSON.stringify(details) });
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
      placeholder={isDisabled ? disabledPlaceholder : `请选择${field.label}`}
      filterOption={SERVER_KEYWORD_TYPES.has(erpType || '') ? false : (input, option) =>
        (option?.label ?? '').toString().toLowerCase().includes(input.toLowerCase())
      } disabled={isDisabled} notFoundContent={notFound}
      style={{ width: '100%' }}
      options={options.map((opt) => ({ label: opt.label, value: opt.value as string | number }))}
    />
  );
};

export default ErpFieldRenderer;
