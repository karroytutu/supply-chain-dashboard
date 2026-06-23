/**
 * 日期字段统一控件（date + datetime + date-range）
 * mode=readonly: 格式化文本展示
 * mode=editable: DatePicker / RangePicker
 */
import React from 'react';
import { DatePicker, Typography } from 'antd';
import dayjs from 'dayjs';
import { formatDate, formatDateTime } from '@/utils/format';
import type { FieldControlProps } from './types';

const { Text } = Typography;

const DateFieldControl: React.FC<FieldControlProps> = ({ mode, field, value, onChange }) => {
  // date-range 类型
  if (field.type === 'date-range') {
    if (mode === 'readonly') {
      if (value === null || value === undefined || value === '') {
        return <Text type="secondary">-</Text>;
      }
      const dates = value as [string, string];
      if (!Array.isArray(dates) || dates.length < 2) return <Text>{String(value)}</Text>;
      return <Text>{formatDate(dates[0])} ~ {formatDate(dates[1])}</Text>;
    }
    // editable
    const rangeValue = Array.isArray(value) && value.length >= 2
      ? [dayjs(value[0] as string), dayjs(value[1] as string)] as [dayjs.Dayjs, dayjs.Dayjs]
      : undefined;
    return (
      <DatePicker.RangePicker
        value={rangeValue}
        onChange={(_, dateStrings) => onChange?.(dateStrings as unknown)}
        style={{ width: '100%' }}
      />
    );
  }

  // date / datetime 类型
  if (mode === 'readonly') {
    if (value === null || value === undefined || value === '') {
      return <Text type="secondary">-</Text>;
    }
    return <Text>{field.type === 'datetime' ? formatDateTime(value as string) : formatDate(value as string)}</Text>;
  }

  // editable
  return (
    <DatePicker
      value={value ? dayjs(value as string) : undefined}
      onChange={(_, dateString) => onChange?.(dateString as string)}
      placeholder={field.placeholder || `请选择${field.label}`}
      style={{ width: '100%' }}
    />
  );
};

export default DateFieldControl;
