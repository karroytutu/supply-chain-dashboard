/**
 * 移动端筛选组件
 * 简化版 Drawer：搜索框 + 处理人 + 日期范围
 */
import React, { useState, useEffect } from 'react';
import { Input, DatePicker, Button, Drawer, Select, Space } from 'antd';
import {
  SearchOutlined,
  FilterOutlined,
  CloseOutlined,
} from '@ant-design/icons';
import type { Dayjs } from 'dayjs';
import type { Handler } from './types';
import styles from './index.less';

const { RangePicker } = DatePicker;

interface MobileFiltersProps {
  visible: boolean;
  searchKeyword: string;
  handlers: Handler[];
  selectedHandlerId: number | null;
  dateRange: [Dayjs | null, Dayjs | null] | null;
  isAdmin: boolean;
  onClose: () => void;
  onApply: () => void;
  onSearchChange: (keyword: string) => void;
  onHandlerChange: (handlerId: number | null) => void;
  onDateRangeChange: (range: [Dayjs | null, Dayjs | null] | null) => void;
  onClearAll: () => void;
}

const MobileFilters: React.FC<MobileFiltersProps> = ({
  visible,
  searchKeyword,
  handlers,
  selectedHandlerId,
  dateRange,
  isAdmin,
  onClose,
  onApply,
  onSearchChange,
  onHandlerChange,
  onDateRangeChange,
  onClearAll,
}) => {
  // 本地临时状态
  const [localKeyword, setLocalKeyword] = useState(searchKeyword);
  const [localHandlerId, setLocalHandlerId] = useState(selectedHandlerId);
  const [localDateRange, setLocalDateRange] = useState(dateRange);

  // 同步外部状态到本地
  useEffect(() => {
    if (visible) {
      setLocalKeyword(searchKeyword);
      setLocalHandlerId(selectedHandlerId);
      setLocalDateRange(dateRange);
    }
  }, [visible, searchKeyword, selectedHandlerId, dateRange]);

  // 应用筛选
  const handleApply = () => {
    onSearchChange(localKeyword);
    onHandlerChange(localHandlerId);
    onDateRangeChange(localDateRange);
    onApply();
  };

  // 清除筛选
  const handleClear = () => {
    setLocalKeyword('');
    setLocalHandlerId(null);
    setLocalDateRange(null);
    onClearAll();
  };

  // 是否有筛选条件
  const hasFilters = localKeyword || localHandlerId || localDateRange;

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
  onClick: () => void;
}

const MobileFilterButton: React.FC<MobileFilterButtonProps> = ({ hasFilters, onClick }) => (
  <Button
    icon={<FilterOutlined />}
    onClick={onClick}
    type={hasFilters ? 'primary' : 'default'}
  >
    <Space size={4}>
      筛选
      {hasFilters && (
        <span style={{
          background: '#fff',
          color: '#1890ff',
          borderRadius: 10,
          padding: '0 6px',
          fontSize: 12
        }}>
          已选
        </span>
      )}
    </Space>
  </Button>
);

export { MobileFilters, MobileFilterButton };
export default MobileFilters;
