/**
 * 催收绩效报表页面
 * 展示催收绩效统计卡片和催收人员排名表
 */
import React, { useState, useEffect } from 'react';
import { Spin, message } from 'antd';
import type { PerformanceStatsResponse } from '@/types/accounts-receivable';
import { getPerformanceStats } from '@/services/api/accounts-receivable';
import PerformanceCards from './components/PerformanceCards';
import CollectorRanking from './components/CollectorRanking';
import styles from './index.less';

const Performance: React.FC = () => {
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<PerformanceStatsResponse | null>(null);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const result = await getPerformanceStats();
      setData(result);
    } catch (error) {
      message.error('数据加载失败');
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
    <div className={styles.performance}>
      {/* 页面头部 */}
      <div className={styles.pageHeader}>
        <h3>催收绩效报表</h3>
      </div>

      {/* 绩效统计卡片 */}
      {data && (
        <PerformanceCards
          totalTasks={data.totalTasks}
          completedTasks={data.completedTasks}
          avgCollectionHours={data.avgCollectionHours}
          successRate={data.successRate}
        />
      )}

      {/* 催收人员排名表 */}
      {data && <CollectorRanking collectors={data.collectors || []} />}
    </div>
  );
};

export default Performance;
