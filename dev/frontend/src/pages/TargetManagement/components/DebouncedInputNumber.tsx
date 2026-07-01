/**
 * 防抖数字输入组件
 * 本地暂存编辑值，延迟提交到全局 state，避免每次击键触发重渲染
 */
import React, { useState, useEffect, useRef } from 'react';
import { InputNumber } from 'antd';
import type { InputNumberProps } from 'antd';

interface DebouncedInputNumberProps extends Omit<InputNumberProps<number>, 'value' | 'onChange'> {
  value: number;
  onChange: (value: number) => void;
  /** 防抖延迟（毫秒），默认 300 */
  delay?: number;
}

const DebouncedInputNumber: React.FC<DebouncedInputNumberProps> = ({
  value,
  onChange,
  delay = 300,
  ...rest
}) => {
  const [localValue, setLocalValue] = useState(value);
  const timerRef = useRef<ReturnType<typeof setTimeout>>();
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  // 外部 value 变化时同步本地值
  useEffect(() => {
    setLocalValue(value);
  }, [value]);

  // 组件卸载时清理定时器
  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  const handleChange = (v: number | null) => {
    const newValue = v || 0;
    setLocalValue(newValue);
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      onChangeRef.current(newValue);
    }, delay);
  };

  const handleBlur = () => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = undefined;
    }
    onChangeRef.current(localValue);
  };

  return (
    <InputNumber
      {...rest}
      value={localValue || undefined}
      onChange={handleChange}
      onBlur={handleBlur}
    />
  );
};

export default DebouncedInputNumber;
