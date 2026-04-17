import React from 'react';
import { Table, Button, Tag, Space } from 'antd';
import { CheckOutlined, CloseOutlined } from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import type { PenaltyRecord, PenaltyType, PenaltyStatus, PenaltyRole } from '@/types/return-penalty.d';
import { PENALTY_TYPE_NAMES, PENALTY_STATUS_NAMES, PENALTY_ROLE_NAMES } from '@/types/return-penalty.d';

interface PenaltyTableProps {
  data: PenaltyRecord[];
  loading: boolean;
  page: number;
  pageSize: number;
  total: number;
  onConfirm: (id: number) => void;
  onCancel: (id: number) => void;
  onPageChange: (page: number, pageSize: number) => void;
}

/** 退回考核表格列定义 */
const useColumns = (onConfirm: (id: number) => void, onCancel: (id: number) => void): ColumnsType<PenaltyRecord> => [
  {
    title: '退货单号', dataIndex: 'returnNo', width: 140,
    render: (text) => text || '-',
  },
  {
    title: '商品名称', dataIndex: 'goodsName', width: 150, ellipsis: true,
  },
  {
    title: '被考核人', dataIndex: 'penaltyUserName', width: 100,
  },
  {
    title: '角色', dataIndex: 'penaltyRole', width: 100,
    render: (role: PenaltyRole) => PENALTY_ROLE_NAMES[role] || role,
  },
  {
    title: '考核类型', dataIndex: 'penaltyType', width: 130,
    render: (type: PenaltyType) => <Tag color="blue">{PENALTY_TYPE_NAMES[type] || type}</Tag>,
  },
  {
    title: '超时天数', dataIndex: 'overdueDays', width: 90, align: 'center',
    render: (days) => days > 0 ? `${days}天` : '-',
  },
  {
    title: '考核金额', dataIndex: 'penaltyAmount', width: 100, align: 'right',
    render: (amount) => <span style={{ color: '#f5222d' }}>¥{amount.toFixed(2)}</span>,
  },
  {
    title: '状态', dataIndex: 'status', width: 90,
    render: (status: PenaltyStatus) => {
      const colorMap: Record<PenaltyStatus, string> = {
        pending: 'orange', confirmed: 'green', appealed: 'blue', cancelled: 'default',
      };
      return <Tag color={colorMap[status]}>{PENALTY_STATUS_NAMES[status] || status}</Tag>;
    },
  },
  {
    title: '计算时间', dataIndex: 'calculatedAt', width: 160,
    render: (text) => text ? new Date(text).toLocaleString('zh-CN') : '-',
  },
  {
    title: '操作', width: 120, fixed: 'right',
    render: (_, record) => {
      if (record.status !== 'pending') return '-';
      return (
        <Space size="small">
          <Button type="link" size="small" icon={<CheckOutlined />} onClick={() => onConfirm(record.id)}>确认</Button>
          <Button type="link" size="small" danger icon={<CloseOutlined />} onClick={() => onCancel(record.id)}>取消</Button>
        </Space>
      );
    },
  },
];

const PenaltyTable: React.FC<PenaltyTableProps> = ({
  data, loading, page, pageSize, total, onConfirm, onCancel, onPageChange,
}) => {
  const columns = useColumns(onConfirm, onCancel);

  return (
    <Table
      columns={columns}
      dataSource={data}
      rowKey="id"
      loading={loading}
      scroll={{ x: 1300 }}
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

export default PenaltyTable;
