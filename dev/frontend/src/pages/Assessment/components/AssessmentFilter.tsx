/**
 * 考核筛选栏组件
 * 统一列表模式下的筛选：考核类型、规则类型、被考核人、关键词、状态
 */
import React, { useEffect } from 'react';
import { Input, Select, Button, Space } from 'antd';
import { SearchOutlined, ReloadOutlined, ThunderboltOutlined } from '@ant-design/icons';
import { Authorized } from '@/components/Authorized';
import { PERMISSIONS } from '@/constants/permissions';
import { useAssessmentUsers } from '../hooks/useAssessmentUsers';

/** 考核类型选项 */
const CATEGORY_OPTIONS = [
  { value: '', label: '全部类型' },
  { value: 'return_order', label: '退货考核' },
  { value: 'oa_node_timeout', label: 'OA节点超时' },
  { value: 'credit_license', label: '执照补交超时' },
];

/** 各分类规则类型选项（用于 OptGroup 分组显示） */
const RULE_OPTIONS_BY_CATEGORY: Record<string, Array<{ value: string; label: string }>> = {
  return_order: [
    { value: 'procurement_confirm_timeout', label: '采购确认超时' },
    { value: 'marketing_sales_timeout', label: '营销销售超时' },
    { value: 'return_expire_insufficient', label: '退货保质期不足' },
    { value: 'erp_entry_timeout', label: 'ERP录入超时' },
    { value: 'warehouse_execute_timeout', label: '仓储执行超时' },
  ],
  oa_node_timeout: [
    { value: 'node_timeout', label: '节点超时' },
  ],
  credit_license: [
    { value: 'license_timeout', label: '执照补交超时' },
  ],
};

/** 考核类型中文映射 */
const CATEGORY_LABELS: Record<string, string> = {
  return_order: '退货考核',
  oa_node_timeout: 'OA节点超时',
  credit_license: '执照补交超时',
};

/** 状态选项 */
const STATUS_OPTIONS = [
  { value: 'pending', label: '待处理' },
  { value: 'confirmed', label: '已处理' },
  { value: 'cancelled', label: '无需考核' },
  { value: 'appealed', label: '申诉中' },
];

/** 根据当前分类获取规则类型选项 */
function getRuleOptions(category: string) {
  if (category) {
    return RULE_OPTIONS_BY_CATEGORY[category] || [];
  }
  // 全部类型时，按分组返回所有选项
  return Object.entries(RULE_OPTIONS_BY_CATEGORY).flatMap(([cat, options]) =>
    options.map(opt => ({
      ...opt,
      label: `${CATEGORY_LABELS[cat]} - ${opt.label}`,
    }))
  );
}

interface AssessmentFilterProps {
  category: string;
  keyword: string;
  ruleType: string;
  status: string;
  assessmentUserId: string;
  onFilter: (filters: Record<string, string>) => void;
  onReset: () => void;
  onCalculate?: () => void;
}

const AssessmentFilter: React.FC<AssessmentFilterProps> = ({
  category,
  keyword,
  ruleType,
  status,
  assessmentUserId,
  onFilter,
  onReset,
  onCalculate,
}) => {
  const { users, loading: usersLoading, searchUsers } = useAssessmentUsers();

  // 组件挂载时加载被考核人列表
  useEffect(() => {
    searchUsers();
  }, [searchUsers]);

  const ruleOptions = getRuleOptions(category);

  return (
    <div className="filter-bar">
      <Space wrap>
        <Select
          placeholder="考核类型"
          value={category || ''}
          onChange={(val) => onFilter({ category: val || '', ruleType: '' })}
          options={CATEGORY_OPTIONS}
          style={{ width: 160 }}
        />
        <Select
          placeholder="规则类型"
          value={ruleType || undefined}
          onChange={(val) => onFilter({ ruleType: val || '' })}
          options={ruleOptions}
          style={{ width: 200 }}
          allowClear
          showSearch
          optionFilterProp="label"
        />
        <Select
          placeholder="被考核人"
          value={assessmentUserId || undefined}
          onChange={(val) => onFilter({ assessmentUserId: val || '' })}
          options={users.map((u) => ({ value: String(u.id), label: u.name }))}
          style={{ width: 160 }}
          allowClear
          showSearch
          filterOption={false}
          onSearch={(val) => searchUsers(val)}
          loading={usersLoading}
          notFoundContent={usersLoading ? '搜索中...' : '无匹配人员'}
        />
        <Input.Search
          placeholder="搜索编号/名称/人员"
          value={keyword}
          onChange={(e) => onFilter({ keyword: e.target.value })}
          onSearch={(val) => onFilter({ keyword: val })}
          style={{ width: 200 }}
          prefix={<SearchOutlined />}
          allowClear
        />
        <Select
          placeholder="状态"
          value={status || undefined}
          onChange={(val) => onFilter({ status: val || '' })}
          options={STATUS_OPTIONS}
          style={{ width: 120 }}
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
