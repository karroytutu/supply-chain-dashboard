/**
 * MobileDatePicker - 移动端日期选择器
 * 封装 antd-mobile DatePicker，提供与 antd DatePicker 兼容的字符串 API
 * 移动端滚轮式日期选择（iOS 原生体验），桌面端不渲染
 */
import React, { useState, useMemo, useCallback } from 'react';
import { DatePicker as AntdMobileDatePicker } from 'antd-mobile';
import { CalendarOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';

export interface MobileDatePickerProps {
  value?: string | undefined; // 'YYYY-MM-DD' 格式字符串
  onChange?: (dateString: string) => void;
  placeholder?: string;
  disabled?: boolean;
  min?: string; // 'YYYY-MM-DD'
  max?: string;
  style?: React.CSSProperties;
  className?: string;
}

const MobileDatePicker: React.FC<MobileDatePickerProps> = ({
  value,
  onChange,
  placeholder = '请选择日期',
  disabled = false,
  min,
  max,
  style,
  className,
}) => {
  const [visible, setVisible] = useState(false);

  // string → Date 转换，无效日期回退到 undefined
  const dateValue = useMemo(() => {
    if (!value) return undefined;
    const d = dayjs(value, 'YYYY-MM-DD', true);
    return d.isValid() ? d.toDate() : undefined;
  }, [value]);

  const minDate = useMemo(() => {
    if (!min) return undefined;
    const d = dayjs(min, 'YYYY-MM-DD', true);
    return d.isValid() ? d.toDate() : undefined;
  }, [min]);

  const maxDate = useMemo(() => {
    if (!max) return undefined;
    const d = dayjs(max, 'YYYY-MM-DD', true);
    return d.isValid() ? d.toDate() : undefined;
  }, [max]);

  const handleConfirm = useCallback(
    (val: Date) => {
      onChange?.(dayjs(val).format('YYYY-MM-DD'));
    },
    [onChange],
  );

  const handleClick = useCallback(() => {
    if (!disabled) {
      setVisible(true);
    }
  }, [disabled]);

  const displayText = useMemo(() => {
    if (!value) return undefined;
    const d = dayjs(value, 'YYYY-MM-DD', true);
    return d.isValid() ? d.format('YYYY-MM-DD') : undefined;
  }, [value]);

  return (
    <>
      <div
        className={className}
        style={{
          display: 'flex',
          alignItems: 'center',
          minHeight: 44,
          padding: '8px 12px',
          background: disabled ? '#fafafa' : '#fff',
          border: '1px solid #d9d9d9',
          borderRadius: 8,
          cursor: disabled ? 'default' : 'pointer',
          color: displayText ? '#333' : '#bfbfbf',
          fontSize: 14,
          ...style,
        }}
        onClick={handleClick}
        role="button"
        aria-label="日期选择"
        aria-disabled={disabled}
      >
        <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {displayText || placeholder}
        </span>
        <CalendarOutlined style={{ fontSize: 14, color: '#bfbfbf', marginLeft: 4, flexShrink: 0 }} />
      </div>

      <AntdMobileDatePicker
        visible={visible}
        onClose={() => setVisible(false)}
        value={dateValue}
        onConfirm={handleConfirm}
        min={minDate}
        max={maxDate}
        mouseWheel
      />
    </>
  );
};

export default MobileDatePicker;
