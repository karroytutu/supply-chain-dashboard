/**
 * 公式字段统一控件（formula）
 * 始终只读展示，快照语义（显示提交时存储的计算结果）
 */
import React from 'react';
import { Typography } from 'antd';
import { formatCurrency } from '@/utils/format';
import type { FieldControlProps } from './types';

const { Text } = Typography;

const FormulaFieldControl: React.FC<FieldControlProps> = ({ field, value }) => {
  if (value === null || value === undefined || value === '') {
    return <Text type="secondary">-</Text>;
  }
  const num = Number(value);
  const precision = field.formulaPrecision ?? 2;
  if (precision === 2) {
    return <Text strong>{formatCurrency(num)}</Text>;
  }
  return <Text>{num.toLocaleString(undefined, { minimumFractionDigits: precision, maximumFractionDigits: precision })}</Text>;
};

export default FormulaFieldControl;
