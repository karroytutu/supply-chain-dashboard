/**
 * MobileDateRangePicker - 移动端日期范围选择器
 * 基于 MobileDatePicker 组合：纵向排列开始/结束两个独立日期选择器
 * 替代旧版 src/components/Oa/fields/MobileDateRangePicker.tsx
 * Props 与旧版完全兼容
 */
import React, { useCallback } from 'react';
import MobileDatePicker from './MobileDatePicker';

export interface MobileDateRangePickerProps {
  value?: [string, string] | null;
  onChange?: (value: [string, string]) => void;
  disabled?: boolean;
}

const MobileDateRangePicker: React.FC<MobileDateRangePickerProps> = ({
  value,
  onChange,
  disabled,
}) => {
  const startDate = value?.[0] || undefined;
  const endDate = value?.[1] || undefined;

  const handleStartChange = useCallback((ds: string) => {
    if (endDate && ds > endDate) {
      onChange?.([ds, ds]); // 结束日自动对齐到开始日
    } else {
      onChange?.([ds, endDate || '']);
    }
  }, [endDate, onChange]);

  const handleEndChange = useCallback((ds: string) => {
    if (startDate && ds < startDate) {
      onChange?.([ds, ds]); // 开始日自动对齐到结束日
    } else {
      onChange?.([startDate || '', ds]);
    }
  }, [startDate, onChange]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <MobileDatePicker
        value={startDate}
        onChange={handleStartChange}
        placeholder="开始日期"
        disabled={disabled}
        max={endDate}
      />
      <MobileDatePicker
        value={endDate}
        onChange={handleEndChange}
        placeholder="结束日期"
        disabled={disabled}
        min={startDate}
      />
    </div>
  );
};

export default MobileDateRangePicker;
