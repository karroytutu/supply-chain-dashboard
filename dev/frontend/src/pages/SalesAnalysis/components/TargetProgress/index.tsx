/**
 * 目标进展板块
 * 展示时间进度、总体完成率、营销师排名，支持下钻到客户
 */
import React, { useState } from 'react';
import { Progress, Tag } from 'antd';
import { DownOutlined, RightOutlined } from '@ant-design/icons';
import { TARGET_PROGRESS_DATA } from '@/constants/salesAnalysis';
import { formatCompactAmount } from '@/utils/format';
import styles from './index.less';

const TargetProgress: React.FC = () => {
  const data = TARGET_PROGRESS_DATA;
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());

  const toggleExpand = (id: string) => {
    setExpandedRows((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  return (
    <section className={styles.section}>
      <div className={styles.sectionHeader}>
        <h2 className={styles.sectionTitle}>目标进展</h2>
        <span className={styles.monthLabel}>{data.monthLabel}</span>
      </div>

      {/* 时间进度 */}
      <div className={styles.timeProgress}>
        <span className={styles.timeLabel}>时间进度</span>
        <Progress
          percent={data.timeProgress}
          strokeColor="#1890ff"
          style={{ flex: 1 }}
          format={(pct) => `${pct?.toFixed(1)}% (${data.timeProgressDays}/${data.totalDays}天)`}
        />
      </div>

      {/* 总体完成率 */}
      <div className={styles.overviewCards}>
        <div className={styles.overviewCard}>
          <span className={styles.overviewLabel}>目标额</span>
          <span className={styles.overviewValue}>{formatCompactAmount(data.totalTargetAmount)}</span>
        </div>
        <div className={styles.overviewCard}>
          <span className={styles.overviewLabel}>已完成</span>
          <span className={styles.overviewValue}>{formatCompactAmount(data.totalActualAmount)}</span>
        </div>
        <div className={styles.overviewCard}>
          <span className={styles.overviewLabel}>完成率</span>
          <span className={styles.overviewValue}>
            {data.completionRate.toFixed(1)}%
            <Tag color={data.isOnTrack ? 'green' : 'red'} style={{ marginLeft: 8 }}>
              {data.isOnTrack ? '达标' : '滞后'}
            </Tag>
          </span>
        </div>
      </div>

      {/* 营销师排名表格 */}
      <div className={styles.rankTable}>
        <div className={styles.rankHeader}>
          <span className={styles.rankColName}>营销师</span>
          <span className={styles.rankCol}>目标额</span>
          <span className={styles.rankCol}>已完成</span>
          <span className={styles.rankCol}>完成率</span>
          <span className={styles.rankCol}>进度对比</span>
        </div>
        {data.marketers
          .sort((a, b) => b.completionRate - a.completionRate)
          .map((marketer) => (
            <React.Fragment key={marketer.marketerId}>
              <div
                className={`${styles.rankRow} ${!marketer.isOnTrack ? styles.rankRowWarning : ''}`}
                onClick={() => toggleExpand(marketer.marketerId)}
              >
                <span className={styles.rankColName}>
                  {expandedRows.has(marketer.marketerId) ? <DownOutlined className={styles.expandIcon} /> : <RightOutlined className={styles.expandIcon} />}
                  {marketer.marketerName}
                </span>
                <span className={styles.rankCol}>{formatCompactAmount(marketer.targetAmount)}</span>
                <span className={styles.rankCol}>{formatCompactAmount(marketer.actualAmount)}</span>
                <span className={styles.rankCol}>
                  <Progress
                    percent={marketer.completionRate}
                    size="small"
                    style={{ width: 100 }}
                    strokeColor={marketer.isOnTrack ? '#52c41a' : '#fa8c16'}
                  />
                </span>
                <span className={styles.rankCol}>
                  <Tag color={marketer.isOnTrack ? 'green' : 'red'}>
                    {marketer.isOnTrack ? '达标' : '滞后'}
                  </Tag>
                </span>
              </div>

              {/* 展开客户明细 */}
              {expandedRows.has(marketer.marketerId) && marketer.customers.map((customer) => (
                <div
                  key={customer.customerId}
                  className={`${styles.customerRow} ${!customer.isOnTrack ? styles.customerRowWarning : ''}`}
                >
                  <span className={styles.rankColName}>
                    <span className={styles.indent} />
                    {customer.customerName}
                  </span>
                  <span className={styles.rankCol}>{formatCompactAmount(customer.targetAmount)}</span>
                  <span className={styles.rankCol}>{formatCompactAmount(customer.actualAmount)}</span>
                  <span className={styles.rankCol}>
                    <Progress
                      percent={customer.completionRate}
                      size="small"
                      style={{ width: 80 }}
                      strokeColor={customer.isOnTrack ? '#52c41a' : '#fa8c16'}
                    />
                  </span>
                  <span className={styles.rankCol}>
                    <Tag color={customer.isOnTrack ? 'green' : 'red'}>
                      {customer.isOnTrack ? '达标' : '滞后'}
                    </Tag>
                  </span>
                </div>
              ))}
            </React.Fragment>
          ))}
      </div>
    </section>
  );
};

export default TargetProgress;
