/**
 * 时效统计卡片组件
 * 展示平均总耗时、按时完成率、超时任务数
 */
import React from 'react';
import { Row, Col, Card } from 'antd';
import { ClockCircleOutlined, CheckCircleOutlined, WarningOutlined } from '@ant-design/icons';
import styles from '../index.less';

interface EfficiencyStatsCardsProps {
  /** 平均总耗时（小时） */
  avgTotalHours: number;
  /** 按时完成率（百分比） */
  onTimeRate: number;
  /** 超时任务数 */
  timeoutCount: number;
}

const EfficiencyStatsCards: React.FC<EfficiencyStatsCardsProps> = ({
  avgTotalHours,
  onTimeRate,
  timeoutCount,
}) => {
  // 按时完成率颜色：>=80% 绿色，<60% 红色，否则默认
  const getOnTimeRateColor = () => {
    if (onTimeRate >= 80) return 'success';
    if (onTimeRate < 60) return 'danger';
    return '';
  };

  return (
    <div className={styles.statsSection}>
      <Row gutter={[16, 16]}>
        {/* 平均总耗时 */}
        <Col xs={24} sm={8}>
          <Card className={styles.statsCard}>
            <div className={styles.statsCardTitle}>
              <ClockCircleOutlined style={{ marginRight: 4 }} />
              平均总耗时
            </div>
            <div>
              <span className={styles.statsCardValue}>
                {(avgTotalHours ?? 0).toFixed(1)}
              </span>
              <span className={styles.statsCardUnit}>小时</span>
            </div>
          </Card>
        </Col>

        {/* 按时完成率 */}
        <Col xs={24} sm={8}>
          <Card className={styles.statsCard}>
            <div className={styles.statsCardTitle}>
              <CheckCircleOutlined style={{ marginRight: 4 }} />
              节点按时完成率
            </div>
            <div>
              <span className={`${styles.statsCardValue} ${getOnTimeRateColor()}`}>
                {(onTimeRate ?? 0).toFixed(1)}
              </span>
              <span className={styles.statsCardUnit}>%</span>
            </div>
          </Card>
        </Col>

        {/* 超时任务数 */}
        <Col xs={24} sm={8}>
          <Card className={styles.statsCard}>
            <div className={styles.statsCardTitle}>
              <WarningOutlined style={{ marginRight: 4 }} />
              超时任务数
            </div>
            <div>
              <span className={`${styles.statsCardValue} ${timeoutCount > 0 ? 'danger' : 'success'}`}>
                {timeoutCount}
              </span>
              <span className={styles.statsCardUnit}>个</span>
            </div>
          </Card>
        </Col>
      </Row>
    </div>
  );
};

export default EfficiencyStatsCards;
