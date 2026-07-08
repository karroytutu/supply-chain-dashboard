/**
 * MobileSelect - 移动端选择器
 * 封装 antd-mobile Picker，提供与 antd Select 兼容的 API
 * 移动端底部弹出半屏滚轮选择，桌面端不渲染
 */
import React, { useState, useMemo, useCallback } from 'react';
import { Picker } from 'antd-mobile';
import type { PickerValue, PickerColumn, PickerColumnItem } from 'antd-mobile/es/components/picker-view';
import { CloseCircleFilled, DownOutlined } from '@ant-design/icons';

export interface MobileSelectProps {
  value?: string | number;
  onChange?: (value: string | number | undefined) => void;
  options?: Array<{ value: string | number; label: string }>;
  placeholder?: string;
  disabled?: boolean;
  allowClear?: boolean;
  title?: string;
  className?: string;
  style?: React.CSSProperties;
}

const MobileSelect: React.FC<MobileSelectProps> = ({
  value,
  onChange,
  options = [],
  placeholder = '请选择',
  disabled = false,
  allowClear = false,
  title,
  className,
  style,
}) => {
  const [visible, setVisible] = useState(false);

  // options → Picker columns 格式
  const columns = useMemo<PickerColumn[]>(
    () => [options.map((opt) => ({ value: opt.value, label: String(opt.label) }))],
    [options],
  );

  // value → PickerValue[] 格式
  const pickerValue = useMemo<PickerValue[]>(
    () => (value != null ? [value] : []),
    [value],
  );

  // 当前选中项的 label
  const selectedLabel = useMemo(() => {
    if (value == null) return undefined;
    return options.find((opt) => opt.value === value)?.label;
  }, [value, options]);

  const handleConfirm = useCallback(
    (val: PickerValue[]) => {
      onChange?.(val[0] as string | number | undefined);
    },
    [onChange],
  );

  const handleClear = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      onChange?.(undefined);
    },
    [onChange],
  );

  const handleClick = useCallback(() => {
    if (!disabled && options.length > 0) {
      setVisible(true);
    }
  }, [disabled, options.length]);

  const showClear = allowClear && value != null && !disabled;

  return (
    <>
      <div
        className={className}
        style={{
          position: 'relative',
          display: 'flex',
          alignItems: 'center',
          minHeight: 44,
          padding: '8px 12px',
          background: disabled ? '#fafafa' : '#fff',
          border: '1px solid #d9d9d9',
          borderRadius: 8,
          cursor: disabled ? 'default' : 'pointer',
          color: selectedLabel ? '#333' : '#bfbfbf',
          fontSize: 14,
          ...style,
        }}
        onClick={handleClick}
        role="combobox"
        aria-label={title || '选择'}
        aria-expanded={visible}
        aria-disabled={disabled}
      >
        <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {selectedLabel || placeholder}
        </span>
        {showClear ? (
          <CloseCircleFilled
            style={{ color: '#bfbfbf', fontSize: 14, marginLeft: 4, flexShrink: 0 }}
            onClick={handleClear}
          />
        ) : (
          <DownOutlined style={{ fontSize: 10, color: '#bfbfbf', marginLeft: 4, flexShrink: 0 }} />
        )}
      </div>

      <Picker
        columns={columns}
        visible={visible}
        onClose={() => setVisible(false)}
        value={pickerValue}
        onConfirm={handleConfirm}
        title={title}
        mouseWheel
      />
    </>
  );
};

export default MobileSelect;
