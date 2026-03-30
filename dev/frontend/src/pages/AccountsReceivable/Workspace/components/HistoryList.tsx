/**
 * 已处理记录列表组件
 * 展示催收和审核的历史记录
 * 桌面端：表格布局
 * 移动端：卡片视图 + 无限滚动
 */
import React, { useState, useEffect, useCallback, useRef, useContext } from 'react';
import { Table, Tag, Spin, Empty, Pagination } from 'antd';
import type { ArCollectionTask } from '@/types/accounts-receivable';
import { getHistoryRecords } from '@/services/api/accounts-receivable';
import { WorkspaceContext } from '../index';
import styles from './HistoryList.less';

interface HistoryListProps {
  onViewDetail: (arId: number) => void;
}

const HistoryList: React.FC<HistoryListProps> = ({ onViewDetail }) => {
  const { isMobile } = useContext(WorkspaceContext);
  const [loading, setLoading] = useState(false);
  const [records, setRecords] = useState<ArCollectionTask[]>([]);
  const [pagination, setPagination] = useState({
    current: 1,
    pageSize: 10,
    total: 0,
  });

  // 无限滚动相关状态
  const [hasMore, setHasMore] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const loadMoreRef = useRef<HTMLDivElement>(null);

  // 加载历史记录
  const loadRecords = useCallback(async (page = 1, pageSize = 10, append = false) => {
    if (append) {
      setLoadingMore(true);
    } else {
      setLoading(true);
    }

    try {
      const result = await getHistoryRecords({ page, pageSize });
      const newList = result.list || [];

      if (append) {
        setRecords(prev => [...prev, ...newList]);
      } else {
        setRecords(newList);
      }

      setPagination({
        current: page,
        pageSize,
        total: result.total,
      });

      setHasMore(newList.length === pageSize && (page * pageSize) < result.total);
    } catch (error) {
      console.error('加载历史记录失败:', error);
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, []);

  // 加载更多
  const handleLoadMore = useCallback(() => {
    if (!hasMore || loadingMore) return;
    const nextPage = pagination.current + 1;
    loadRecords(nextPage, pagination.pageSize, true);
  }, [hasMore, loadingMore, pagination.current, pagination.pageSize, loadRecords]);

  // 无限滚动检测
  useEffect(() => {
    if (!isMobile || !loadMoreRef.current) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasMore && !loadingMore) {
          handleLoadMore();
        }
      },
      { threshold: 0.1 }
    );

    observer.observe(loadMoreRef.current);
    return () => observer.disconnect();
  }, [isMobile, hasMore, loadingMore, handleLoadMore]);

  useEffect(() => {
    loadRecords();
  }, []);

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
      return <Tag color="green">已通过 ✓</Tag>;
    }
    if (record.review_status === 'rejected') {
      return <Tag color="red">已拒绝 ✗</Tag>;
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

  // 渲染移动端卡片
  const renderMobileCard = (record: ArCollectionTask) => {
    const isApproved = record.review_status === 'approved';
    const isRejected = record.review_status === 'rejected';

    return (
      <div
        key={record.id}
        className={`${styles.mobileCard} ${isRejected ? styles.mobileCardRejected : ''}`}
        onClick={() => onViewDetail(record.ar_id)}
      >
        <div className={styles.mobileCardHeader}>
          <div className={styles.mobileCardTitle}>{record.consumer_name}</div>
          {getStatusTag(record)}
        </div>

        <div className={styles.mobileCardInfo}>
          <div className={styles.mobileInfoItem}>
            <span className={styles.mobileInfoLabel}>处理金额</span>
            <span className={styles.mobileInfoValueAmount}>{formatAmount(record.left_amount)}</span>
          </div>
          <div className={styles.mobileInfoItem}>
            <span className={styles.mobileInfoLabel}>处理结果</span>
            <span className={styles.mobileInfoValue}>{getResultTypeTag(record.result_type)}</span>
          </div>
        </div>

        <div className={styles.mobileCardFooter}>
          <span className={styles.footerInfo}>
            处理人: {record.collector_name || '-'}
            {record.reviewer_name && ` | 审核: ${record.reviewer_name}`}
          </span>
        </div>

        <div className={styles.mobileCardTime}>
          {formatDate(record.completed_at)}
          <span className={styles.viewDetail}>详情 →</span>
        </div>
      </div>
    );
  };

  // 渲染移动端视图
  if (isMobile) {
    return (
      <div className={styles.historyList}>
        <div className={styles.mobileContainer}>
          <Spin spinning={loading && records.length === 0}>
            {records.length > 0 ? (
              <>
                {records.map(renderMobileCard)}
                <div ref={loadMoreRef} className={styles.loadMoreTrigger}>
                  {loadingMore && <Spin size="small" />}
                  {!hasMore && records.length > 0 && (
                    <span className={styles.noMore}>已加载全部 {pagination.total} 条记录</span>
                  )}
                </div>
              </>
            ) : (
              !loading && <Empty description="暂无历史记录" className={styles.empty} />
            )}
          </Spin>
        </div>
      </div>
    );
  }

  // 渲染桌面端表格视图
  return (
    <div className={styles.historyList}>
      <div className={styles.table}>
        <Spin spinning={loading}>
          {records.length > 0 ? (
            <>
              <Table
                columns={columns}
                dataSource={records}
                rowKey="id"
                pagination={false}
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
    </div>
  );
};

export default HistoryList;
