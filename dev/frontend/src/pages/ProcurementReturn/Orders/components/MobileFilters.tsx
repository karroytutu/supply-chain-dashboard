/**
 * 移动端退货单筛选组件
 */
import React from 'react';
import { Input, DatePicker, Button, Drawer, Tag, Space } from 'antd';
import { SearchOutlined, FilterOutlined, CloseOutlined } from '@ant-design/icons';
import type { Dayjs } from 'dayjs';
import type { ReturnOrderStatus } from '@/types/procurement-return';
import styles from '../index.less';

const { RangePicker } = DatePicker;

// 状态选项配置
const statusOptions: Array<{ value?: ReturnOrderStatus; label: string; color: string }> = [
  { value: undefined, label: '全部', color: '#8c8c8c' },
  { value: 'pending_confirm', label: '待确认', color: '#1890ff' },
  { value: 'pending_erp_fill', label: '待填ERP', color: '#ff4d4f' },
  { value: 'pending_warehouse_execute', label: '待仓储退货', color: '#fa8c16' },
  { value: 'pending_marketing_sale', label: '待营销销售', color: '#722ed1' },
  { value: 'completed', label: '已完成', color: '#52c41a' },
];

export interface MobileFilterValues {
  keyword: string;
  status?: ReturnOrderStatus;
  dateRange: [Dayjs | null, Dayjs | null] | null;
}

interface MobileFiltersProps {
  value: MobileFilterValues;
  visible: boolean;
  onClose: () => void;
  onApply: () => void;
  onChange: (filters: MobileFilterValues) => void;
  onClear: () => void;
}

const MobileFilters: React.FC<MobileFiltersProps> = ({
  value,
  visible,
  onClose,
  onApply,
  onChange,
  onClear,
}) => {
  // 处理关键词变化
  const handleKeywordChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    onChange({ ...value, keyword: e.target.value });
  };

  // 处理状态变化
  const handleStatusChange = (status?: ReturnOrderStatus) => {
    onChange({ ...value, status });
  };

  // 处理日期范围变化
  const handleDateRangeChange = (dates: [Dayjs | null, Dayjs | null] | null) => {
    onChange({ ...value, dateRange: dates });
  };

  // 是否有筛选条件
  const hasFilters = value.keyword || value.status || value.dateRange;

  return (
    <Drawer
      title="筛选条件"
      placement="right"
      open={visible}
      onClose={onClose}
      className={styles.mobileFilterDrawer}
      width={300}
      footer={
        <div style={{ display: 'flex', gap: 8 }}>
          {hasFilters && (
            <Button onClick={onClear} icon={<CloseOutlined />}>
              清除
            </Button>
          )}
          <Button type="primary" block onClick={onApply} icon={<SearchOutlined />}>
            应用筛选
          </Button>
        </div>
      }
    >
      {/* 搜索框 */}
      <div className={styles.mobileFilterItem}>
        <div className={styles.mobileFilterLabel}>关键词</div>
        <Input
          placeholder="搜索退货单号/商品名称"
          value={value.keyword}
          onChange={handleKeywordChange}
          prefix={<SearchOutlined />}
          allowClear
        />
      </div>

      {/* 日期范围 */}
      <div className={styles.mobileFilterItem}>
        <div className={styles.mobileFilterLabel}>日期范围</div>
        <RangePicker
          value={value.dateRange}
          onChange={handleDateRangeChange}
          style={{ width: '100%' }}
          placeholder={['开始日期', '结束日期']}
        />
      </div>

      {/* 状态快捷筛选 */}
      <div className={styles.mobileFilterItem}>
        <div className={styles.mobileFilterLabel}>状态筛选</div>
        <div className={styles.mobileStatusTags}>
          {statusOptions.map((option) => (
            <Tag
              key={option.label}
              color={value.status === option.value ? option.color : 'default'}
              style={{ margin: '4px', cursor: 'pointer' }}
              onClick={() => handleStatusChange(option.value)}
            >
              {option.label}
            </Tag>
          ))}
        </div>
      </div>
    </Drawer>
  );
};

// 移动端筛选按钮组件
interface MobileFilterButtonProps {
  hasFilters: boolean;
  activeStatusText?: string;
  onClick: () => void;
}

const MobileFilterButton: React.FC<MobileFilterButtonProps> = ({
  hasFilters,
  activeStatusText,
  onClick,
}) => (
  <Button
    icon={<FilterOutlined />}
    onClick={onClick}
    className={hasFilters ? styles.filterButtonActive : undefined}
  >
    <Space size={4}>
      筛选
      {activeStatusText && (
        <Tag color="blue" style={{ margin: 0, lineHeight: '18px' }}>
          {activeStatusText}
        </Tag>
      )}
    </Space>
  </Button>
);

// 获取状态显示文本
const getStatusText = (status?: ReturnOrderStatus): string | undefined => {
  const option = statusOptions.find((opt) => opt.value === status);
  return option?.label;
};

export { MobileFilters, MobileFilterButton, getStatusText, statusOptions };
export default MobileFilters;
