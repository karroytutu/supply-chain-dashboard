import React from 'react';
import { Row, Col, Card, Select, DatePicker, Input, Space, Button, Tooltip, Tag } from 'antd';
import { SearchOutlined, ReloadOutlined, FilterOutlined } from '@ant-design/icons';
import type { FormTypeDefinition } from '@/types/oa-approval';
import { Authorized } from '@/components/Authorized';
import { PERMISSIONS } from '@/constants/permissions';
import styles from '../index.less';

const { RangePicker } = DatePicker;
const { Option } = Select;

// 审批状态映射
const statusMap: Record<string, { color: string; text: string }> = {
  pending: { color: 'processing', text: '审批中' },
  approved: { color: 'success', text: '已通过' },
  rejected: { color: 'error', text: '已驳回' },
  withdrawn: { color: 'default', text: '已撤回' },
  cancelled: { color: 'warning', text: '已取消' },
};

interface DataFilterBarProps {
  formTypeCode: string | undefined;
  status: string | undefined;
  dateRange: [any, any] | null;
  searchText: string;
  applicantName: string;
  formTypes: FormTypeDefinition[];
  setFormTypeCode: (val: string | undefined) => void;
  setStatus: (val: string | undefined) => void;
  setDateRange: (val: [any, any] | null) => void;
  setSearchText: (val: string) => void;
  setApplicantName: (val: string) => void;
  handleReset: () => void;
  exportMenu: React.ReactNode;
}

const DataFilterBar: React.FC<DataFilterBarProps> = ({
  formTypeCode, status, dateRange, searchText, applicantName,
  formTypes, setFormTypeCode, setStatus, setDateRange,
  setSearchText, setApplicantName, handleReset, exportMenu,
}) => {
  return (
    <>
      {/* 筛选区域 */}
      <div className={styles.filterSection}>
        <Row gutter={16}>
          <Col span={4}>
            <Select placeholder="申请类型" allowClear style={{ width: '100%' }} value={formTypeCode} onChange={setFormTypeCode}>
              {formTypes.map((ft) => (
                <Option key={ft.code} value={ft.code}>{ft.name}</Option>
              ))}
            </Select>
          </Col>
          <Col span={4}>
            <Select placeholder="审批状态" allowClear style={{ width: '100%' }} value={status} onChange={setStatus}>
              <Option value="pending">审批中</Option>
              <Option value="approved">已通过</Option>
              <Option value="rejected">已驳回</Option>
              <Option value="withdrawn">已撤回</Option>
              <Option value="cancelled">已取消</Option>
            </Select>
          </Col>
          <Col span={6}>
            <RangePicker
              style={{ width: '100%' }}
              value={dateRange}
              onChange={(dates) => setDateRange(dates as [any, any] | null)}
              placeholder={['开始日期', '结束日期']}
            />
          </Col>
          <Col span={4}>
            <Input placeholder="申请人姓名" allowClear value={applicantName} onChange={(e) => setApplicantName(e.target.value)} />
          </Col>
          <Col span={4}>
            <Input placeholder="搜索关键词" prefix={<SearchOutlined />} allowClear value={searchText} onChange={(e) => setSearchText(e.target.value)} />
          </Col>
          <Col span={2}>
            <Space>
              <Tooltip title="重置">
                <Button icon={<ReloadOutlined />} onClick={handleReset} />
              </Tooltip>
            </Space>
          </Col>
        </Row>
      </div>

      {/* 工具栏 */}
      <div className={styles.toolbar}>
        <Space>
          <span className={styles.filterTag}>
            <FilterOutlined /> 已筛选
            {formTypeCode && <Tag>{formTypes.find((f) => f.code === formTypeCode)?.name}</Tag>}
            {status && <Tag>{statusMap[status]?.text}</Tag>}
            {dateRange && (
              <Tag>{dateRange[0].format('YYYY-MM-DD')} ~ {dateRange[1].format('YYYY-MM-DD')}</Tag>
            )}
          </span>
        </Space>
        <Authorized permission={PERMISSIONS.OA.DATA.EXPORT}>
          {exportMenu}
        </Authorized>
      </div>
    </>
  );
};

export default DataFilterBar;
