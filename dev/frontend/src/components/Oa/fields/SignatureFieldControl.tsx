/**
 * 签名字段统一控件（signature）
 * 始终只读展示签名图片，editable 模式下使用 SignaturePad
 */
import React from 'react';
import { Typography } from 'antd';
import { SignaturePad } from '@/components/Oa';
import type { FieldControlProps } from './types';

const { Text } = Typography;

const SignatureFieldControl: React.FC<FieldControlProps> = ({ mode, field, value, onChange }) => {
  if (mode === 'editable') {
    return (
      <SignaturePad
        value={value as string | undefined}
        onChange={v => onChange?.(v)}
      />
    );
  }

  // readonly
  const sigValue = value as string;
  if (!sigValue) return <Text type="secondary">未签名</Text>;
  return (
    <img
      src={sigValue}
      alt="签名"
      style={{ maxWidth: 200, maxHeight: 100, border: '1px solid #d9d9d9', borderRadius: 4 }}
    />
  );
};

export default SignatureFieldControl;
