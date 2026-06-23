/**
 * 数值字段统一控件（number + money）
 * mode=readonly: 格式化展示（money 带千分位 + 货币符号）
 * mode=editable: InputNumber（money 含 formatter/parser + 实付金额警告）
 */
import React from 'react';
import { InputNumber, Alert, Typography } from 'antd';
import { formatCurrency } from '@/utils/format';
import type { FieldControlProps } from './types';

const { Text } = Typography;

const NumberFieldControl: React.FC<FieldControlProps> = ({ mode, field, value, onChange, formData }) => {
  if (mode === 'readonly') {
    if (value === null || value === undefined || value === '') {
      return <Text type="secondary">-</Text>;
    }
    if (field.type === 'money') {
      return <Text strong>{formatCurrency(value as number)}</Text>;
    }
    return <Text>{(value as number).toLocaleString()}</Text>;
  }

  // editable — number
  if (field.type === 'number') {
    return (
      <InputNumber
        value={value as number | undefined}
        onChange={v => onChange?.(v)}
        style={{ width: '100%' }}
        placeholder={field.placeholder || `请输入${field.label}`}
        min={field.min}
        max={field.max}
        precision={field.precision}
        addonAfter={field.suffix || field.unit}
      />
    );
  }

  // editable — money（含实付金额 vs 预付金额警告）
  return (
    <>
      <InputNumber
        value={value as number | undefined}
        onChange={v => onChange?.(v)}
        style={{ width: '100%' }}
        placeholder={field.placeholder || `请输入${field.label}`}
        min={field.min}
        max={field.max}
        precision={2}
        formatter={(val) =>
          val !== undefined && val !== null && String(val) !== ''
            ? `${Number(val).toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
            : ''
        }
        parser={(val) => val?.replace(/,/g, '') as any}
        addonAfter="元"
      />
      {field.key === 'paymentAmount' && formData?.prepaymentAmount != null && value != null && String(value) !== '' && (() => {
        const a = Number(value);
        const b = Number(formData.prepaymentAmount);
        if (isNaN(a) || isNaN(b)) return false;
        return a.toFixed(2) !== b.toFixed(2);
      })() && (
        <Alert
          type="warning"
          message="实付金额与预付金额不一致，请确认"
          showIcon
          style={{ marginTop: 4 }}
        />
      )}
    </>
  );
};

export default NumberFieldControl;
