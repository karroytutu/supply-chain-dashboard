/**
 * 已处理记录列表组件
 * 展示催收和审核的历史记录
 */
import React, { useState, useEffect, useCallback } from 'react';
import { Table, Tag, Spin, Empty, Pagination } from 'antd';
import type { ArCollectionTask } from '@/types/accounts-receivable';
import { getHistoryRecords } from '@/services/api/accounts-receivable';
import styles from './HistoryList.less';

interface HistoryListProps {
  onViewDetail: (arId: number) => void;
}

const HistoryList: React.FC<HistoryListProps> = ({ onViewDetail }) => {
  const [loading, setLoading] = useState(false);
  const [records, setRecords] = useState<ArCollectionTask[]>([]);
  const [pagination, setPagination] = useState({
    current: 1,
    pageSize: 10,
    total: 0,
  });

  // 加载历史记录
  const loadRecords = useCallback(async (page = 1, pageSize = 10) => {
    setLoading(true);
    try {
      const result = await getHistoryRecords({ page, pageSize });
      setRecords(result.list);
      setPagination({
        current: page,
        pageSize,
        total: result.total,
      });
    } catch (error) {
      console.error('加载历史记录失败:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadRecords();
  }, [loadRecords]);

  // 处理分页变化
  const handlePageChange = (page: number, pageSize?: number) => {
    loadRecords(page, pageSize || pagination.pageSize);
  };

  // 格式化金额
  const formatAmount = (amount?: number): string => {
    if (amount === undefined) return '¥0.00';
    return `¥${amount.toFixed(2)}`;
  };

  // 格式化日期
  const formatDate = (dateStr?: string): string => {
    if (!dateStr) return '-';
    const date = new Date(dateStr);
    return date.toLocaleString('zh-CN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  // 获取状态标签
  const getStatusTag = (record: ArCollectionTask) => {
    if (record.review_status === 'approved') {
      return <Tag color="green">已通过</Tag>;
    }
    if (record.review_status === 'rejected') {
      return <Tag color="red">已拒绝</Tag>;
    }
    if (record.status === 'completed') {
      return <Tag color="blue">已完成</Tag>;
    }
    if (record.status === 'escalated') {
      return <Tag color="orange">已升级</Tag>;
    }
    return <Tag>{record.status}</Tag>;
  };

  // 获取结果类型标签
  const getResultTypeTag = (resultType?: string) => {
    const typeMap: Record<string, { text: string; color: string }> = {
      'customer_delay': { text: '客户延期', color: 'cyan' },
      'guarantee_delay': { text: '担保延期', color: 'purple' },
      'paid_off': { text: '已回款', color: 'green' },
      'escalate': { text: '升级催收', color: 'red' },
    };
    const type = typeMap[resultType || ''];
    if (!type) return '-';
    return <Tag color={type.color}>{type.text}</Tag>;
  };

  // 表格列定义
  const columns = [
    {
      title: '客户名称',
      dataIndex: 'consumer_name',
      key: 'consumer_name',
      render: (text: string, record: ArCollectionTask) => (
        <a onClick={() => onViewDetail(record.ar_id)}>{text}</a>
      ),
    },
    {
      title: '欠款金额',
      dataIndex: 'left_amount',
      key: 'left_amount',
      render: (amount?: number) => formatAmount(amount),
    },
    {
      title: '处理人',
      dataIndex: 'collector_name',
      key: 'collector_name',
    },
    {
      title: '处理结果',
      dataIndex: 'result_type',
      key: 'result_type',
      render: (type?: string) => getResultTypeTag(type),
    },
    {
      title: '审核状态',
      key: 'review_status',
      render: (record: ArCollectionTask) => getStatusTag(record),
    },
    {
      title: '审核人',
      dataIndex: 'reviewer_name',
      key: 'reviewer_name',
      render: (text?: string) => text || '-',
    },
    {
      title: '完成时间',
      dataIndex: 'completed_at',
      key: 'completed_at',
      render: (date?: string) => formatDate(date),
    },
  ];

  return (
    <div className={styles.historyList}>
      <Spin spinning={loading}>
        {records.length > 0 ? (
          <>
            <Table
              columns={columns}
              dataSource={records}
              rowKey="id"
              pagination={false}
              className={styles.table}
              scroll={{ x: 'max-content' }}
            />
            <div className={styles.pagination}>
              <Pagination
                current={pagination.current}
                pageSize={pagination.pageSize}
                total={pagination.total}
                onChange={handlePageChange}
                showSizeChanger
                showTotal={(total) => `共 ${total} 条记录`}
              />
            </div>
          </>
        ) : (
          <Empty description="暂无历史记录" className={styles.empty} />
        )}
      </Spin>
    </div>
  );
};

export default HistoryList;
