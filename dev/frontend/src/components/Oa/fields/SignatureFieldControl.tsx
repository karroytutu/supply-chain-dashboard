/**
 * 签名字段统一控件（signature）
 * editable 模式下：加载用户已保存签名自动填充，确认签名时同时保存到个人档案
 * readonly 模式下：展示签名图片
 */
import React, { useEffect, useState, useCallback, useRef } from 'react';
import { Typography } from 'antd';
import { SignaturePad } from '@/components/Oa';
import { getUserSignature, saveUserSignature } from '@/services/api/oa';
import type { FieldControlProps } from './types';

const { Text } = Typography;

const SignatureFieldControl: React.FC<FieldControlProps> = ({ mode, field, value, onChange }) => {
  const [savedSignature, setSavedSignature] = useState<string | null>(null);

  // 用 ref 持有最新的 value 和 onChange，避免 useEffect 闭包捕获过期引用
  const valueRef = useRef(value);
  const onChangeRef = useRef(onChange);
  valueRef.current = value;
  onChangeRef.current = onChange;

  // 组件挂载时加载用户已保存的签名
  useEffect(() => {
    if (mode !== 'editable') return;
    let cancelled = false;
    getUserSignature()
      .then((sig) => {
        if (cancelled) return;
        if (sig?.signatureData) {
          setSavedSignature(sig.signatureData);
          // 仅在当前表单字段无值时自动填充（通过 ref 访问最新值）
          if (!valueRef.current) {
            onChangeRef.current?.(sig.signatureData);
          }
        }
      })
      .catch(() => {
        // 加载失败静默处理，不影响正常使用
      });
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps -- 仅挂载时执行一次
  }, []);

  // 确认签名时：同时写入表单字段 + 保存到个人档案
  const handleChange = useCallback((v: unknown) => {
    onChange?.(v);
    // 有值时自动保存到个人档案（覆盖旧签名）
    if (v && typeof v === 'string') {
      saveUserSignature(v)
        .then(() => setSavedSignature(v))
        .catch(() => {
          // 保存失败不阻断表单操作，静默处理
        });
    }
  }, [onChange]);

  if (mode === 'editable') {
    // 已保存的签名作为历史项供用户查看和复用
    const historySignatures = savedSignature ? [savedSignature] : [];

    return (
      <SignaturePad
        value={value as string | undefined}
        onChange={handleChange}
        historySignatures={historySignatures}
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
