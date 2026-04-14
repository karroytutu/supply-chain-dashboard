/**
 * 搜索行组件
 * 简化版：搜索框 + 处理人筛选 + 日期筛选 + 清除
 */
import React, { useState, useCallback } from 'react';
import { Input, Select, DatePicker, Button } from 'antd';
import {
  SearchOutlined,
  CloseOutlined,
} from '@ant-design/icons';
import type { Dayjs } from 'dayjs';
import type { Handler } from './types';
import styles from './index.less';

const { RangePicker } = DatePicker;

interface SearchRowProps {
  searchKeyword: string;
  handlers: Handler[];
  selectedHandlerId: number | null;
  dateRange: [Dayjs | null, Dayjs | null] | null;
  isAdmin: boolean;
  onSearch: (keyword: string) => void;
  onHandlerChange: (handlerId: number | null) => void;
  onDateRangeChange: (range: [Dayjs | null, Dayjs | null] | null) => void;
  onClearAll: () => void;
}

const SearchRow: React.FC<SearchRowProps> = ({
  searchKeyword,
  handlers,
  selectedHandlerId,
  dateRange,
  isAdmin,
  onSearch,
  onHandlerChange,
  onDateRangeChange,
  onClearAll,
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

  const handleClear = useCallback(() => {
    setInputValue('');
    onSearch('');
  }, [onSearch]);

  // 是否有筛选条件
  const hasFilters = Boolean(searchKeyword || selectedHandlerId || dateRange);

  return (
    <div className={styles.searchRow}>
      {/* 搜索框 */}
      <Input
        className={styles.searchInput}
        prefix={<SearchOutlined />}
        placeholder="搜索客户名称/任务编号/单据号..."
        value={inputValue}
        onChange={(e) => setInputValue(e.target.value)}
        onPressEnter={handleSearch}
        onKeyUp={handleKeyUp}
        allowClear
        onClear={handleClear}
      />

      {/* 处理人筛选（仅管理员可见） */}
      {isAdmin && (
        <Select
          className={styles.handlerSelect}
          showSearch
          allowClear
          placeholder="处理人"
          value={selectedHandlerId}
          onChange={(value) => onHandlerChange(value || null)}
          options={handlers.map((h) => ({ label: h.name, value: h.id }))}
          style={{ width: 140 }}
          filterOption={(input, option) =>
            (option?.label ?? '').toLowerCase().includes(input.toLowerCase())
          }
        />
      )}

      {/* 日期范围筛选 */}
      <RangePicker
        className={styles.datePicker}
        value={dateRange}
        onChange={(dates) => onDateRangeChange(dates)}
        placeholder={['开始日期', '结束日期']}
        style={{ width: 240 }}
      />

      {/* 清除按钮 */}
      {hasFilters && (
        <Button
          icon={<CloseOutlined />}
          onClick={onClearAll}
        >
          清除
        </Button>
      )}
    </div>
  );
};

export default SearchRow;
