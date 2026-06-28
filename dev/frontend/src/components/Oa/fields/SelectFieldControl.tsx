/**
 * 选择字段统一控件（select + radio）
 * mode=readonly: 文本展示（含 ERP 数据选择字段名称解析）
 * mode=editable: Select 组件
 * 支持 optionsFromField: 从 formData 中另一个字段的数组值动态生成下拉选项
 */
import React, { useMemo } from 'react';
import { Select, Typography } from 'antd';
import type { FieldControlProps } from './types';
import { ERP_SEARCH_API_MAP } from '@/constants/oa-erp';
import { resolveStoredName } from '../utils/resolveStoredName';
import ErpNameDisplay from '../ErpNameDisplay';

const { Text } = Typography;

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

const SelectFieldControl: React.FC<FieldControlProps> = ({ mode, field, value, onChange, allowedOptionValues, formData, resolvedMap }) => {
  const isMulti = !!field.multiple;

  // 动态选项：从 formData 中读取 optionsFromField 指定的数组
  const dynamicOptions = useMemo(() => {
    if (!field.optionsFromField || !formData) return undefined;
    return buildDynamicOptions(formData[field.optionsFromField]);
  }, [field.optionsFromField, formData]);

  // 使用动态选项（如有）或静态选项
  const effectiveOptions = dynamicOptions ?? field.options ?? [];

  if (mode === 'readonly') {
    if (value === null || value === undefined || value === '') {
      return <Text type="secondary">-</Text>;
    }
    // 多选：值为数组，展示逗号分隔的标签
    if (isMulti && Array.isArray(value)) {
      const labels = value.map(v => {
        const option = effectiveOptions.find((o) => String(o.value) === String(v));
        return option?.label || String(v);
      });
      return <Text>{labels.join('、') || '-'}</Text>;
    }
    // ERP 数据选择字段：解析 ID → 名称（与 cellValueRenderer 保持一致的三层降级策略）
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

  let options = effectiveOptions;
  if (allowedOptionValues) {
    options = options.filter(opt => allowedOptionValues.includes(String(opt.value)));
  }
  return (
    <Select
      mode={isMulti ? 'multiple' : undefined}
      value={isMulti ? (value as string[]) : (value as string | undefined)}
      onChange={v => onChange?.(v)}
      placeholder={field.placeholder || `请选择${field.label}`}
      options={options}
      style={{ width: '100%' }}
    />
  );
};

export default SelectFieldControl;
