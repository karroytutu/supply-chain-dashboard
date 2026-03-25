import React from 'react';
import { Tooltip, Tag, Divider } from 'antd';
import { SyncOutlined } from '@ant-design/icons';
import MetricCard from '@/components/MetricCard';
import type { TurnoverData, TurnoverWarningType } from '@/types/dashboard';
import { getHealthStatusConfig } from '@/utils/warning';
import styles from './index.less';

interface TurnoverCardProps {
  data: TurnoverData;
  onDrillDown: () => void;
  onWarningClick?: (warningType: TurnoverWarningType) => void;
  loading?: boolean;
}

const TurnoverCard: React.FC<TurnoverCardProps> = ({
  data,
  onDrillDown,
  onWarningClick,
  loading = false,
}) => {
  const healthConfig = getHealthStatusConfig(data.healthStatus);
  const { warningStats } = data;
  const hasWarning = warningStats.mildOverstock > 0 || warningStats.moderateOverstock > 0 || warningStats.seriousOverstock > 0;

  const getTurnoverColor = (days: number) => {
    if (days <= 15) return '#52c41a';
    if (days <= 30) return '#1890ff';
    if (days <= 60) return '#faad14';
    if (days <= 90) return '#fa541c';
    return '#ff4d4f';
  };

  return (
    <MetricCard
      title="库存周转天数"
      icon={<SyncOutlined />}
      value={data.value}
      unit="天"
      trend={Math.abs(data.trend)}
      trendDirection={data.trendDirection}
      isInverseMetric
      loading={loading}
      onDrillDown={onDrillDown}
      extra={
        <Tag color={healthConfig.color}>{healthConfig.label}</Tag>
      }
    >
      {/* 环比数据展示 */}
      {data.previousValue !== undefined && data.period && (
        <div className={styles.periodSection}>
          <div className={styles.periodRow}>
            <span className={styles.periodLabel}>{data.period.current}月</span>
            <span className={styles.periodValue} style={{ color: getTurnoverColor(data.value) }}>
              {data.value}天
            </span>
          </div>
          <div className={styles.periodRow}>
            <span className={styles.periodLabel}>{data.period.previous}月</span>
            <span className={styles.periodValue} style={{ color: getTurnoverColor(data.previousValue) }}>
              {data.previousValue}天
            </span>
          </div>
          <Divider style={{ margin: '8px 0' }} />
        </div>
      )}

      {/* 库存积压预警提示 */}
      {hasWarning && (
        <div className={styles.warningSection}>
          <div className={styles.warningTitle}>库存积压预警</div>
          <div className={styles.warningItems}>
            {warningStats.mildOverstock > 0 && (
              <Tooltip title="可售天数61-90天，轻度积压，点击查看明细">
                <div
                  className={`${styles.warningItem} ${styles.warning}`}
                  onClick={() => onWarningClick?.('mildOverstock')}
                >
                  <span className={styles.dot} />
                  <span className={styles.label}>轻度积压</span>
                  <span className={styles.count}>{warningStats.mildOverstock}件</span>
                </div>
              </Tooltip>
            )}
            {warningStats.moderateOverstock > 0 && (
              <Tooltip title="可售天数91-120天，中度积压，点击查看明细">
                <div
                  className={`${styles.warningItem} ${styles.attention}`}
                  onClick={() => onWarningClick?.('moderateOverstock')}
                >
                  <span className={styles.dot} />
                  <span className={styles.label}>中度积压</span>
                  <span className={styles.count}>{warningStats.moderateOverstock}件</span>
                </div>
              </Tooltip>
            )}
            {warningStats.seriousOverstock > 0 && (
              <Tooltip title="可售天数>120天，严重积压，点击查看明细">
                <div
                  className={`${styles.warningItem} ${styles.serious}`}
                  onClick={() => onWarningClick?.('seriousOverstock')}
                >
                  <span className={styles.dot} />
                  <span className={styles.label}>严重积压</span>
                  <span className={styles.count}>{warningStats.seriousOverstock}件</span>
                </div>
              </Tooltip>
            )}
          </div>
        </div>
      )}

      {/* 品类周转天数列表 */}
      <div className={styles.categorySection}>
        <div className={styles.sectionTitle}>品类周转天数</div>
        <div className={styles.categoryList}>
          {data.categories.slice(0, 5).map((category) => (
            <div key={category.categoryId} className={styles.categoryItem}>
              <span className={styles.categoryName}>{category.categoryName}</span>
              <div className={styles.daysBar}>
                <div
                  className={styles.daysFill}
                  style={{
                    width: `${Math.min(category.value / 60 * 100, 100)}%`,
                    backgroundColor: getTurnoverColor(category.value),
                  }}
                />
              </div>
              <span className={styles.categoryValue} style={{ color: getTurnoverColor(category.value) }}>
                {category.value}天
              </span>
            </div>
          ))}
        </div>
      </div>
    </MetricCard>
  );
};

export default TurnoverCard;
