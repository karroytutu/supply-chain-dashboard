/**
 * 应收趋势折线图组件
 * 展示应收总额趋势和逾期金额趋势（按月）
 * 注意：当前为占位实现，后续可接入趋势数据API
 * 优化PC端和移动端响应式布局
 */
import React from 'react';
import { Card } from 'antd';
import styles from '../index.less';

const TrendChart: React.FC = () => {
  return (
    <Card title="应收趋势" className={styles.chartCard} bordered={false} style={{ marginBottom: 16 }}>
      <div className={styles.trendChartContainer}>
        <div className={styles.chartEmpty}>
          <div className={styles.emptyIcon}>📉</div>
          <div className={styles.emptyText}>趋势数据功能开发中</div>
          <div className={styles.emptySubText}>后续将接入应收总额/逾期金额按月趋势数据</div>
        </div>
      </div>
    </Card>
  );
};

export default TrendChart;
