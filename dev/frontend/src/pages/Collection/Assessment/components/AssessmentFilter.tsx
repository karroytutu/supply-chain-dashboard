/**
 * 催收考核筛选栏组件
 */
import React from 'react';
import { Card, Input, DatePicker, Select, Button, Space } from 'antd';
import { ReloadOutlined } from '@ant-design/icons';
import type { AssessmentTier, AssessmentRole, AssessmentStatus } from '@/types/ar-assessment.d';
import { TIER_NAMES, ROLE_NAMES, STATUS_NAMES } from '@/types/ar-assessment.d';

const { RangePicker } = DatePicker;
const { Option } = Select;

interface AssessmentFilterProps {
  keyword: string;
  assessmentTier: AssessmentTier | undefined;
  assessmentRole: AssessmentRole | undefined;
  status: AssessmentStatus | undefined;
  onKeywordChange: (val: string) => void;
  onTierChange: (val: AssessmentTier | undefined) => void;
  onRoleChange: (val: AssessmentRole | undefined) => void;
  onStatusChange: (val: AssessmentStatus | undefined) => void;
  onDateRangeChange: (range: [string, string] | undefined) => void;
  onRefresh: () => void;
}

const AssessmentFilter: React.FC<AssessmentFilterProps> = ({
  keyword, assessmentTier, assessmentRole, status,
  onKeywordChange, onTierChange, onRoleChange, onStatusChange, onDateRangeChange, onRefresh,
}) => {
  return (
    <Card style={{ marginBottom: 16 }}>
      <Space wrap>
        <Input.Search
          placeholder="搜索任务编号/客户/人员"
          style={{ width: 220 }}
          value={keyword}
          onChange={(e) => onKeywordChange(e.target.value)}
          onSearch={(v) => onKeywordChange(v)}
          allowClear
        />
        <Select
          placeholder="考核层级"
          style={{ width: 160 }}
          value={assessmentTier}
          onChange={onTierChange}
          allowClear
        >
          {Object.entries(TIER_NAMES).map(([key, name]) => (
            <Option key={key} value={key}>{name}</Option>
          ))}
        </Select>
        <Select
          placeholder="角色"
          style={{ width: 120 }}
          value={assessmentRole}
          onChange={onRoleChange}
          allowClear
        >
          {Object.entries(ROLE_NAMES).map(([key, name]) => (
            <Option key={key} value={key}>{name}</Option>
          ))}
        </Select>
        <Select
          placeholder="状态"
          style={{ width: 120 }}
          value={status}
          onChange={onStatusChange}
          allowClear
        >
          {Object.entries(STATUS_NAMES).map(([key, name]) => (
            <Option key={key} value={key}>{name}</Option>
          ))}
        </Select>
        <RangePicker
          onChange={(_, dateStrings) => {
            if (dateStrings[0] && dateStrings[1]) {
              onDateRangeChange([dateStrings[0], dateStrings[1]]);
            } else {
              onDateRangeChange(undefined);
            }
          }}
        />
        <Button icon={<ReloadOutlined />} onClick={onRefresh}>刷新</Button>
      </Space>
    </Card>
  );
};

export default AssessmentFilter;
