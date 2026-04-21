/**
 * 移动端筛选组件
 * Drawer：日期范围 + 处理人（高级筛选）
 * 状态筛选和关键词搜索已前置到页面层级
 */
import React, { useState, useEffect } from 'react';
import { DatePicker, Button, Drawer, Select, message } from 'antd';
import {
  SearchOutlined,
  FilterOutlined,
  CloseOutlined,
} from '@ant-design/icons';
import dayjs from 'dayjs';
import type { Dayjs } from 'dayjs';
import type { Handler } from './types';
import type { StatusTab } from '../../hooks/useOverview';
import styles from './index.less';

/** 状态选项配置（与 CollectionTable STATUS_TABS 保持一致） */
const STATUS_OPTIONS: Array<{ value: StatusTab; label: string; color: string }> = [
  { value: 'collecting', label: '催收中', color: '#1890ff' },
  { value: 'extension', label: '延期中', color: '#722ed1' },
  { value: 'difference_processing', label: '差异', color: '#13c2c2' },
  { value: 'escalated', label: '已升级', color: '#ff4d4f' },
  { value: 'pending_verify', label: '待核销', color: '#fa8c16' },
  { value: 'verified', label: '已核销', color: '#52c41a' },
];

interface MobileFiltersProps {
  visible: boolean;
  handlers: Handler[];
  selectedHandlerId: number | null;
  dateRange: [Dayjs | null, Dayjs | null] | null;
  isAdmin: boolean;
  onClose: () => void;
  onApply: () => void;
  onHandlerChange: (handlerId: number | null) => void;
  onDateRangeChange: (range: [Dayjs | null, Dayjs | null] | null) => void;
  onClearAll: () => void;
}

const MobileFilters: React.FC<MobileFiltersProps> = ({
  visible,
  handlers,
  selectedHandlerId,
  dateRange,
  isAdmin,
  onClose,
  onApply,
  onHandlerChange,
  onDateRangeChange,
  onClearAll,
}) => {
  // 本地临时状态
  const [localHandlerId, setLocalHandlerId] = useState(selectedHandlerId);
  const [localDateRange, setLocalDateRange] = useState(dateRange);

  // 同步外部状态到本地
  useEffect(() => {
    if (visible) {
      setLocalHandlerId(selectedHandlerId);
      setLocalDateRange(dateRange);
    }
  }, [visible, selectedHandlerId, dateRange]);

  // 应用筛选
  const handleApply = () => {
    // 日期合法性校验
    if (localDateRange?.[0] && localDateRange?.[1]) {
      if (dayjs(localDateRange[0]).isAfter(localDateRange[1], 'day')) {
        message.warning('开始日期不能晚于结束日期');
        return;
      }
    }
    onHandlerChange(localHandlerId);
    onDateRangeChange(localDateRange);
    onApply();
  };

  // 清除筛选
  const handleClear = () => {
    setLocalHandlerId(null);
    setLocalDateRange(null);
    onClearAll();
  };

  // 是否有筛选条件
  const hasFilters = Boolean(localHandlerId || localDateRange);

  return (
    <Drawer
      title="高级筛选"
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
      {/* 日期范围 */}
      <div className={styles.mobileFilterItem}>
        <div className={styles.mobileFilterLabel}>创建日期</div>
        <div className={styles.mobileDatePickers}>
          <DatePicker
            value={localDateRange?.[0] || null}
            onChange={(date) => setLocalDateRange((prev) => [date, prev?.[1] || null])}
            style={{ width: '100%' }}
            placeholder="选择开始日期"
          />
          <DatePicker
            value={localDateRange?.[1] || null}
            onChange={(date) => setLocalDateRange((prev) => [prev?.[0] || null, date])}
            style={{ width: '100%' }}
            placeholder="选择结束日期"
          />
        </div>
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
    </Drawer>
  );
};

// 移动端筛选按钮组件
interface MobileFilterButtonProps {
  hasFilters: boolean;
  onClick: () => void;
}

const MobileFilterButton: React.FC<MobileFilterButtonProps> = ({
  hasFilters,
  onClick,
}) => (
  <Button
    icon={<FilterOutlined />}
    onClick={onClick}
    className={hasFilters ? styles.filterButtonActive : undefined}
  >
    筛选
  </Button>
);

/** 获取状态显示文本 */
const getStatusText = (statusTab: StatusTab): string | undefined => {
  const option = STATUS_OPTIONS.find((opt) => opt.value === statusTab);
  return option?.label;
};

export { MobileFilters, MobileFilterButton, getStatusText, STATUS_OPTIONS };
export default MobileFilters;
