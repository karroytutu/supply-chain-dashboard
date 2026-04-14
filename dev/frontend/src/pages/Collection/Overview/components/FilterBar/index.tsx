/**
 * FilterBar 主组件
 * 简化版：搜索框 + 处理人筛选 + 日期筛选
 * 处理桌面端和移动端的响应式切换
 */
import React, { useState } from 'react';
import { Input } from 'antd';
import { SearchOutlined } from '@ant-design/icons';
import type { Dayjs } from 'dayjs';
import type { Handler } from './types';
import SearchRow from './SearchRow';
import { MobileFilters, MobileFilterButton } from './MobileFilters';
import styles from './index.less';

interface FilterBarProps {
  // 筛选状态
  searchKeyword: string;
  handlers: Handler[];
  selectedHandlerId: number | null;
  dateRange: [Dayjs | null, Dayjs | null] | null;

  // 回调函数
  onSearch: (keyword: string) => void;
  onHandlerChange: (handlerId: number | null) => void;
  onDateRangeChange: (range: [Dayjs | null, Dayjs | null] | null) => void;
  onClearAll: () => void;
  isMobile?: boolean;
  isAdmin?: boolean;
}

const FilterBar: React.FC<FilterBarProps> = ({
  searchKeyword,
  handlers,
  selectedHandlerId,
  dateRange,
  onSearch,
  onHandlerChange,
  onDateRangeChange,
  onClearAll,
  isMobile = false,
  isAdmin = false,
}) => {
  // 移动端筛选抽屉状态
  const [mobileDrawerVisible, setMobileDrawerVisible] = useState(false);

  // 判断是否有筛选条件
  const hasFilters = Boolean(searchKeyword || selectedHandlerId || dateRange);

  // 移动端渲染
  if (isMobile) {
    return (
      <div className={styles.filterBarMobile}>
        <Input
          className={styles.mobileSearchInput}
          prefix={<SearchOutlined />}
          placeholder="搜索..."
          value={searchKeyword}
          onChange={(e) => onSearch(e.target.value)}
          allowClear
          onClear={() => onSearch('')}
        />
        <MobileFilterButton
          hasFilters={hasFilters}
          onClick={() => setMobileDrawerVisible(true)}
        />
        <MobileFilters
          visible={mobileDrawerVisible}
          searchKeyword={searchKeyword}
          handlers={handlers}
          selectedHandlerId={selectedHandlerId}
          dateRange={dateRange}
          isAdmin={isAdmin}
          onClose={() => setMobileDrawerVisible(false)}
          onApply={() => setMobileDrawerVisible(false)}
          onSearchChange={onSearch}
          onHandlerChange={onHandlerChange}
          onDateRangeChange={onDateRangeChange}
          onClearAll={onClearAll}
        />
      </div>
    );
  }

  // 桌面端渲染
  return (
    <div className={styles.filterBar}>
      <SearchRow
        searchKeyword={searchKeyword}
        handlers={handlers}
        selectedHandlerId={selectedHandlerId}
        dateRange={dateRange}
        isAdmin={isAdmin}
        onSearch={onSearch}
        onHandlerChange={onHandlerChange}
        onDateRangeChange={onDateRangeChange}
        onClearAll={onClearAll}
      />
    </div>
  );
};

export default FilterBar;
