/**
 * 管道节点即将逾期明细弹窗
 * 展示某个催收阶段中即将逾期的欠款明细
 */

import React from 'react';
import { Modal, Table, Tag, Alert } from 'antd';
import type { ColumnsType } from 'antd/es/table';

interface PipelineExpiryModalProps {
  visible: boolean;
  onClose: () => void;
  nodeLabel: string;
  data: PipelineExpiryDetail[];
  loading?: boolean;
  error?: string | null;
}

const columns: ColumnsType<PipelineExpiryDetail> = [
  {
    title: '单据编号',
    dataIndex: 'billNo',
    width: 140,
  },
  {
    title: '客户名称',
    dataIndex: 'consumerName',
    width: 120,
  },
  {
    title: '未收金额',
    dataIndex: 'leftAmount',
    width: 110,
    align: 'right',
    sorter: (a, b) => a.leftAmount - b.leftAmount,
    render: (v: number) => `¥${v.toLocaleString()}`,
  },
  {
    title: '到期日',
    dataIndex: 'expireTime',
    width: 110,
  },
  {
    title: '剩余天数',
    dataIndex: 'daysToExpire',
    width: 90,
    align: 'center',
    sorter: (a, b) => a.daysToExpire - b.daysToExpire,
    render: (v: number) => (
      <Tag color={v === 0 ? 'red' : v <= 2 ? 'orange' : 'gold'}>
        {v === 0 ? '今日' : `${v}天`}
      </Tag>
    ),
  },
  {
    title: '营销师',
    dataIndex: 'managerUserName',
    width: 90,
  },
];

const PipelineExpiryModal: React.FC<PipelineExpiryModalProps> = ({
  visible,
  onClose,
  nodeLabel,
  data,
  loading,
  error,
}) => {
  return (
    <Modal
      title={`即将逾期明细 — ${nodeLabel}`}
      open={visible}
      onCancel={onClose}
      footer={null}
      width={720}
      destroyOnClose
    >
      {error && <Alert message="加载失败" description={error} type="error" showIcon style={{ marginBottom: 12 }} />}
      <Table<PipelineExpiryDetail>
        rowKey="billNo"
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

export default PipelineExpiryModal;
