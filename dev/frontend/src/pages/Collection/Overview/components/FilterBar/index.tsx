/**
 * FilterBar 主组件
 * 搜索框 + 日期筛选 + 处理人筛选
 * 桌面端：SearchRow 单行内联
 * 移动端：垂直排列，筛选即时生效
 */
import React, { useState, useCallback, useRef } from 'react';
import { Input, DatePicker, Select, Button, message } from 'antd';
import { CloseOutlined, SearchOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import type { Dayjs } from 'dayjs';
import type { Handler } from './types';
import type { StatusTab } from '../../hooks/useOverview';
import SearchRow from './SearchRow';
import styles from './index.less';

const MOBILE_SEARCH_DEBOUNCE = 500;

interface FilterBarProps {
  searchKeyword: string;
  handlers: Handler[];
  selectedHandlerId: number | null;
  dateRange: [Dayjs | null, Dayjs | null] | null;
  statusTab: StatusTab;
  onSearch: (keyword: string) => void;
  onHandlerChange: (handlerId: number | null) => void;
  onDateRangeChange: (range: [Dayjs | null, Dayjs | null] | null) => void;
  onStatusTabChange: (tab: StatusTab) => void;
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
  // 移动端本地搜索输入状态
  const [mobileSearchValue, setMobileSearchValue] = useState(searchKeyword);
  const mobileSearchTimer = useRef<ReturnType<typeof setTimeout>>();

  // 是否有筛选条件
  const hasFilters = Boolean(searchKeyword || selectedHandlerId || dateRange);

  /** 开始日期变更（移动端） */
  const handleStartDateChange = useCallback(
    (date: Dayjs | null) => {
      if (date && dateRange?.[1] && date.isAfter(dateRange[1], 'day')) {
        message.warning('开始日期不能晚于结束日期');
        return;
      }
      onDateRangeChange([date, dateRange?.[1] || null]);
    },
    [dateRange, onDateRangeChange],
  );

  /** 结束日期变更（移动端） */
  const handleEndDateChange = useCallback(
    (date: Dayjs | null) => {
      if (date && dateRange?.[0] && date.isBefore(dateRange[0], 'day')) {
        message.warning('开始日期不能晚于结束日期');
        return;
      }
      onDateRangeChange([dateRange?.[0] || null, date]);
    },
    [dateRange, onDateRangeChange],
  );

  /** 移动端清除所有筛选 */
  const handleMobileClearAll = useCallback(() => {
    setMobileSearchValue('');
    onClearAll();
  }, [onClearAll]);

  // 移动端渲染：内联垂直排列
  if (isMobile) {
    return (
      <div className={styles.filterBarMobile}>
        <Input
          className={styles.mobileSearchInput}
          placeholder="搜索客户/编号"
          size="small"
          value={mobileSearchValue}
          onChange={(e) => {
            const val = e.target.value;
            setMobileSearchValue(val);
            if (mobileSearchTimer.current) clearTimeout(mobileSearchTimer.current);
            mobileSearchTimer.current = setTimeout(() => onSearch(val.trim()), MOBILE_SEARCH_DEBOUNCE);
          }}
          allowClear
          onClear={() => { setMobileSearchValue(''); onSearch(''); }}
          prefix={<SearchOutlined />}
        />

        <div className={styles.mobileDateRow}>
          <DatePicker
            className={styles.mobileDatePicker}
            value={dateRange?.[0] || null}
            onChange={handleStartDateChange}
            placeholder="开始日期"
            allowClear
          />
          <span className={styles.mobileDateSeparator}>~</span>
          <DatePicker
            className={styles.mobileDatePicker}
            value={dateRange?.[1] || null}
            onChange={handleEndDateChange}
            placeholder="结束日期"
            allowClear
          />
        </div>

        {isAdmin && (
          <Select
            className={styles.mobileHandlerSelect}
            showSearch
            allowClear
            placeholder="处理人"
            value={selectedHandlerId}
            onChange={(value) => onHandlerChange(value || null)}
            options={handlers.map((h) => ({ label: h.name, value: h.id }))}
            filterOption={(input, option) =>
              (option?.label ?? '').toLowerCase().includes(input.toLowerCase())
            }
          />
        )}

        {hasFilters && (
          <Button
            size="small"
            type="link"
            icon={<CloseOutlined />}
            onClick={handleMobileClearAll}
            className={styles.mobileClearButton}
          >
            清除筛选
          </Button>
        )}
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
