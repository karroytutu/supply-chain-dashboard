/**
 * 诉讼进度明细弹窗
 * 每个诉讼卡片（催收函/已起诉/诉讼中/已判决）独立打开弹窗
 * 弹窗内不设 Tab，直接显示对应类别的明细
 */

import React from 'react';
import { Modal, Table, Tag } from 'antd';
import { LinkOutlined } from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import useMobileDetect from '@/hooks/useMobileDetect';
import styles from './index.less';

interface LegalProgressModalProps {
  visible: boolean;
  onClose: () => void;
  category: string;
  data: LegalProgressDetail[];
  loading?: boolean;
  error?: string | null;
}

/** 类别名称映射 */
const CATEGORY_LABEL: Record<string, string> = {
  noticeSent: '催收函',
  lawsuitFiled: '已起诉',
  lawsuitInProgress: '诉讼中',
  lawsuitCompleted: '已判决',
};

/** OA 状态 Tag */
const StatusTag: React.FC<{ status: string }> = ({ status }) => {
  const map: Record<string, { color: string; text: string }> = {
    approved: { color: 'green', text: '已通过' },
    pending: { color: 'blue', text: '审批中' },
    rejected: { color: 'red', text: '已拒绝' },
    processing: { color: 'orange', text: '处理中' },
  };
  const cfg = map[status] || { color: 'default', text: status };
  return <Tag color={cfg.color}>{cfg.text}</Tag>;
};

const LegalProgressModal: React.FC<LegalProgressModalProps> = ({
  visible,
  onClose,
  category,
  data,
  loading,
  error,
}) => {
  const isMobile = useMobileDetect();
  const categoryLabel = CATEGORY_LABEL[category] || category;
  const title = `${categoryLabel}明细`;

  const columns: ColumnsType<LegalProgressDetail> = [
    {
      title: 'OA单号',
      dataIndex: 'instanceNo',
      width: 155,
      ellipsis: true,
      render: (_: unknown, record) => (
        <a
          onClick={() => window.open(`/oa/detail/${record.instanceId}`, '_blank')}
          style={{ color: '#1890ff' }}
        >
          <LinkOutlined /> {record.instanceNo}
        </a>
      ),
    },
    { title: '客户名称', dataIndex: 'consumerName', width: 120, ellipsis: true },
    {
      title: '涉及金额',
      dataIndex: 'totalAmount',
      width: 115,
      align: 'right',
      sorter: (a, b) => a.totalAmount - b.totalAmount,
      render: (v: number) => (
        <span style={{ fontWeight: 500, whiteSpace: 'nowrap' }}>¥{v.toLocaleString()}</span>
      ),
    },
    {
      title: '状态',
      dataIndex: 'status',
      width: 85,
      render: (status: string) => <StatusTag status={status} />,
    },
    { title: '当前处理人', dataIndex: 'currentApprover', width: 120, ellipsis: true },
    { title: '提交时间', dataIndex: 'submittedAt', width: 105, ellipsis: true },
  ];

  return (
    <Modal
      title={title}
      open={visible}
      onCancel={onClose}
      footer={null}
      width={isMobile ? '100vw' : 820}
      className={isMobile ? styles.mobileModal : ''}
      destroyOnClose
    >
      {error && (
        <div style={{ color: '#f5222d', marginBottom: 8 }}>加载失败: {error}</div>
      )}

      {/* 桌面端：表格 */}
      {!isMobile && (
        <Table<LegalProgressDetail>
          rowKey="instanceNo"
          columns={columns}
          dataSource={data}
          loading={loading}
          pagination={false}
          size="small"
          scroll={{ x: 'max-content' }}
        />
      )}

      {/* 移动端：卡片流 */}
      {isMobile && (
        <div className={styles.cardList}>
          {loading && (
            <div style={{ textAlign: 'center', padding: 24, color: 'rgba(0,0,0,0.25)' }}>
              加载中...
            </div>
          )}
          {!loading &&
            data.map((row) => (
              <div key={row.instanceNo} className={styles.cardItem}>
                <div className={styles.cardHeader}>
                  <a
                    onClick={() => window.open(`/oa/detail/${row.instanceId}`, '_blank')}
                    style={{ color: '#1890ff', fontWeight: 500, fontSize: 13 }}
                  >
                    <LinkOutlined /> {row.instanceNo}
                  </a>
                  <StatusTag status={row.status} />
                </div>
                <div className={styles.cardBody}>
                  <span>{row.consumerName}</span>
                  <span style={{ fontWeight: 600, color: '#f5222d' }}>
                    ¥{row.totalAmount.toLocaleString()}
                  </span>
                </div>
                <div className={styles.cardFooter}>
                  <span style={{ color: 'rgba(0,0,0,0.45)' }}>{row.currentApprover}</span>
                  <span style={{ color: 'rgba(0,0,0,0.45)', fontSize: 11 }}>{row.submittedAt}</span>
                </div>
              </div>
            ))}
          {!loading && data.length === 0 && (
            <div style={{ textAlign: 'center', color: 'rgba(0,0,0,0.25)', padding: 24 }}>
              暂无数据
            </div>
          )}
        </div>
      )}
    </Modal>
  );
};

export default LegalProgressModal;
