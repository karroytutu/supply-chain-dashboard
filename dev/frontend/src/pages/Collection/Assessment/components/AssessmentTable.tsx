/**
 * 催收考核数据表格组件
 */
import React from 'react';
import { Table, Button, Tag } from 'antd';
import { FormOutlined } from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import type { AssessmentRecord, AssessmentTier, AssessmentRole, AssessmentStatus } from '@/types/ar-assessment.d';
import { TIER_NAMES, ROLE_NAMES, STATUS_NAMES } from '@/types/ar-assessment.d';
import { Authorized } from '@/components/Authorized';

interface AssessmentTableProps {
  data: AssessmentRecord[];
  loading: boolean;
  page: number;
  pageSize: number;
  total: number;
  onMark: (record: AssessmentRecord) => void;
  onPageChange: (page: number, pageSize: number) => void;
}

/** 考核表格列定义 */
const useColumns = (onMark: (record: AssessmentRecord) => void): ColumnsType<AssessmentRecord> => [
  {
    title: '任务编号', dataIndex: 'taskNo', width: 150,
    render: (text) => text || '-',
  },
  {
    title: '客户名称', dataIndex: 'consumerName', width: 120, ellipsis: true,
  },
  {
    title: '考核层级', dataIndex: 'assessmentTier', width: 140,
    render: (tier: AssessmentTier) => <Tag color="blue">{TIER_NAMES[tier] || tier}</Tag>,
  },
  {
    title: '被考核人', dataIndex: 'assessmentUserName', width: 100,
  },
  {
    title: '角色', dataIndex: 'assessmentRole', width: 90,
    render: (role: AssessmentRole) => ROLE_NAMES[role] || role,
  },
  {
    title: '超时天数', dataIndex: 'overdueDays', width: 90, align: 'center',
    render: (days) => days > 0 ? `${days}天` : '-',
  },
  {
    title: '考核金额', dataIndex: 'penaltyAmount', width: 110, align: 'right',
    render: (amount) => <span style={{ color: '#f5222d' }}>¥{amount.toFixed(2)}</span>,
  },
  {
    title: '处理状态', dataIndex: 'status', width: 100,
    render: (status: AssessmentStatus) => {
      const colorMap: Record<AssessmentStatus, string> = {
        pending: 'orange',
        handled: 'green',
        skipped: 'default',
      };
      return <Tag color={colorMap[status]}>{STATUS_NAMES[status] || status}</Tag>;
    },
  },
  {
    title: '处理备注', dataIndex: 'handleRemark', width: 200, ellipsis: true,
    render: (text) => text || '-',
  },
  {
    title: '处理时间', dataIndex: 'handledAt', width: 160,
    render: (text) => text ? new Date(text).toLocaleString('zh-CN') : '-',
  },
  {
    title: '计算时间', dataIndex: 'calculatedAt', width: 160,
    render: (text) => text ? new Date(text).toLocaleString('zh-CN') : '-',
  },
  {
    title: '操作', width: 100, fixed: 'right',
    render: (_, record) => {
      if (record.status !== 'pending') return '-';
      return (
        <Authorized role={['operations_manager', 'admin']}>
          <Button
            type="link"
            size="small"
            icon={<FormOutlined />}
            onClick={() => onMark(record)}
          >
            标记
          </Button>
        </Authorized>
      );
    },
  },
];

const AssessmentTable: React.FC<AssessmentTableProps> = ({
  data, loading, page, pageSize, total, onMark, onPageChange,
}) => {
  const columns = useColumns(onMark);

  return (
    <Table
      columns={columns}
      dataSource={data}
      rowKey="id"
      loading={loading}
      scroll={{ x: 1500 }}
      pagination={{
        current: page,
        pageSize,
        total,
        showSizeChanger: true,
        showQuickJumper: true,
        showTotal: (t) => `共 ${t} 条`,
        onChange: onPageChange,
      }}
    />
  );
};

export default AssessmentTable;
