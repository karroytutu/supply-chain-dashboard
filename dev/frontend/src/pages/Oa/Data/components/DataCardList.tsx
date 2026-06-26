import React from 'react';
import { Tag, Button, Pagination, Spin, Empty } from 'antd';
import { history } from 'umi';
import type { ApprovalInstance } from '@/types/oa';
import { formatDateTime } from '@/utils/format';
import styles from '../index.less';

const statusMap: Record<string, { color: string; text: string }> = {
  pending: { color: 'processing', text: '处理中' },
  approved: { color: 'success', text: '已通过' },
  rejected: { color: 'error', text: '已拒绝' },
  withdrawn: { color: 'default', text: '已撤回' },
  cancelled: { color: 'warning', text: '已取消' },
};

interface DataCardListProps {
  dataSource: ApprovalInstance[];
  loading: boolean;
  pagination: { current: number; pageSize: number; total: number };
  onPaginationChange: (page: number, pageSize: number) => void;
}

const DataCardList: React.FC<DataCardListProps> = ({
  dataSource, loading, pagination, onPaginationChange,
}) => {
  if (loading) {
    return (
      <div className={styles.cardListLoading}>
        <Spin size="large" />
      </div>
    );
  }

  if (dataSource.length === 0) {
    return <Empty description="暂无数据" />;
  }

  return (
    <div className={styles.cardList}>
      {dataSource.map((record) => {
        const statusConfig = statusMap[record.status] || { color: 'default', text: record.status };
        return (
          <div key={record.id} className={styles.card} data-status={record.status}>
            <div className={styles.cardHeader}>
              <a
                className={styles.cardNo}
                onClick={() => history.push(`/oa/detail/${record.id}`)}
              >
                {record.instanceNo}
              </a>
              <Tag color={statusConfig.color}>{statusConfig.text}</Tag>
            </div>
            <div className={styles.cardBody}>
              <div className={styles.cardField}>
                <div className={styles.cardFieldLabel}>申请类型</div>
                <div className={styles.cardFieldValue}>{record.formTypeName}</div>
              </div>
              <div className={styles.cardField}>
                <div className={styles.cardFieldLabel}>申请人</div>
                <div className={styles.cardFieldValue}>{record.applicantName}</div>
              </div>
              <div className={styles.cardField}>
                <div className={styles.cardFieldLabel}>申请时间</div>
                <div className={styles.cardFieldValue}>
                  {formatDateTime(record.submittedAt, 'MM-DD HH:mm')}
                </div>
              </div>
              <div className={styles.cardField}>
                <div className={styles.cardFieldLabel}>当前处理人</div>
                <div className={styles.cardFieldValue}>
                  {record.currentApproverName || '-'}
                </div>
              </div>
              <div className={styles.cardField}>
                <div className={styles.cardFieldLabel}>完成时间</div>
                <div className={styles.cardFieldValue}>
                  {record.completedAt ? formatDateTime(record.completedAt, 'MM-DD HH:mm') : '-'}
                </div>
              </div>
            </div>
            <div className={styles.cardFooter}>
              <Button
                type="link"
                size="small"
                onClick={() => history.push(`/oa/detail/${record.id}`)}
              >
                查看详情
              </Button>
            </div>
          </div>
        );
      })}

      <div className={styles.cardPagination}>
        <Pagination
          current={pagination.current}
          pageSize={pagination.pageSize}
          total={pagination.total}
          showTotal={(total) => `共 ${total} 条`}
          onChange={onPaginationChange}
          size="small"
          simple
        />
      </div>
    </div>
  );
};

export default DataCardList;
