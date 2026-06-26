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

  // 有 suffix 时按 suffix 渲染（如利润率 %），不使用 formatCurrency
  if (field.suffix) {
    return (
      <Text strong>
        {num.toLocaleString('zh-CN', { minimumFractionDigits: precision, maximumFractionDigits: precision })}
        {field.suffix}
      </Text>
    );
  }

  // 无 suffix：默认按货币渲染
  if (precision === 2) {
    return <Text strong>{formatCurrency(num)}</Text>;
  }
  return <Text>{num.toLocaleString('zh-CN', { minimumFractionDigits: precision, maximumFractionDigits: precision })}</Text>;
};

export default FormulaFieldControl;
