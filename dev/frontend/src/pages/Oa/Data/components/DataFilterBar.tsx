import React from 'react';
import { Row, Col, Select, DatePicker, Input, Space, Button, Tooltip, Tag } from 'antd';
import { SearchOutlined, ReloadOutlined, FilterOutlined } from '@ant-design/icons';
import type { FormTypeDefinition } from '@/types/oa';
import { useIsMobile } from '@/hooks/useMobileDetect';
import { MobileSelect, MobileDateRangePicker } from '@/components/Mobile';
import dayjs from 'dayjs';
import styles from '../index.less';

const { RangePicker } = DatePicker;
const { Option } = Select;

// 审批状态映射
const statusMap: Record<string, { color: string; text: string }> = {
  pending: { color: 'processing', text: '处理中' },
  approved: { color: 'success', text: '已通过' },
  rejected: { color: 'error', text: '已拒绝' },
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
  const isMobile = useIsMobile();
  return (
    <>
      {/* 筛选区域 */}
      <div className={styles.filterSection}>
        <Row gutter={[12, 8]}>
          <Col xs={24} sm={12} lg={4}>
            {isMobile ? (
              <MobileSelect
                value={formTypeCode}
                onChange={(v) => setFormTypeCode(v as string | undefined)}
                options={formTypes.map((ft) => ({ value: ft.code, label: ft.name }))}
                placeholder="申请类型"
                allowClear
                title="申请类型"
                style={{ width: '100%' }}
              />
            ) : (
              <Select placeholder="申请类型" allowClear style={{ width: '100%' }} value={formTypeCode} onChange={setFormTypeCode}>
                {formTypes.map((ft) => (
                  <Option key={ft.code} value={ft.code}>{ft.name}</Option>
                ))}
              </Select>
            )}
          </Col>
          <Col xs={24} sm={12} lg={4}>
            {isMobile ? (
              <MobileSelect
                value={status}
                onChange={(v) => setStatus(v as string | undefined)}
                options={[
                  { value: 'pending', label: '处理中' },
                  { value: 'approved', label: '已通过' },
                  { value: 'rejected', label: '已拒绝' },
                  { value: 'withdrawn', label: '已撤回' },
                  { value: 'cancelled', label: '已取消' },
                ]}
                placeholder="审批状态"
                allowClear
                title="审批状态"
                style={{ width: '100%' }}
              />
            ) : (
              <Select placeholder="审批状态" allowClear style={{ width: '100%' }} value={status} onChange={setStatus}>
                <Option value="pending">处理中</Option>
                <Option value="approved">已通过</Option>
                <Option value="rejected">已拒绝</Option>
                <Option value="withdrawn">已撤回</Option>
                <Option value="cancelled">已取消</Option>
              </Select>
            )}
          </Col>
          <Col xs={24} sm={12} lg={6}>
            {isMobile ? (
              <MobileDateRangePicker
                value={dateRange && dateRange[0] && dateRange[1]
                  ? [dateRange[0].format('YYYY-MM-DD'), dateRange[1].format('YYYY-MM-DD')]
                  : null}
                onChange={(val) => {
                  if (val && val[0] && val[1]) {
                    setDateRange([dayjs(val[0]), dayjs(val[1])]);
                  } else {
                    setDateRange(null);
                  }
                }}
              />
            ) : (
              <RangePicker
                style={{ width: '100%' }}
                value={dateRange}
                onChange={(dates) => setDateRange(dates as [any, any] | null)}
                placeholder={['开始日期', '结束日期']}
              />
            )}
          </Col>
          <Col xs={24} sm={12} lg={4}>
            <Input placeholder="申请人姓名" allowClear value={applicantName} onChange={(e) => setApplicantName(e.target.value)} />
          </Col>
          <Col xs={24} sm={12} lg={4}>
            <Input placeholder="搜索关键词" prefix={<SearchOutlined />} allowClear value={searchText} onChange={(e) => setSearchText(e.target.value)} />
          </Col>
          <Col xs={24} sm={12} lg={2}>
            <div style={{ textAlign: 'right' }}>
              <Space>
                <Tooltip title="重置">
                  <Button icon={<ReloadOutlined />} onClick={handleReset} />
                </Tooltip>
              </Space>
            </div>
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
        {exportMenu}
      </div>
    </>
  );
};

export default DataFilterBar;
