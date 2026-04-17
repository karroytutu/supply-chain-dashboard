import React, { useCallback } from 'react';
import { Card, Input, DatePicker, Button, Space, Breadcrumb } from 'antd';
import { SearchOutlined, ReloadOutlined, HomeOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import type { ReturnOrderStatus } from '@/types/procurement-return';
import styles from '../index.less';

const { RangePicker } = DatePicker;

interface OrderFilterProps {
  keyword: string;
  statusFilter: ReturnOrderStatus | undefined;
  dateRange: [dayjs.Dayjs | null, dayjs.Dayjs | null] | null;
  isMobile: boolean;
  hasFilters: boolean;
  activeStatusText: string | undefined;
  onKeywordChange: (val: string) => void;
  onSearch: () => void;
  onDateRangeChange: (dates: [dayjs.Dayjs | null, dayjs.Dayjs | null] | null) => void;
  onRefresh: () => void;
  onStatusClick: (status?: ReturnOrderStatus) => void;
  onOpenMobileFilter: () => void;
}

const OrderFilter: React.FC<OrderFilterProps> = ({
  keyword, dateRange, isMobile, hasFilters, activeStatusText,
  onKeywordChange, onSearch, onDateRangeChange, onRefresh,
  onOpenMobileFilter,
}) => {
  if (isMobile) {
    return (
      <div className={styles.mobileToolbar}>
        <Button onClick={onOpenMobileFilter}>
          筛选 {hasFilters ? `(${activeStatusText})` : ''}
        </Button>
        <Button icon={<ReloadOutlined />} onClick={onRefresh}>刷新</Button>
      </div>
    );
  }

  return (
    <div className={styles.toolbar}>
      <Space size="middle" wrap>
        <Input
          placeholder="搜索退货单号/商品名称"
          value={keyword}
          onChange={e => onKeywordChange(e.target.value)}
          onPressEnter={onSearch}
          prefix={<SearchOutlined />}
          style={{ width: 220 }}
          allowClear
        />
        <RangePicker
          value={dateRange}
          onChange={dates => onDateRangeChange(dates as [dayjs.Dayjs | null, dayjs.Dayjs | null] | null)}
          style={{ width: 260 }}
          placeholder={['开始日期', '结束日期']}
        />
        <Button type="primary" icon={<SearchOutlined />} onClick={onSearch}>
          搜索
        </Button>
        <Button icon={<ReloadOutlined />} onClick={onRefresh}>
          刷新
        </Button>
      </Space>
    </div>
  );
};

export default OrderFilter;
