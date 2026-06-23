/**
 * 文本字段统一控件（text + textarea）
 * mode=readonly: 纯文本展示（支持 linkUrl 跳转）
 * mode=editable: Input / TextArea 输入
 */
import React from 'react';
import { Input, Typography } from 'antd';
import { getFieldLinkUrl } from '@/utils/oa';
import type { FieldControlProps } from './types';

const { Text } = Typography;
const { TextArea } = Input;

const TextFieldControl: React.FC<FieldControlProps> = ({ mode, field, value, onChange, formData }) => {
  if (mode === 'readonly') {
    if (value === null || value === undefined || value === '') {
      return <Text type="secondary">-</Text>;
    }
    if (field.type === 'textarea') {
      return <Text style={{ whiteSpace: 'pre-wrap' }}>{value as string}</Text>;
    }
    const linkUrl = getFieldLinkUrl(field, formData);
    if (linkUrl) {
      return (
        <a href={linkUrl} target="_blank" rel="noopener noreferrer">
          {String(value)}
        </a>
      );
    }
    return <Text>{String(value)}</Text>;
  }

  // editable
  if (field.type === 'textarea') {
    return (
      <TextArea
        value={(value as string) || ''}
        onChange={e => onChange?.(e.target.value)}
        placeholder={field.placeholder || `请输入${field.label}`}
        maxLength={field.maxLength}
        showCount={!!field.maxLength}
        autoSize={{ minRows: 3 }}
      />
    );
  }

  return (
    <Input
      value={(value as string) || ''}
      onChange={e => onChange?.(e.target.value)}
      placeholder={field.placeholder || `请输入${field.label}`}
      maxLength={field.maxLength}
      showCount={!!field.maxLength}
    />
  );
};

export default TextFieldControl;
