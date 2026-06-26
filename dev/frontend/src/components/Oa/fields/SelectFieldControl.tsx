/**
 * 选择字段统一控件（select + radio）
 * mode=readonly: 文本展示
 * mode=editable: Select 组件
 * 支持 optionsFromField: 从 formData 中另一个字段的数组值动态生成下拉选项
 */
import React, { useMemo } from 'react';
import { Select, Typography } from 'antd';
import type { FieldControlProps } from './types';

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

const SelectFieldControl: React.FC<FieldControlProps> = ({ mode, field, value, onChange, allowedOptionValues, formData }) => {
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
    const option = effectiveOptions.find((o) => o.value === value);
    return <Text>{option?.label || (value as string)}</Text>;
  }

  let options = effectiveOptions;
  if (allowedOptionValues) {
    options = options.filter(opt => allowedOptionValues.includes(String(opt.value)));
  }
  return (
    <Select
      value={value as string | undefined}
      onChange={v => onChange?.(v)}
      placeholder={field.placeholder || `请选择${field.label}`}
      options={options}
      style={{ width: '100%' }}
    />
  );
};

export default SelectFieldControl;
