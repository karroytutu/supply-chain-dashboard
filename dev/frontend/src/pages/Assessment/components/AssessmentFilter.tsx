/**
 * 考核筛选栏组件
 */
import React from 'react';
import { Input, Select, Button, Space } from 'antd';
import { SearchOutlined, ReloadOutlined, ThunderboltOutlined } from '@ant-design/icons';
import { Authorized } from '@/components/Authorized';
import { PERMISSIONS } from '@/constants/permissions';

/** 退货考核规则类型选项 */
const RETURN_RULE_OPTIONS = [
  { value: 'procurement_confirm_timeout', label: '采购确认超时' },
  { value: 'marketing_sales_timeout', label: '营销销售超时' },
  { value: 'return_expire_insufficient', label: '退货保质期不足' },
  { value: 'erp_entry_timeout', label: 'ERP录入超时' },
  { value: 'warehouse_execute_timeout', label: '仓储执行超时' },
];

/** 退货考核角色选项 */
const RETURN_ROLE_OPTIONS = [
  { value: 'procurement_manager', label: '采购主管' },
  { value: 'marketing_manager', label: '营销经理' },
  { value: 'warehouse_manager', label: '仓储主管' },
  { value: 'warehouse_operator', label: '库管员' },
  { value: 'logistics_manager', label: '物流经理' },
];

/** 状态选项 */
const STATUS_OPTIONS = [
  { value: 'pending', label: '待处理' },
  { value: 'confirmed', label: '已处理' },
  { value: 'cancelled', label: '无需考核' },
  { value: 'appealed', label: '申诉中' },
];

interface AssessmentFilterProps {
  category: AssessmentCategory;
  keyword: string;
  ruleType: string;
  role: string;
  status: string;
  onFilter: (filters: Record<string, string>) => void;
  onReset: () => void;
  onCalculate?: () => void;
}

const AssessmentFilter: React.FC<AssessmentFilterProps> = ({
  category,
  keyword,
  ruleType,
  role,
  status,
  onFilter,
  onReset,
  onCalculate,
}) => {
  // 规则类型和角色筛选仅对退货考核分类显示
  const showReturnFilters = category === 'return_order';
  const ruleOptions = showReturnFilters ? RETURN_RULE_OPTIONS : [];
  const roleOptions = showReturnFilters ? RETURN_ROLE_OPTIONS : [];

  return (
    <div className="filter-bar">
      <Space wrap>
        <Input.Search
          placeholder="搜索编号/客户/商品/人员"
          value={keyword}
          onChange={(e) => onFilter({ keyword: e.target.value })}
          onSearch={(val) => onFilter({ keyword: val })}
          style={{ width: 220 }}
          prefix={<SearchOutlined />}
          allowClear
        />
        {showReturnFilters && (
          <Select
            placeholder="规则类型"
            value={ruleType || undefined}
            onChange={(val) => onFilter({ ruleType: val || '' })}
            options={ruleOptions}
            style={{ width: 160 }}
            allowClear
          />
        )}
        {showReturnFilters && (
          <Select
            placeholder="角色"
            value={role || undefined}
            onChange={(val) => onFilter({ role: val || '' })}
            options={roleOptions}
            style={{ width: 160 }}
            allowClear
          />
        )}
        <Select
          placeholder="状态"
          value={status || undefined}
          onChange={(val) => onFilter({ status: val || '' })}
          options={STATUS_OPTIONS}
          style={{ width: 160 }}
          allowClear
        />
        <Button icon={<ReloadOutlined />} onClick={onReset}>
          重置
        </Button>
        <Authorized permission={PERMISSIONS.ASSESSMENT.WRITE}>
          <Button
            icon={<ThunderboltOutlined />}
            onClick={onCalculate}
          >
            手动计算
          </Button>
        </Authorized>
      </Space>
    </div>
  );
};

export default AssessmentFilter;
