import React from 'react';
import { Card, Input, DatePicker, Select, Button, Space } from 'antd';
import { ReloadOutlined } from '@ant-design/icons';
import {
  type PenaltyType,
  type PenaltyStatus,
  PENALTY_TYPE_NAMES,
  PENALTY_STATUS_NAMES,
} from '@/types/return-penalty.d';
import { useIsMobile } from '@/hooks/useMobileDetect';
import { MobileSelect, MobileDateRangePicker } from '@/components/Mobile';

const { RangePicker } = DatePicker;
const { Option } = Select;

interface PenaltyFilterProps {
  keyword: string;
  penaltyType: PenaltyType | undefined;
  status: PenaltyStatus | undefined;
  onKeywordChange: (val: string) => void;
  onPenaltyTypeChange: (val: PenaltyType | undefined) => void;
  onStatusChange: (val: PenaltyStatus | undefined) => void;
  onDateRangeChange: (range: [string, string] | undefined) => void;
  onRefresh: () => void;
}

const PenaltyFilter: React.FC<PenaltyFilterProps> = ({
  keyword, penaltyType, status,
  onKeywordChange, onPenaltyTypeChange, onStatusChange, onDateRangeChange, onRefresh,
}) => {
  const isMobile = useIsMobile();
  return (
    <Card style={{ marginBottom: 16 }}>
      <Space wrap>
        <Input.Search
          placeholder="搜索单号/商品/人员"
          style={{ width: isMobile ? '100%' : 200 }}
          value={keyword}
          onChange={(e) => onKeywordChange(e.target.value)}
          onSearch={(v) => onKeywordChange(v)}
          allowClear
        />
        {isMobile ? (
          <MobileSelect
            value={penaltyType}
            onChange={(v) => onPenaltyTypeChange(v as PenaltyType | undefined)}
            options={Object.entries(PENALTY_TYPE_NAMES).map(([key, name]) => ({ value: key, label: name }))}
            placeholder="考核类型"
            allowClear
            title="考核类型"
            style={{ width: '100%' }}
          />
        ) : (
          <Select
            placeholder="考核类型"
            style={{ width: 150 }}
            value={penaltyType}
            onChange={onPenaltyTypeChange}
            allowClear
          >
            {Object.entries(PENALTY_TYPE_NAMES).map(([key, name]) => (
              <Option key={key} value={key}>{name}</Option>
            ))}
          </Select>
        )}
        {isMobile ? (
          <MobileSelect
            value={status}
            onChange={(v) => onStatusChange(v as PenaltyStatus | undefined)}
            options={Object.entries(PENALTY_STATUS_NAMES).map(([key, name]) => ({ value: key, label: name }))}
            placeholder="状态"
            allowClear
            title="状态"
            style={{ width: '100%' }}
          />
        ) : (
          <Select
            placeholder="状态"
            style={{ width: 120 }}
            value={status}
            onChange={onStatusChange}
            allowClear
          >
            {Object.entries(PENALTY_STATUS_NAMES).map(([key, name]) => (
              <Option key={key} value={key}>{name}</Option>
            ))}
          </Select>
        )}
        {isMobile ? (
          <MobileDateRangePicker
            onChange={(val) => {
              if (val && val[0] && val[1]) {
                onDateRangeChange([val[0], val[1]]);
              } else {
                onDateRangeChange(undefined);
              }
            }}
          />
        ) : (
          <RangePicker
            onChange={(_, dateStrings) => {
              if (dateStrings[0] && dateStrings[1]) {
                onDateRangeChange([dateStrings[0], dateStrings[1]]);
              } else {
                onDateRangeChange(undefined);
              }
            }}
          />
        )}
        <Button icon={<ReloadOutlined />} onClick={onRefresh}>刷新</Button>
      </Space>
    </Card>
  );
};

export default PenaltyFilter;
