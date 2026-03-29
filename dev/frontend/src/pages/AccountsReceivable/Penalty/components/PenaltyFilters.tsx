/**
 * 考核筛选组件
 */
import React, { useState, useEffect } from 'react';
import { Select, DatePicker, Button, Switch, Space, Drawer } from 'antd';
import { FilterOutlined, ReloadOutlined, SettingOutlined } from '@ant-design/icons';
import type { Dayjs } from 'dayjs';
import styles from '../index.less';

// 筛选值类型
export interface FilterValues {
  userId?: number;
  penaltyLevel?: string;
  dateRange: [Dayjs | null, Dayjs | null] | null;
  isMyPenalty: boolean;
}

interface PenaltyFiltersProps {
  value: FilterValues;
  onChange: (filters: FilterValues) => void;
  onRefresh: () => void;
}

const { RangePicker } = DatePicker;

// 考核级别选项
const penaltyLevelOptions = [
  { label: '全部', value: undefined },
  { label: '无考核', value: 'none' },
  { label: '基础考核', value: 'base' },
  { label: '翻倍考核', value: 'double' },
  { label: '全额考核', value: 'full' },
];

// 模拟人员列表（实际应从接口获取）
const userOptions = [
  { label: '全部人员', value: undefined },
  { label: '张三', value: 1 },
  { label: '李四', value: 2 },
  { label: '王五', value: 3 },
];

const PenaltyFilters: React.FC<PenaltyFiltersProps> = ({
  value,
  onChange,
  onRefresh,
}) => {
  // 移动端抽屉状态
  const [drawerVisible, setDrawerVisible] = useState(false);
  // 是否移动端
  const [isMobile, setIsMobile] = useState(false);

  // 检测屏幕宽度
  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 768);
    };
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  // 处理筛选条件变化
  const handleChange = (key: keyof FilterValues, newValue: any) => {
    onChange({
      ...value,
      [key]: newValue,
    });
  };

  // 渲染筛选内容
  const renderFilterContent = () => (
    <div className={styles.filterRow}>
      {/* 人员选择 */}
      <div className={styles.filterItem}>
        <Select
          placeholder="选择人员"
          options={userOptions}
          value={value.userId}
          onChange={(v) => handleChange('userId', v)}
          style={{ width: '100%' }}
          allowClear
        />
      </div>

      {/* 考核级别 */}
      <div className={styles.filterItem}>
        <Select
          placeholder="考核级别"
          options={penaltyLevelOptions}
          value={value.penaltyLevel}
          onChange={(v) => handleChange('penaltyLevel', v)}
          style={{ width: '100%' }}
          allowClear
        />
      </div>

      {/* 时间范围 */}
      <div className={styles.filterItem}>
        <RangePicker
          value={value.dateRange}
          onChange={(dates) => handleChange('dateRange', dates)}
          style={{ width: '100%' }}
        />
      </div>

      {/* 我的考核开关 */}
      <div
        className={styles.myPenaltySwitch}
        onClick={() => handleChange('isMyPenalty', !value.isMyPenalty)}
      >
        <Switch
          checked={value.isMyPenalty}
          onChange={(checked) => handleChange('isMyPenalty', checked)}
          size="small"
        />
        <span>我的考核</span>
      </div>

      {/* 刷新按钮 */}
      <Button
        type="default"
        icon={<ReloadOutlined />}
        onClick={onRefresh}
        className={styles.refreshBtn}
      >
        刷新
      </Button>
    </div>
  );

  // 移动端渲染
  if (isMobile) {
    return (
      <>
        <Space style={{ width: '100%', justifyContent: 'space-between' }}>
          <Button
            icon={<FilterOutlined />}
            onClick={() => setDrawerVisible(true)}
          >
            筛选
          </Button>
          <div className={styles.myPenaltySwitch}>
            <Switch
              checked={value.isMyPenalty}
              onChange={(checked) => handleChange('isMyPenalty', checked)}
              size="small"
            />
            <span>我的考核</span>
          </div>
        </Space>

        <Drawer
          title="筛选条件"
          placement="right"
          open={drawerVisible}
          onClose={() => setDrawerVisible(false)}
          className={styles.mobileFilterDrawer}
          width={300}
        >
          <div className={styles.mobileFilterItem}>
            <div className={styles.mobileFilterLabel}>人员</div>
            <Select
              placeholder="选择人员"
              options={userOptions}
              value={value.userId}
              onChange={(v) => handleChange('userId', v)}
              style={{ width: '100%' }}
              allowClear
            />
          </div>

          <div className={styles.mobileFilterItem}>
            <div className={styles.mobileFilterLabel}>考核级别</div>
            <Select
              placeholder="考核级别"
              options={penaltyLevelOptions}
              value={value.penaltyLevel}
              onChange={(v) => handleChange('penaltyLevel', v)}
              style={{ width: '100%' }}
              allowClear
            />
          </div>

          <div className={styles.mobileFilterItem}>
            <div className={styles.mobileFilterLabel}>时间范围</div>
            <RangePicker
              value={value.dateRange}
              onChange={(dates) => handleChange('dateRange', dates)}
              style={{ width: '100%' }}
            />
          </div>

          <Button
            type="primary"
            block
            onClick={() => {
              setDrawerVisible(false);
              onRefresh();
            }}
          >
            应用筛选
          </Button>
        </Drawer>
      </>
    );
  }

  // 桌面端渲染
  return renderFilterContent();
};

export default PenaltyFilters;
