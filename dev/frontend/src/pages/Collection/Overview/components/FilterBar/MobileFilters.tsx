/**
 * 移动端筛选组件
 * Drawer：状态筛选 + 搜索框 + 处理人 + 日期范围
 */
import React, { useState, useEffect } from 'react';
import { Input, DatePicker, Button, Drawer, Select, Space, Tag } from 'antd';
import {
  SearchOutlined,
  FilterOutlined,
  CloseOutlined,
} from '@ant-design/icons';
import type { Dayjs } from 'dayjs';
import type { Handler } from './types';
import type { StatusTab } from '../../hooks/useOverview';
import styles from './index.less';

const { RangePicker } = DatePicker;

/** 状态选项配置（与 CollectionTable STATUS_TABS 保持一致） */
const STATUS_OPTIONS: Array<{ value: StatusTab; label: string; color: string }> = [
  { value: 'all', label: '全部', color: '#8c8c8c' },
  { value: 'collecting', label: '催收中', color: '#1890ff' },
  { value: 'extension', label: '延期中', color: '#722ed1' },
  { value: 'difference_processing', label: '差异', color: '#13c2c2' },
  { value: 'escalated', label: '已升级', color: '#ff4d4f' },
  { value: 'pending_verify', label: '待核销', color: '#fa8c16' },
  { value: 'verified', label: '已核销', color: '#52c41a' },
];

interface MobileFiltersProps {
  visible: boolean;
  searchKeyword: string;
  handlers: Handler[];
  selectedHandlerId: number | null;
  dateRange: [Dayjs | null, Dayjs | null] | null;
  statusTab: StatusTab;
  isAdmin: boolean;
  onClose: () => void;
  onApply: () => void;
  onSearchChange: (keyword: string) => void;
  onHandlerChange: (handlerId: number | null) => void;
  onDateRangeChange: (range: [Dayjs | null, Dayjs | null] | null) => void;
  onStatusTabChange: (tab: StatusTab) => void;
  onClearAll: () => void;
}

const MobileFilters: React.FC<MobileFiltersProps> = ({
  visible,
  searchKeyword,
  handlers,
  selectedHandlerId,
  dateRange,
  statusTab,
  isAdmin,
  onClose,
  onApply,
  onSearchChange,
  onHandlerChange,
  onDateRangeChange,
  onStatusTabChange,
  onClearAll,
}) => {
  // 本地临时状态
  const [localKeyword, setLocalKeyword] = useState(searchKeyword);
  const [localHandlerId, setLocalHandlerId] = useState(selectedHandlerId);
  const [localDateRange, setLocalDateRange] = useState(dateRange);
  const [localStatusTab, setLocalStatusTab] = useState(statusTab);

  // 同步外部状态到本地
  useEffect(() => {
    if (visible) {
      setLocalKeyword(searchKeyword);
      setLocalHandlerId(selectedHandlerId);
      setLocalDateRange(dateRange);
      setLocalStatusTab(statusTab);
    }
  }, [visible, searchKeyword, selectedHandlerId, dateRange, statusTab]);

  // 应用筛选
  const handleApply = () => {
    onSearchChange(localKeyword);
    onHandlerChange(localHandlerId);
    onDateRangeChange(localDateRange);
    onStatusTabChange(localStatusTab);
    onApply();
  };

  // 清除筛选
  const handleClear = () => {
    setLocalKeyword('');
    setLocalHandlerId(null);
    setLocalDateRange(null);
    setLocalStatusTab('all');
    onClearAll();
  };

  // 是否有筛选条件
  const hasFilters = localKeyword || localHandlerId || localDateRange || localStatusTab !== 'all';

  return (
    <Drawer
      title="筛选条件"
      placement="right"
      open={visible}
      onClose={onClose}
      className={styles.mobileFilterDrawer}
      width="85%"
      style={{ maxWidth: 320 }}
      footer={
        <div style={{ display: 'flex', gap: 8 }}>
          {hasFilters && (
            <Button onClick={handleClear} icon={<CloseOutlined />}>
              清除
            </Button>
          )}
          <Button type="primary" block onClick={handleApply} icon={<SearchOutlined />}>
            应用筛选
          </Button>
        </div>
      }
    >
      {/* 状态筛选 */}
      <div className={styles.mobileFilterItem}>
        <div className={styles.mobileFilterLabel}>状态筛选</div>
        <div className={styles.mobileStatusTags}>
          {STATUS_OPTIONS.map((option) => (
            <Tag
              key={option.value}
              color={localStatusTab === option.value ? option.color : 'default'}
              style={{ margin: '4px', cursor: 'pointer' }}
              onClick={() => setLocalStatusTab(option.value)}
            >
              {option.label}
            </Tag>
          ))}
        </div>
      </div>

      {/* 搜索框 */}
      <div className={styles.mobileFilterItem}>
        <div className={styles.mobileFilterLabel}>关键词</div>
        <Input
          placeholder="搜索客户名称/任务编号..."
          value={localKeyword}
          onChange={(e) => setLocalKeyword(e.target.value)}
          prefix={<SearchOutlined />}
          allowClear
        />
      </div>

      {/* 处理人（仅管理员可见） */}
      {isAdmin && (
        <div className={styles.mobileFilterItem}>
          <div className={styles.mobileFilterLabel}>处理人</div>
          <Select
            showSearch
            allowClear
            placeholder="全部"
            style={{ width: '100%' }}
            value={localHandlerId}
            onChange={(value) => setLocalHandlerId(value || null)}
            options={handlers.map((h) => ({ label: h.name, value: h.id }))}
            filterOption={(input, option) =>
              (option?.label ?? '').toLowerCase().includes(input.toLowerCase())
            }
          />
        </div>
      )}

      {/* 日期范围 */}
      <div className={styles.mobileFilterItem}>
        <div className={styles.mobileFilterLabel}>创建日期</div>
        <RangePicker
          value={localDateRange}
          onChange={(dates) => setLocalDateRange(dates)}
          style={{ width: '100%' }}
          placeholder={['开始日期', '结束日期']}
        />
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

/** 获取状态显示文本 */
const getStatusText = (statusTab: StatusTab): string | undefined => {
  if (statusTab === 'all') return undefined;
  const option = STATUS_OPTIONS.find((opt) => opt.value === statusTab);
  return option?.label;
};

export { MobileFilters, MobileFilterButton, getStatusText, STATUS_OPTIONS };
export default MobileFilters;
