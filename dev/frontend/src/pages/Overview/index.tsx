/**
 * 数据总览页面
 * 展示全局指标概览和数据趋势
 */

import React, { useState, useEffect } from 'react';
import { Spin, message, Typography } from 'antd';
import { getOverviewStats, getTrendData } from '@/services/api/overview';
import type { OverviewStats, TrendData } from '@/types/overview';
import StatsCards from './components/StatsCards';
import TrendChartCard from './components/TrendChartCard';
import QuickLinksCard from './components/QuickLinksCard';
import styles from './index.less';

const { Title, Text } = Typography;

const Overview: React.FC = () => {
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState<OverviewStats | null>(null);
  const [trendData, setTrendData] = useState<TrendData | null>(null);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [statsResult, trendResult] = await Promise.all([
        getOverviewStats(),
        getTrendData(7),
      ]);
      setStats(statsResult);
      setTrendData(trendResult);
    } catch (error) {
      console.error('获取数据总览失败:', error);
      message.error('获取数据失败，请稍后重试');
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className={styles.loadingContainer}>
        <Spin size="large" tip="加载中..." />
      </div>
    );
  }

  return (
    <div className={styles.overviewPage}>
      <div className={styles.pageHeader}>
        <Title level={3}>数据总览</Title>
        <Text type="secondary">数据周期：{stats?.period.current}</Text>
      </div>

      <StatsCards stats={stats} />
      <TrendChartCard trendData={trendData} />
      <QuickLinksCard />
    </div>
  );
};

export default Overview;
