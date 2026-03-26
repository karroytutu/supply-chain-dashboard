import React from 'react';
import { Progress, Tooltip } from 'antd';
import { InboxOutlined } from '@ant-design/icons';
import MetricCard from '@/components/MetricCard';
import type { AvailabilityData, StockWarningType } from '@/types/dashboard';
import styles from './index.less';

interface AvailabilityCardProps {
  data: AvailabilityData;
  onDrillDown: () => void;
  onWarningClick?: (warningType: StockWarningType) => void;
  loading?: boolean;
}

const AvailabilityCard: React.FC<AvailabilityCardProps> = ({
  data,
  onDrillDown,
  onWarningClick,
  loading = false,
}) => {
  const getProgressColor = (value: number) => {
    if (value >= 90) return '#52c41a';
    if (value >= 80) return '#1890ff';
    if (value >= 70) return '#faad14';
    return '#ff4d4f';
  };

  const { warningStats } = data;
  const hasWarning = warningStats.outOfStock > 0 || warningStats.lowStock > 0;

  return (
    <MetricCard
      title="战略商品齐全率"
      icon={<InboxOutlined />}
      value={data.value}
      unit="%"
      loading={loading}
      onDrillDown={onDrillDown}
    >
      {/* 库存预警提示 */}
      {hasWarning && (
        <div className={styles.warningSection}>
          <div className={styles.warningTitle}>库存预警</div>
          <div className={styles.warningItems}>
            {warningStats.outOfStock > 0 && (
              <Tooltip title="库存为0，需立即补货，点击查看明细">
                <div
                  className={`${styles.warningItem} ${styles.serious}`}
                  onClick={() => onWarningClick?.('outOfStock')}
                >
                  <span className={styles.dot} />
                  <span className={styles.label}>缺货</span>
                  <span className={styles.count}>{warningStats.outOfStock}件</span>
                </div>
              </Tooltip>
            )}
            {warningStats.lowStock > 0 && (
              <Tooltip title="可售天数≤7天，需尽快补货，点击查看明细">
                <div
                  className={`${styles.warningItem} ${styles.warning}`}
                  onClick={() => onWarningClick?.('lowStock')}
                >
                  <span className={styles.dot} />
                  <span className={styles.label}>低库存</span>
                  <span className={styles.count}>{warningStats.lowStock}件</span>
                </div>
              </Tooltip>
            )}
          </div>
        </div>
      )}

      {/* 品类齐全率列表 */}
      <div className={styles.categorySection}>
        <div className={styles.sectionTitle}>品类齐全率</div>
        <div className={styles.categoryList}>
          {data.categories.slice(0, 5).map((category) => (
            <div key={category.categoryId} className={styles.categoryItem}>
              <span className={styles.categoryName}>{category.categoryName}</span>
              <Progress
                percent={category.value}
                size="small"
                showInfo={false}
                strokeColor={getProgressColor(category.value)}
                trailColor="#f0f0f0"
              />
              <span className={styles.categoryValue}>{category.value}%</span>
            </div>
          ))}
        </div>
      </div>
    </MetricCard>
  );
};

export default AvailabilityCard;
