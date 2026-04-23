/**
 * 客户详情面板
 * 弹窗右侧：展示选中客户的详细分析
 */

import React from 'react';
import { Tag, Empty } from 'antd';
import type { DrilldownCustomer, DrilldownCustomerDetail } from '@/types/sales-analysis';
import styles from './CustomerDetailPanel.less';

const CURRENT_USER = '张晨';

interface CustomerDetailPanelProps {
  customer: DrilldownCustomer | null;
}

const CustomerDetailPanel: React.FC<CustomerDetailPanelProps> = ({ customer }) => {
  if (!customer) {
    return <Empty description="暂无客户详情可展示" className={styles.empty} />;
  }

  const isMine = customer.owner === CURRENT_USER;

  return (
    <div className={styles.panel}>
      <DetailTop customer={customer} isMine={isMine} />
      <MetricsSummary metrics={customer.detail.metrics} />
      <ReasonAndActions detail={customer.detail} />
      <TrendAndPayment detail={customer.detail} />
      <FollowupSection followups={customer.detail.followups} />
      <CoverageSection coverage={customer.detail.coverage} />
    </div>
  );
};

/** 标题区 */
const DetailTop: React.FC<{ customer: DrilldownCustomer; isMine: boolean }> = ({
  customer, isMine,
}) => (
  <div className={styles.top}>
    <div className={styles.titleRow}>
      <h4 className={styles.title}>{customer.name}</h4>
      <div className={styles.tags}>
        {isMine && <Tag color="purple">我的客户</Tag>}
        {customer.tags.map((tag) => (
          <Tag key={tag.text} color={tag.color}>{tag.text}</Tag>
        ))}
      </div>
    </div>
    <div className={styles.ownerLine}>
      负责人：{customer.owner}{isMine ? ' | 当前为我的客户' : ''}
    </div>
    <p className={styles.subtitle}>{customer.detail.subtitle}</p>
  </div>
);

/** 指标摘要 */
const MetricsSummary: React.FC<{ metrics: DrilldownCustomerDetail['metrics'] }> = ({ metrics }) => (
  <div className={styles.summary}>
    {metrics.map((metric, idx) => (
      <div key={idx} className={styles.stat}>
        <div className={styles.statLabel}>{metric.label}</div>
        <div className={styles.statValue}>{metric.value}</div>
      </div>
    ))}
  </div>
);

/** 风险原因 + 建议动作 */
const ReasonAndActions: React.FC<{ detail: DrilldownCustomerDetail }> = ({ detail }) => (
  <div className={styles.detailGrid}>
    <div className={styles.section}>
      <h5 className={styles.blockTitle}>风险原因</h5>
      <div className={styles.chips}>
        {detail.reasons.map((reason, idx) => (
          <span key={idx} className={styles.chip}>{reason}</span>
        ))}
      </div>
    </div>
    <div className={styles.section}>
      <h5 className={styles.blockTitle}>建议动作</h5>
      <div className={styles.chips}>
        {detail.actions.map((action, idx) => (
          <span key={idx} className={styles.actionPill}>{action}</span>
        ))}
      </div>
    </div>
  </div>
);

/** 趋势 + 回款 */
const TrendAndPayment: React.FC<{ detail: DrilldownCustomerDetail }> = ({ detail }) => (
  <div className={styles.detailGrid}>
    <TrendSection trend={detail.trend} />
    <div className={styles.section}>
      <h5 className={styles.blockTitle}>回款状态</h5>
      <p className={styles.text}>{detail.payment}</p>
    </div>
  </div>
);

/** 趋势条形图 */
const TrendSection: React.FC<{ trend: number[] }> = ({ trend }) => {
  const maxVal = Math.max(...trend, 1);
  return (
    <div className={styles.section}>
      <h5 className={styles.blockTitle}>变化趋势</h5>
      <div className={styles.trendBars}>
        {trend.map((val, idx) => (
          <span key={idx} className={styles.trendBar} style={{ height: `${(val / maxVal) * 100}%` }} />
        ))}
      </div>
    </div>
  );
};

/** 跟进记录 */
const FollowupSection: React.FC<{ followups: string[] }> = ({ followups }) => (
  <div className={styles.section}>
    <h5 className={styles.blockTitle}>跟进记录</h5>
    <div className={styles.timeline}>
      {followups.map((item, idx) => (
        <div key={idx} className={styles.timelineItem}>{item}</div>
      ))}
    </div>
  </div>
);

/** 品类覆盖 */
const CoverageSection: React.FC<{ coverage: DrilldownCustomerDetail['coverage'] }> = ({ coverage }) => (
  <div className={styles.section}>
    <h5 className={styles.blockTitle}>品类覆盖</h5>
    <div className={styles.coverageList}>
      {coverage.map((item) => (
        <div key={item.label} className={styles.coverageRow}>
          <span>{item.label}</span>
          <div className={styles.coverageTrack}>
            <span style={{ width: `${item.value}%` }} />
          </div>
          <strong>{item.value}%</strong>
        </div>
      ))}
    </div>
  </div>
);

export default CustomerDetailPanel;
