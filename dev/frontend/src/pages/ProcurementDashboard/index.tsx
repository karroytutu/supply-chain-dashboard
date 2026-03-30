import React, { useState, useEffect, useCallback } from 'react';
import { Row, Col, Spin, Button } from 'antd';
import {
  InboxOutlined,
  SyncOutlined,
  AlertOutlined,
  BarChartOutlined,
  HistoryOutlined,
} from '@ant-design/icons';
import type { DashboardOverview } from '@/types/dashboard';
import { getDashboardData } from '@/services/api/dashboard';
import { dataCache, CACHE_KEYS, CACHE_TTL } from '@/utils/dataCache';
import SummaryCard from '@/components/SummaryCard';
import WarningPanel from '@/components/WarningPanel';
import MonthlyArchiveModal from '@/components/MonthlyArchiveModal';
import CategoryAvailabilityCard from './components/CategoryAvailabilityCard';
import styles from './index.less';

const Dashboard: React.FC = () => {
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<DashboardOverview | null>(null);
  const [archiveModalVisible, setArchiveModalVisible] = useState(false);

  const loadData = useCallback(async () => {
    console.log('[Dashboard] 开始加载数据...');
    setLoading(true);
    try {
      // 使用缓存获取数据
      const result = await dataCache.getOrFetch<DashboardOverview>(
        CACHE_KEYS.DASHBOARD_DATA,
        getDashboardData,
        CACHE_TTL.DASHBOARD
      );
      console.log('[Dashboard] 数据加载成功:', result);
      setData(result);
    } catch (error) {
      console.error('[Dashboard] 数据加载失败:', error);
    } finally {
      setLoading(false);
      console.log('[Dashboard] 加载完成，loading=false');
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  console.log('[Dashboard] 渲染状态 - loading:', loading, 'data:', !!data);

  if (loading) {
    console.log('[Dashboard] 显示加载中...');
    return (
      <div className={styles.loadingContainer}>
        <Spin size="large" tip="加载中..." />
      </div>
    );
  }

  if (!data) {
    console.log('[Dashboard] 无数据，显示错误');
    return (
      <div className={styles.errorContainer}>
        数据加载失败，请重试
      </div>
    );
  }

  console.log('[Dashboard] 渲染仪表盘内容');

  return (
    <div className={styles.dashboard}>
      {/* 页面头部 */}
      <div className={styles.header}>
        <div className={styles.titleSection}>
          <h1 className={styles.title}>鑫链云供应链数据管理系统</h1>
          <span className={styles.subtitle}>
            数据周期：{data.period.current}
          </span>
        </div>
        <div className={styles.headerActions}>
          <Button
            type="link"
            icon={<HistoryOutlined />}
            onClick={() => setArchiveModalVisible(true)}
          >
            月度存档
          </Button>
        </div>
      </div>

      {/* 顶部指标概览 */}
      <div className={styles.metricsOverview}>
        <Row gutter={[16, 16]}>
          <Col xs={12} sm={12} md={6}>
            <SummaryCard
              title="战略商品齐全率"
              icon={<InboxOutlined />}
              value={data.availability.value}
              unit="%"
              metricType="availability"
              totalSku={data.availability.strategicMonthlyAvailability?.totalStrategicSku}
              monthlyValue={data.availability.strategicMonthlyAvailability?.value}
              currentValue={data.availability.strategicAvailability?.value}
              monthlyData={data.availability.strategicMonthlyAvailability}
            />
          </Col>
          <Col xs={12} sm={12} md={6}>
            <SummaryCard
              title="库存周转天数"
              icon={<SyncOutlined />}
              value={data.turnover.value}
              unit="天"
              metricType="turnover"
              previousValue={data.turnover.previousValue}
              period={data.turnover.period}
              trend={data.turnover.trend}
              trendDirection={data.turnover.trendDirection}
              isInverseMetric={true}
            />
          </Col>
          <Col xs={12} sm={12} md={6}>
            <SummaryCard
              title="临期商品金额"
              icon={<AlertOutlined />}
              value={data.expiring.expiringCost}
              unit="元"
              metricType="expiring"
              auxiliaryData={{
                label: '占比',
                value: data.expiring.value,
                unit: '%',
              }}
            />
          </Col>
          <Col xs={12} sm={12} md={6}>
            <SummaryCard
              title="滞销商品金额"
              icon={<BarChartOutlined />}
              value={data.slowMoving.slowMovingCost}
              unit="元"
              metricType="slowMoving"
              auxiliaryData={{
                label: '占比',
                value: data.slowMoving.value,
                unit: '%',
              }}
            />
          </Col>
        </Row>
      </div>

      {/* 品类库存齐全率分析 */}
      <CategoryAvailabilityCard />

      {/* 预警面板 */}
      <div className={styles.warningSection}>
        <WarningPanel
          stockWarnings={data.availability.warningStats}
          turnoverWarnings={data.turnover.warningStats}
          expiringWarnings={{
            within7Days: data.expiring.within7Days,
            within15Days: data.expiring.within15Days,
            within30Days: data.expiring.within30Days,
          }}
          slowMovingWarnings={data.slowMoving.warningStats}
        />
      </div>

      {/* 月度存档弹窗 */}
      <MonthlyArchiveModal
        open={archiveModalVisible}
        onClose={() => setArchiveModalVisible(false)}
      />
    </div>
  );
};

export default Dashboard;
