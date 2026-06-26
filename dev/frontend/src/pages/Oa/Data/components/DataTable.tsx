import React from 'react';
import { Table, Button, Tag } from 'antd';

import type { ColumnsType } from 'antd/es/table';
import { history } from 'umi';
import type { ApprovalInstance } from '@/types/oa';
import { formatDateTime } from '@/utils/format';
import DataCardList from './DataCardList';
import styles from '../index.less';

// 审批状态映射
const statusMap: Record<string, { color: string; text: string }> = {
  pending: { color: 'processing', text: '处理中' },
  approved: { color: 'success', text: '已通过' },
  rejected: { color: 'error', text: '已拒绝' },
  withdrawn: { color: 'default', text: '已撤回' },
  cancelled: { color: 'warning', text: '已取消' },
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
  {
    title: '申请时间', dataIndex: 'submittedAt', key: 'submittedAt', width: 160, sorter: true,
    render: (text) => formatDateTime(text),
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
    <>
      {/* 桌面/平板：表格 */}
      <div className={styles.tableWrapper}>
        <Table
          columns={columns}
          dataSource={dataSource}
          rowKey="id"
          loading={loading}
          scroll={{ x: 900 }}
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
      </div>

      {/* 手机端：卡片流 */}
      <div className={styles.cardListWrapper}>
        <DataCardList
          dataSource={dataSource}
          loading={loading}
          pagination={pagination}
          onPaginationChange={onPaginationChange}
        />
      </div>
    </>
  );
};

export default DataTable;
