/**
 * 退货单展开详情面板组件
 */
import React from 'react';
import dayjs from 'dayjs';
import type { ReturnOrder } from '@/types/procurement-return';
import styles from '../index.less';

interface ExpandedDetailProps {
  record: ReturnOrder;
}

const ExpandedDetail: React.FC<ExpandedDetailProps> = ({ record }) => {
  return (
    <div className={styles.expandedDetail}>
      <div className={styles.expandedDetailGrid}>
        <div className={styles.expandedDetailItem}>
          <span className={styles.expandedDetailLabel}>生产日期</span>
          <span className={styles.expandedDetailValue}>
            {record.batchDate ? dayjs(record.batchDate).format('YYYY-MM-DD') : '-'}
          </span>
        </div>
        <div className={styles.expandedDetailItem}>
          <span className={styles.expandedDetailLabel}>退货时间</span>
          <span className={styles.expandedDetailValue}>
            {record.returnDate ? dayjs(record.returnDate).format('YYYY-MM-DD') : '-'}
          </span>
        </div>
        <div className={styles.expandedDetailItem}>
          <span className={styles.expandedDetailLabel}>退货时保质期</span>
          <span className={styles.expandedDetailValue}>
            {record.daysToExpireAtReturn !== null ? `${record.daysToExpireAtReturn}天` : '-'}
          </span>
        </div>
        <div className={styles.expandedDetailItem}>
          <span className={styles.expandedDetailLabel}>责任人</span>
          <span className={styles.expandedDetailValue}>
            {record.marketingManager || '-'}
          </span>
        </div>
      </div>
    </div>
  );
};

export { ExpandedDetail };
export default ExpandedDetail;
