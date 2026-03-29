/**
 * 应收账款总览页面
 * 展示应收统计概览、账龄分析、催收进度、趋势图和客户欠款分析表
 */
import React, { useState, useEffect } from 'react';
import { Spin, message, Button } from 'antd';
import { SyncOutlined } from '@ant-design/icons';
import type { ArStats, AgingAnalysis } from '@/types/accounts-receivable';
import { getArStats, getAgingAnalysis, syncArData } from '@/services/api/accounts-receivable';
import ArOverviewCards from './components/ArOverviewCards';
import AgingChart from './components/AgingChart';
import TrendChart from './components/TrendChart';
import CollectionProgress from './components/CollectionProgress';
import CustomerDebtTable from './components/CustomerDebtTable';
import styles from './index.less';

const Overview: React.FC = () => {
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [stats, setStats] = useState<ArStats | null>(null);
  const [agingData, setAgingData] = useState<AgingAnalysis[]>([]);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const [statsResult, agingResult] = await Promise.all([
        getArStats(),
        getAgingAnalysis(),
      ]);
      setStats(statsResult);
      setAgingData(agingResult);
    } catch (error) {
      message.error('数据加载失败');
    } finally {
      setLoading(false);
    }
  };

  /**
   * 手动同步ERP数据
   */
  const handleSync = async () => {
    setSyncing(true);
    try {
      await syncArData();
      message.success('ERP数据同步完成');
      loadData(); // 刷新页面数据
    } catch (error) {
      message.error('同步失败，请稍后重试');
    } finally {
      setSyncing(false);
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
    <div className={styles.overview}>
      {/* 页面头部 */}
      <div className={styles.pageHeader}>
        <h3>应收总览</h3>
        <Button
          type="primary"
          ghost
          icon={<SyncOutlined spin={syncing} />}
          loading={syncing}
          onClick={handleSync}
        >
          同步ERP数据
        </Button>
      </div>

      {/* 概览卡片 */}
      {stats && <ArOverviewCards stats={stats} />}

      {/* 图表区域 */}
      <div className={styles.chartsRow}>
        <div className={styles.chartHalf}>
          <AgingChart data={agingData} />
        </div>
        <div className={styles.chartHalf}>
          <CollectionProgress />
        </div>
      </div>

      {/* 趋势图 */}
      <TrendChart />

      {/* 客户欠款分析表 */}
      <CustomerDebtTable />
    </div>
  );
};

export default Overview;
