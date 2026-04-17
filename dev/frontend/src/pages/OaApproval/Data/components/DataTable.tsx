import React from 'react';
import { Table, Button, Tag } from 'antd';
import { DownloadOutlined } from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import { history } from 'umi';
import type { ApprovalInstance } from '@/types/oa-approval';
import { formatDateTime } from '@/utils/format';
import styles from '../index.less';

// 审批状态映射
const statusMap: Record<string, { color: string; text: string }> = {
  pending: { color: 'processing', text: '审批中' },
  approved: { color: 'success', text: '已通过' },
  rejected: { color: 'error', text: '已驳回' },
  withdrawn: { color: 'default', text: '已撤回' },
  cancelled: { color: 'warning', text: '已取消' },
};

// 紧急程度映射
const urgencyMap: Record<string, { color: string; text: string }> = {
  normal: { color: 'default', text: '普通' },
  urgent: { color: 'warning', text: '紧急' },
  very_urgent: { color: 'error', text: '非常紧急' },
};

/** 表格列定义 */
const columns: ColumnsType<ApprovalInstance> = [
  {
    title: '编号', dataIndex: 'instanceNo', key: 'instanceNo', width: 180, fixed: 'left',
    render: (text, record) => (
      <a onClick={() => history.push(`/oa/detail/${record.id}`)}>{text}</a>
    ),
  },
  { title: '申请类型', dataIndex: 'formTypeName', key: 'formTypeName', width: 120 },
  { title: '申请人', dataIndex: 'applicantName', key: 'applicantName', width: 100 },
  { title: '申请部门', dataIndex: 'applicantDept', key: 'applicantDept', width: 150 },
  {
    title: '申请时间', dataIndex: 'submittedAt', key: 'submittedAt', width: 160, sorter: true,
    render: (text) => formatDateTime(text),
  },
  {
    title: '紧急程度', dataIndex: 'urgency', key: 'urgency', width: 100,
    render: (urgency) => {
      const config = urgencyMap[urgency] || { color: 'default', text: urgency };
      return <Tag color={config.color}>{config.text}</Tag>;
    },
  },
  {
    title: '状态', dataIndex: 'status', key: 'status', width: 100,
    render: (status) => {
      const config = statusMap[status] || { color: 'default', text: status };
      return <Tag color={config.color}>{config.text}</Tag>;
    },
  },
  {
    title: '当前处理人', dataIndex: 'currentApproverName', key: 'currentApproverName', width: 120,
    render: (text) => text || '-',
  },
  {
    title: '完成时间', dataIndex: 'completedAt', key: 'completedAt', width: 160,
    render: (text) => (text ? formatDateTime(text) : '-'),
  },
  {
    title: '操作', key: 'action', width: 80, fixed: 'right',
    render: (_, record) => (
      <Button type="link" size="small" onClick={() => history.push(`/oa/detail/${record.id}`)}>
        查看
      </Button>
    ),
  },
];

interface DataTableProps {
  dataSource: ApprovalInstance[];
  loading: boolean;
  pagination: { current: number; pageSize: number; total: number };
  onPaginationChange: (page: number, pageSize: number) => void;
}

const DataTable: React.FC<DataTableProps> = ({ dataSource, loading, pagination, onPaginationChange }) => {
  return (
    <Table
      columns={columns}
      dataSource={dataSource}
      rowKey="id"
      loading={loading}
      scroll={{ x: 1400 }}
      pagination={{
        current: pagination.current,
        pageSize: pagination.pageSize,
        total: pagination.total,
        showSizeChanger: true,
        showQuickJumper: true,
        showTotal: (total) => `共 ${total} 条`,
        onChange: onPaginationChange,
      }}
    />
  );
};

export default DataTable;
