/**
 * 搜索栏 + 快捷筛选组件
 * 支持搜索客户名称/任务编号/单据号 + 快捷筛选按钮 + 处理人筛选 + 日期范围筛选
 */
import React, { useState, useCallback } from 'react';
import { Input, Tag, Select, DatePicker } from 'antd';
import dayjs from 'dayjs';
import {
  SearchOutlined,
  FireOutlined,
  CalendarOutlined,
  WarningOutlined,
} from '@ant-design/icons';
import type { QuickFilter } from '../hooks/useOverview';
import type { Handler } from '@/types/ar-collection';

interface SearchBarProps {
  searchKeyword: string;
  quickFilter: QuickFilter;
  handlers: Handler[];
  selectedHandlerId: number | null;
  dateRange: [dayjs.Dayjs | null, dayjs.Dayjs | null] | null;
  onSearch: (keyword: string) => void;
  onQuickFilter: (filter: QuickFilter) => void;
  onHandlerChange: (handlerId: number | null) => void;
  onDateRangeChange: (range: [dayjs.Dayjs | null, dayjs.Dayjs | null] | null) => void;
}

/** 快捷筛选配置 */
const QUICK_FILTERS: Array<{
  key: QuickFilter;
  label: string;
  icon: React.ReactNode;
}> = [
  { key: 'urgent', label: '我的紧急', icon: <FireOutlined /> },
  { key: 'expireToday', label: '今日到期延期', icon: <CalendarOutlined /> },
  { key: 'timeout', label: '超时未跟进', icon: <WarningOutlined /> },
];

const SearchBar: React.FC<SearchBarProps> = ({
  searchKeyword,
  quickFilter,
  handlers,
  selectedHandlerId,
  dateRange,
  onSearch,
  onQuickFilter,
  onHandlerChange,
  onDateRangeChange,
}) => {
  const [inputValue, setInputValue] = useState(searchKeyword);

  const handleSearch = useCallback(() => {
    onSearch(inputValue.trim());
  }, [inputValue, onSearch]);

  const handleKeyUp = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter') handleSearch();
    },
    [handleSearch],
  );

  return (
    <div className="search-section">
      <div className="search-box">
        <Input
          prefix={<SearchOutlined />}
          placeholder="搜索客户名称/任务编号/单据号..."
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          onPressEnter={handleSearch}
          onKeyUp={handleKeyUp}
          allowClear
          onClear={() => { setInputValue(''); onSearch(''); }}
        />
      </div>
      <div className="quick-filters">
        <span className="quick-filters-label">快捷筛选:</span>
        {QUICK_FILTERS.map((f) => (
          <button
            key={f.key}
            className={`quick-filter-btn ${quickFilter === f.key ? 'active' : ''}`}
            onClick={() => onQuickFilter(f.key)}
          >
            {f.icon} {f.label}
          </button>
        ))}
        {quickFilter && (
          <Tag
            closable
            color="blue"
            onClose={() => onQuickFilter(null)}
            className="filter-tag"
          >
            已筛选
          </Tag>
        )}
      </div>
      <div className="handler-filter">
        <span className="handler-filter-label">处理人:</span>
        <Select
          allowClear
          placeholder="全部"
          style={{ width: 140 }}
          value={selectedHandlerId}
          onChange={(value) => onHandlerChange(value || null)}
          options={handlers.map((h) => ({ label: h.name, value: h.id }))}
        />
      </div>
      <div className="date-filter">
        <span className="date-filter-label">创建日期:</span>
        <DatePicker.RangePicker
          value={dateRange}
          onChange={(dates) => onDateRangeChange(dates)}
          placeholder={['开始日期', '结束日期']}
          style={{ width: 260 }}
          allowClear
        />
      </div>
    </div>
  );
};

export default SearchBar;
