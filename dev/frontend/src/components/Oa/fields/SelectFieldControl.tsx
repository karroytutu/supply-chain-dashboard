/**
 * 选择字段统一控件（select + radio）
 * mode=readonly: 文本展示
 * mode=editable: Select 组件
 */
import React from 'react';
import { Select, Typography } from 'antd';
import type { FieldControlProps } from './types';

const { Text } = Typography;

const SelectFieldControl: React.FC<FieldControlProps> = ({ mode, field, value, onChange, allowedOptionValues }) => {
  // select / radio
  if (mode === 'readonly') {
    if (value === null || value === undefined || value === '') {
      return <Text type="secondary">-</Text>;
    }
    const option = field.options?.find((o) => o.value === value);
    return <Text>{option?.label || (value as string)}</Text>;
  }

  let options = field.options || [];
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
