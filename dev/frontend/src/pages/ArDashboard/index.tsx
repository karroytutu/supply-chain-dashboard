/**
 * 应收账款全景看板
 * 数据来自后端 API /api/ar-dashboard/overview
 */

import React, { useState, useCallback, useEffect } from 'react';
import { Alert, Spin, Empty, Typography } from 'antd';
import KpiCard from './components/KpiCard';
import CollectionPipeline from './components/CollectionPipeline';
import MarketerPanel from './components/MarketerPanel';
import ArDetailTable from './components/ArDetailTable';
import UpcomingExpiryModal from './components/UpcomingExpiryModal';
import PipelineExpiryModal from './components/PipelineExpiryModal';
import {
  getArDashboardOverview,
  getUpcomingExpiryCustomers,
  getPipelineExpiryDetails,
} from '@/services/api/ar-dashboard';
import { KPI_COLOR_MAP, NODE_COLOR_MAP } from '@/constants/arDashboard';
import styles from './index.less';

const { Title, Text } = Typography;

const ArDashboard: React.FC = () => {
  const [data, setData] = useState<ArDashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  /** 催收进度节点点击时，联动筛选明细表的复合状态 */
  const [pipelineFilter, setPipelineFilter] = useState<PipelineFilter>({ status: '' });

  /** 即将逾期弹窗（KPI 卡片） */
  const [expiryModal, setExpiryModal] = useState<{
    visible: boolean;
    loading: boolean;
    data: UpcomingExpiryCustomer[];
    error: string | null;
  }>({ visible: false, loading: false, data: [], error: null });

  /** 管道节点即将逾期弹窗 */
  const [pipelineExpiryModal, setPipelineExpiryModal] = useState<{
    visible: boolean;
    loading: boolean;
    nodeLabel: string;
    data: PipelineExpiryDetail[];
    error: string | null;
  }>({ visible: false, loading: false, nodeLabel: '', data: [], error: null });

  // 加载看板数据
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    getArDashboardOverview()
      .then(d => { if (!cancelled) setData(d); })
      .catch(e => { if (!cancelled) setError(e.message || '加载失败'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  const handlePipelineNodeClick = useCallback((node: PipelineNode) => {
    setPipelineFilter((prev) => {
      if (prev.status === node.status && prev.escalationLevel === node.escalationLevel) {
        return { status: '' };
      }
      return { status: node.status, escalationLevel: node.escalationLevel };
    });
  }, []);

  /** 即将逾期弹窗（KPI 卡片点击）：lazy fetch */
  const handleExpiryModalOpen = useCallback(() => {
    setExpiryModal({ visible: true, loading: true, data: [], error: null });
    getUpcomingExpiryCustomers()
      .then(d => setExpiryModal({ visible: true, loading: false, data: d, error: null }))
      .catch(e => setExpiryModal({ visible: true, loading: false, data: [], error: e.message || '加载失败' }));
  }, []);

  /** 管道节点即将逾期标记点击：lazy fetch */
  const handlePipelineExpiryClick = useCallback((node: PipelineNode) => {
    setPipelineExpiryModal({ visible: true, loading: true, nodeLabel: node.label, data: [], error: null });
    getPipelineExpiryDetails(node.status, node.escalationLevel)
      .then(d => setPipelineExpiryModal({ visible: true, loading: false, nodeLabel: node.label, data: d, error: null }))
      .catch(e => setPipelineExpiryModal({ visible: true, loading: false, nodeLabel: node.label, data: [], error: e.message || '加载失败' }));
  }, []);

  // Loading 状态
  if (loading) {
    return (
      <div className={styles.page}>
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: 400 }}>
          <Spin size="large" tip="加载看板数据..." />
        </div>
      </div>
    );
  }

  // 错误状态
  if (error) {
    return (
      <div className={styles.page}>
        <div style={{ padding: 24 }}>
          <Alert message="加载失败" description={error} type="error" showIcon />
        </div>
      </div>
    );
  }

  if (!data) return <Empty description="暂无数据" style={{ marginTop: 100 }} />;

  // 注入 UI 属性（颜色由前端常量映射，不来自 API）
  const kpiCards = data.kpiCards.map(card => ({
    ...card,
    valueColor: KPI_COLOR_MAP[card.key] || '#1890ff',
    value: card.value ?? null,
  }));

  const pipelineNodes = data.pipeline.nodes.map(node => ({
    ...node,
    color: NODE_COLOR_MAP[`${node.status}${node.escalationLevel ? `_L${node.escalationLevel}` : ''}`] || '#1890ff',
  }));

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <Title level={3} className={styles.title}>应收账款全景看板</Title>
        <Text type="secondary">数据更新时间：{data.updatedAt?.replace('T', ' ').slice(0, 19) || '--'}</Text>
      </div>

      {/* 第一区：KPI 指标 */}
      <section className={styles.section}>
        <div className={styles.kpiGrid}>
          {kpiCards.map((item) => (
            <KpiCard
              key={item.key}
              data={item}
              onClick={item.key === 'upcomingExpiry' ? handleExpiryModalOpen : undefined}
            />
          ))}
        </div>
      </section>

      {/* 第二区：催收进度 */}
      <section className={styles.section}>
        <CollectionPipeline
          nodes={pipelineNodes}
          legalProgress={data.pipeline.legalProgress}
          activeFilter={pipelineFilter}
          onNodeClick={handlePipelineNodeClick}
          onExpiryClick={handlePipelineExpiryClick}
        />
      </section>

      {/* 第三区：营销师维度 */}
      <section className={styles.section}>
        <MarketerPanel data={data.marketers} />
      </section>

      {/* 第四区：应收账款明细表 */}
      <section className={styles.section}>
        <ArDetailTable
          data={data.details}
          marketerOptions={data.marketerOptions}
          pipelineFilter={pipelineFilter}
        />
      </section>

      {/* 弹窗 */}
      <UpcomingExpiryModal
        visible={expiryModal.visible}
        onClose={() => setExpiryModal(p => ({ ...p, visible: false }))}
        data={expiryModal.data}
        loading={expiryModal.loading}
        error={expiryModal.error}
      />
      <PipelineExpiryModal
        visible={pipelineExpiryModal.visible}
        onClose={() => setPipelineExpiryModal(p => ({ ...p, visible: false }))}
        nodeLabel={pipelineExpiryModal.nodeLabel}
        data={pipelineExpiryModal.data}
        loading={pipelineExpiryModal.loading}
        error={pipelineExpiryModal.error}
      />
    </div>
  );
};

export default ArDashboard;
