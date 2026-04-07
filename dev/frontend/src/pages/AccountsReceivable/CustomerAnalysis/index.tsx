/**
 * 客户逾期分析页面
 * 展示客户逾期统计和明细列表
 */
import React, { useState, useEffect } from 'react';
import { Spin, message } from 'antd';
import type { OverdueStatsResponse } from '@/types/accounts-receivable';
import { getOverdueStats } from '@/services/api/accounts-receivable';
import CustomerStatsCards from './components/CustomerStatsCards';
import CustomerOverdueTable from './components/CustomerOverdueTable';
import styles from './index.less';

const CustomerAnalysis: React.FC = () => {
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState<OverdueStatsResponse | null>(null);

  useEffect(() => {
    loadStats();
  }, []);

  // 加载统计数据
  const loadStats = async () => {
    setLoading(true);
    try {
      const result = await getOverdueStats();
      setStats(result);
    } catch (error) {
      message.error('统计数据加载失败');
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
    <div className={styles.customerAnalysis}>
      {/* 页面头部 */}
      <div className={styles.pageHeader}>
        <h3>客户逾期分析</h3>
      </div>

      {/* 统计卡片 */}
      <CustomerStatsCards stats={stats} />

      {/* 客户逾期明细表 */}
      <CustomerOverdueTable />
    </div>
  );
};

export default CustomerAnalysis;
