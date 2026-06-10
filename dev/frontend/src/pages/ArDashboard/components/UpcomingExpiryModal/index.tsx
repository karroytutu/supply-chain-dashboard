/**
 * 即将逾期弹窗
 * 按客户维度展示即将逾期的欠款明细
 */

import React from 'react';
import { Modal, Table, Alert } from 'antd';
import type { ColumnsType } from 'antd/es/table';

interface UpcomingExpiryModalProps {
  visible: boolean;
  onClose: () => void;
  data: UpcomingExpiryCustomer[];
  loading?: boolean;
  error?: string | null;
}

const columns: ColumnsType<UpcomingExpiryCustomer> = [
  {
    title: '客户名称',
    dataIndex: 'consumerName',
    width: 140,
  },
  {
    title: '欠款笔数',
    dataIndex: 'billCount',
    width: 90,
    align: 'center',
    sorter: (a, b) => a.billCount - b.billCount,
  },
  {
    title: '欠款总额',
    dataIndex: 'totalAmount',
    width: 120,
    align: 'right',
    sorter: (a, b) => a.totalAmount - b.totalAmount,
    render: (v: number) => `¥${v.toLocaleString()}`,
  },
  {
    title: '最近到期日',
    dataIndex: 'nearestExpireDate',
    width: 120,
    sorter: (a, b) => a.nearestExpireDate.localeCompare(b.nearestExpireDate),
  },
  {
    title: '营销师',
    dataIndex: 'managerUserName',
    width: 90,
  },
];

const UpcomingExpiryModal: React.FC<UpcomingExpiryModalProps> = ({ visible, onClose, data, loading, error }) => {
  return (
    <Modal
      title="即将逾期明细（5天内）"
      open={visible}
      onCancel={onClose}
      footer={null}
      width={680}
      destroyOnClose
    >
      {error && <Alert message="加载失败" description={error} type="error" showIcon style={{ marginBottom: 12 }} />}
      <Table<UpcomingExpiryCustomer>
        rowKey="consumerName"
        columns={columns}
        dataSource={data}
        loading={loading}
        pagination={false}
        size="small"
        scroll={{ x: 'max-content' }}
      />
    </Modal>
  );
};

export default UpcomingExpiryModal;
