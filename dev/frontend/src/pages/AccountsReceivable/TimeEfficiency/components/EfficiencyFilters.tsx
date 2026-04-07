/**
 * 时效筛选条件组件
 * 支持日期范围、逾期等级、节点类型筛选
 */
import React from 'react';
import { Row, Col, DatePicker, Select, Button, Space } from 'antd';
import { SearchOutlined, ReloadOutlined } from '@ant-design/icons';
import dayjs, { Dayjs } from 'dayjs';
import type { OverdueLevel } from '@/types/accounts-receivable';
import styles from '../index.less';

const { RangePicker } = DatePicker;

/** 筛选参数 */
export interface FilterParams {
  dateRange: [Dayjs, Dayjs] | null;
  overdueLevel: OverdueLevel | undefined;
  nodeType: string | undefined;
}

interface EfficiencyFiltersProps {
  filters: FilterParams;
  onChange: (filters: FilterParams) => void;
}

/** 逾期等级选项 */
const overdueLevelOptions = [
  { label: '全部等级', value: '' },
  { label: '轻度逾期', value: 'light' },
  { label: '中度逾期', value: 'medium' },
  { label: '重度逾期', value: 'severe' },
];

/** 节点类型选项 */
const nodeTypeOptions = [
  { label: '全部节点', value: '' },
  { label: '预处理', value: 'preprocessing' },
  { label: '任务分配', value: 'assignment' },
  { label: '催收执行', value: 'collection' },
];

const EfficiencyFilters: React.FC<EfficiencyFiltersProps> = ({
  filters,
  onChange,
}) => {
  /**
   * 日期范围变更
   */
  const handleDateRangeChange = (dates: [Dayjs | null, Dayjs | null] | null) => {
    if (dates && dates[0] && dates[1]) {
      onChange({
        ...filters,
        dateRange: [dates[0], dates[1]],
      });
    } else {
      onChange({
        ...filters,
        dateRange: null,
      });
    }
  };

  /**
   * 逾期等级变更
   */
  const handleOverdueLevelChange = (value: string) => {
    onChange({
      ...filters,
      overdueLevel: value ? (value as OverdueLevel) : undefined,
    });
  };

  /**
   * 节点类型变更
   */
  const handleNodeTypeChange = (value: string) => {
    onChange({
      ...filters,
      nodeType: value || undefined,
    });
  };

  /**
   * 重置筛选条件
   */
  const handleReset = () => {
    onChange({
      dateRange: null,
      overdueLevel: undefined,
      nodeType: undefined,
    });
  };

  return (
    <div className={styles.filterSection}>
      <Row gutter={[16, 16]} align="middle">
        {/* 日期范围 */}
        <Col xs={24} sm={12} md={8}>
          <RangePicker
            style={{ width: '100%' }}
            value={filters.dateRange}
            onChange={handleDateRangeChange}
            placeholder={['开始日期', '结束日期']}
            allowClear
          />
        </Col>

        {/* 逾期等级 */}
        <Col xs={24} sm={12} md={5}>
          <Select
            style={{ width: '100%' }}
            value={filters.overdueLevel || ''}
            onChange={handleOverdueLevelChange}
            options={overdueLevelOptions}
            placeholder="逾期等级"
          />
        </Col>

        {/* 节点类型 */}
        <Col xs={24} sm={12} md={5}>
          <Select
            style={{ width: '100%' }}
            value={filters.nodeType || ''}
            onChange={handleNodeTypeChange}
            options={nodeTypeOptions}
            placeholder="节点类型"
          />
        </Col>

        {/* 操作按钮 */}
        <Col xs={24} sm={12} md={6}>
          <div className={styles.filterActions}>
            <Space>
              <Button
                icon={<ReloadOutlined />}
                onClick={handleReset}
              >
                重置
              </Button>
            </Space>
          </div>
        </Col>
      </Row>
    </div>
  );
};

export default EfficiencyFilters;
