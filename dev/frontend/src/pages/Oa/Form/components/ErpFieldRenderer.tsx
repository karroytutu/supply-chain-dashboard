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
import type { FormField, FormSchema } from '@/types/oa';
import { ERP_SEARCH_API_MAP, ERP_LABEL_FIELDS, ERP_VALUE_FIELDS, loadErpConfig } from '@/constants/oa-erp';
import { getCachedOptions, setCachedOptions, SERVER_KEYWORD_TYPES, MIN_SEARCH_LENGTH, buildCacheKey } from './erpSearchCache';
import SettlementOrderPicker from './SettlementOrderPicker';

/** 解析点号路径取值，如 'units.0.id' -> obj.units[0].id */
function resolvePath(obj: Record<string, unknown>, path: string): unknown {
  if (!path.includes('.')) return obj[path];
  return path.split('.').reduce<unknown>((acc, key) => {
    if (acc == null || typeof acc !== 'object') return undefined;
    return (acc as Record<string, unknown>)[key];
  }, obj);
}

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
  /** 表单 Schema（用于 bank_account_selector cascadeFrom 级联填充） */
  formSchema?: FormSchema;
  /** 单元格失焦回调（表格列宽动态计算用） */
  onBlur?: () => void;
}

const ErpFieldRenderer: React.FC<ErpFieldRendererProps> = ({
  field, value, onChange, cascadeValue, includeAllStates, form, onCustomerSelect, formSchema, onBlur,
}) => {
  const [options, setOptions] = useState<Array<{ label: string; value: unknown; raw: unknown }>>([]);
  const [loading, setLoading] = useState(false);
  const searchTimer = useRef<ReturnType<typeof setTimeout>>();
  const abortRef = useRef<AbortController | null>(null);

  // 首次渲染时从后端加载最新 ERP 类型配置（新增类型无需前端硬编码）
  useEffect(() => { loadErpConfig(); }, []);

  const erpType = field.searchApi ? ERP_SEARCH_API_MAP[field.searchApi] : null;

  const getLabel = useCallback((item: Record<string, unknown>, type: string): string => {
    const labelField = ERP_LABEL_FIELDS[type] || 'name';
    if (field.searchApi === 'erp_assets' && field.displayFields?.length) {
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

  /**
   * 选中后处理 autoFill + nameField + 执照信息提取 + 采购明细拉取
   *
   * 【闭包竞态修复】将选中值、autoFill、nameField 合并为一次 form.setFieldsValue 调用。
   * 原先分三次调用（onChange → autoFill → nameField），在表格上下文中每次触发
   * handleRowUpdate 基于旧 props 快照构建新数组，后调用覆盖前调用，导致 goodsId
   * 和 _goodsUnits 丢失。合并后仅一次 setFieldValue，消除竞态。
   */
  const handleChange = useCallback(
    (selectedValue: unknown) => {
      const selectedOption = options.find((opt) => opt.value === selectedValue);

      if (selectedOption) {
        const raw = selectedOption.raw as Record<string, unknown>;

        if (form) {
          // 合并选中值 + autoFill + nameField 到一次 setFieldsValue，消除多次同步覆盖的竞态
          const allValues: Record<string, unknown> = { [field.key]: selectedValue };

          if (field.autoFill) {
            for (const [targetField, sourceField] of Object.entries(field.autoFill)) {
              const rawVal = resolvePath(raw, sourceField);
              // 纯数字字符串自动转为 number，确保 money 类型字段精度正确
              if (typeof rawVal === 'string') {
                const parsed = parseFloat(rawVal);
                allValues[targetField] = !isNaN(parsed) && String(parsed) === rawVal.trim()
                  ? parsed : rawVal;
              } else {
                allValues[targetField] = rawVal;
              }
            }
          }

          if (field.nameField) {
            allValues[field.nameField] = selectedOption.label;
          }

          form.setFieldsValue(allValues);
          // 修复：form.setFieldsValue 不触发 onValuesChange，需显式调用 Form.Item 注入的 onChange
          // 以传播值变更到 Form 的 onValuesChange，同步更新 formData state
          onChange?.(selectedValue);
        } else {
          // 无 form 上下文：仅通过 onChange 更新选中值
          onChange?.(selectedValue);
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
        if (field.searchApi === 'erp_customers' && onCustomerSelect) {
          const ext = (raw.ext as Record<string, unknown>) || {};
          const picIds = (ext.attachedPicIds as string[]) || [];
          const picUrls = (raw.attachedPicUrls as string[]) || [];
          onCustomerSelect({ hasLicense: picIds.length > 0, imageCount: picIds.length, attachedPicUrls: picUrls });
        }
        // bank_account_selector 级联填充：供应商选中后自动填入银行账户信息
        if (form && formSchema?.fields) {
          const bankFields = formSchema.fields.filter(
            f => f.type === 'bank_account_selector' && f.cascadeFrom === field.key
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
          f => f.type === 'bank_account_selector' && f.cascadeFrom === field.key
        );
        for (const bankField of bankFields) {
          form.setFieldsValue({ [bankField.key]: null });
        }
      }
    },
    [onChange, field.autoFill, field.nameField, field.type, field.key, form, options, onCustomerSelect, erpType, formSchema]
  );

  const isDisabled = !!(field.cascadeFrom && cascadeValue === undefined);
  const notFound = loading ? <Spin size="small" /> : '无数据';
  // 级联禁用态占位符：根据级联父字段类型显示不同提示
  const disabledPlaceholder = field.cascadeFrom
    ? (erpType === 'purchase-orders' || erpType === 'prepayments' || erpType === 'supplier-incomes' ? '请先选择供应商' : '请先选择客户')
    : `请选择${field.label}`;

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
          // 自动持久化选中记录到 _details[field.key]，供详情页展示
          if (form && records && records.length > 0) {
            const existingDetails = (form.getFieldValue('_details') as Record<string, unknown>) || {};
            form.setFieldsValue({
              _details: { ...existingDetails, [field.key]: records },
            });
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

export default ErpFieldRenderer;
