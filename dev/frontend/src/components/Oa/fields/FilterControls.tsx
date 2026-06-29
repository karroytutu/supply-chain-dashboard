/**
 * 筛选条件控件
 * @module components/Oa/fields/FilterControls
 *
 * 弹窗多选中的筛选条件渲染：keyword / date-range / select
 * 以及筛选默认值计算（如 date-range 的 last7days）
 */
import React from 'react';
import { Input, DatePicker, Select } from 'antd';
import dayjs from 'dayjs';
import type { Dayjs } from 'dayjs';
import type { FilterConfig } from '@/types/oa';

const { RangePicker } = DatePicker;

// =====================================================
// 筛选默认值计算
// =====================================================

/** 根据 filters 配置计算筛选默认值（如 date-range 的 last7days） */
export function getFilterDefaults(filters?: FilterConfig[]): Record<string, unknown> {
  if (!filters) return {};
  const defaults: Record<string, unknown> = {};
  for (const f of filters) {
    if (f.type === 'date-range' && f.defaultValue === 'last7days') {
      defaults[f.key] = [dayjs().subtract(7, 'day'), dayjs()];
    }
  }
  return defaults;
}

// =====================================================
// 筛选条件渲染
// =====================================================

/**
 * 渲染单个筛选条件控件
 * @param filter 筛选条件配置
 * @param value 当前筛选值
 * @param onChange 值变更回调（skipFetch=true 时仅存储值不触发搜索）
 * @param filterOptions select 类型的选项映射
 * @param onKeywordSearch keyword 类型的搜索回调
 */
export function renderFilterControl(
  filter: FilterConfig,
  value: unknown,
  onChange: (val: unknown, skipFetch?: boolean) => void,
  filterOptions: Record<string, { value: string; label: string }[]>,
  onKeywordSearch?: (val: string) => void,
) {
  const labelStyle: React.CSSProperties = { fontSize: 12, color: '#666', marginBottom: 4 };

  switch (filter.type) {
    case 'keyword':
      return (
        <div key={filter.key} style={{ display: 'flex', flexDirection: 'column' }}>
          {filter.placeholder && <div style={labelStyle}>{filter.placeholder.replace('搜索', '')}</div>}
          <Input.Search
            placeholder={filter.placeholder || '搜索'}
            allowClear
            value={value as string || ''}
            onChange={e => onChange(e.target.value, true)}
            onSearch={val => { onChange(val); onKeywordSearch?.(val); }}
            style={{ width: 200 }}
          />
        </div>
      );
    case 'date-range': {
      const dates = value as [Dayjs, Dayjs] | null;
      return (
        <div key={filter.key} style={{ display: 'flex', flexDirection: 'column' }}>
          <div style={labelStyle}>{filter.label}</div>
          <RangePicker
            value={dates}
            onChange={onChange as (dates: [Dayjs | null, Dayjs | null] | null) => void}
            presets={[{ label: '近7天', value: [dayjs().subtract(7, 'day'), dayjs()] }]}
            style={{ width: 260 }}
          />
        </div>
      );
    }
    case 'select':
      return (
        <div key={filter.key} style={{ display: 'flex', flexDirection: 'column' }}>
          <div style={labelStyle}>{filter.label}</div>
          <Select
            showSearch
            allowClear
            placeholder={filter.placeholder || `选择${filter.label}`}
            options={filterOptions[filter.key] || []}
            value={value as string | undefined}
            onChange={(val) => onChange(val)}
            filterOption={(input, option) =>
              String(option?.label || '').toLowerCase().includes(input.toLowerCase())
            }
            style={{ width: 200 }}
          />
        </div>
      );
    default:
      return null;
  }
}
