/**
 * 应收账款全景看板
 * 数据来自后端 API /api/ar-dashboard/overview
 */

import React, { useState, useCallback, useEffect } from 'react';
import { Empty, Typography, Skeleton, Card, Button, Result, Tag } from 'antd';
import KpiCard from './components/KpiCard';
import CollectionPipeline from './components/CollectionPipeline';
import MarketerPanel from './components/MarketerPanel';
import ArDetailTable from './components/ArDetailTable';
import UpcomingExpiryModal from './components/UpcomingExpiryModal';
import PipelineNodeModal from './components/PipelineNodeModal';
import LegalProgressModal from './components/LegalProgressModal';
import MarketerDetailModal from './components/MarketerDetailModal';
import {
  getArDashboardOverview,
} from '@/services/api/ar-dashboard';
import { KPI_COLOR_MAP, NODE_COLOR_MAP } from '@/constants/arDashboard';
import styles from './index.less';

const { Title, Text } = Typography;

const ArDashboard: React.FC = () => {
  const [data, setData] = useState<ArDashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  /**
   * 延迟显示骨架屏：后端 SWR 缓存命中时 API 在 ~5ms 返回，
   * 此时显示骨架屏反而造成无意义闪烁。200ms 后才展示骨架屏。
   */
  const [showSkeleton, setShowSkeleton] = useState(false);
  useEffect(() => {
    if (!loading) { setShowSkeleton(false); return; }
    const timer = setTimeout(() => setShowSkeleton(true), 200);
    return () => clearTimeout(timer);
  }, [loading]);

  /** 催收进度节点点击时，联动筛选明细表的复合状态 */
  const [pipelineFilter, setPipelineFilter] = useState<PipelineFilter>({ status: '' });

  /** 即将逾期弹窗（KPI 卡片） */
  const [expiryModal, setExpiryModal] = useState<{
    visible: boolean;
    loading: boolean;
    data: UpcomingExpiryCustomer[];
    error: string | null;
  }>({ visible: false, loading: false, data: [], error: null });

  /** 管道节点明细弹窗 */
  const [pipelineNodeModal, setPipelineNodeModal] = useState<{
    visible: boolean;
    node: PipelineNode | null;
    nodeDetails: ArDetailRow[];
    timeoutDetails: PipelineTimeoutDetail[];
    loading: boolean;
    error: string | null;
  }>({ visible: false, node: null, nodeDetails: [], timeoutDetails: [], loading: false, error: null });

  /** 诉讼进度明细弹窗 */
  const [legalProgressModal, setLegalProgressModal] = useState<{
    visible: boolean;
    category: string;
    data: LegalProgressDetail[];
    loading: boolean;
    error: string | null;
  }>({ visible: false, category: '', data: [], loading: false, error: null });

  /** 营销师催收明细弹窗 */
  const [marketerDetailModal, setMarketerDetailModal] = useState<{
    visible: boolean;
    marketer: MarketerStats | null;
    details: ArDetailRow[];
    timeoutInstanceNos: Set<string>;
    loading: boolean;
    error: string | null;
  }>({ visible: false, marketer: null, details: [], timeoutInstanceNos: new Set(), loading: false, error: null });

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
    // 联动筛选明细表
    setPipelineFilter((prev) => {
      if (prev.status === node.status && prev.escalationLevel === node.escalationLevel) {
        return { status: '' };
      }
      return { status: node.status, escalationLevel: node.escalationLevel };
    });
    // 打开节点明细弹窗
    if (!data) return;
    const nodeDetails = data.details.filter((row) => {
      if (row.status !== node.status) return false;
      if (node.escalationLevel && row.escalationLevel !== node.escalationLevel) return false;
      return true;
    });
    // 从预计算数据中获取超时明细
    const timeoutKey = node.escalationLevel ? `${node.status}:L${node.escalationLevel}` : node.status;
    const timeoutDetails = data.popupData?.pipelineTimeoutDetails?.[timeoutKey] ?? [];
    setPipelineNodeModal({
      visible: true,
      node,
      nodeDetails,
      timeoutDetails,
      loading: false,
      error: null,
    });
  }, [data]);

  /** 即将逾期弹窗（KPI 卡片点击）：直接使用预计算数据 */
  const handleExpiryModalOpen = useCallback(() => {
    if (!data) return;
    const customers = data.popupData?.upcomingExpiryCustomers ?? [];
    setExpiryModal({ visible: true, loading: false, data: customers, error: null });
  }, [data]);

  /** 管道节点即将逾期标记点击：打开同一弹窗（与节点点击行为一致） */
  const handlePipelineExpiryClick = useCallback((node: PipelineNode) => {
    handlePipelineNodeClick(node);
  }, [handlePipelineNodeClick]);

  /** 诉讼进度明细弹窗：直接使用预计算数据 */
  const handleLegalProgressOpen = useCallback((category: string) => {
    if (!data) return;
    const details = data.popupData?.legalProgressDetails?.[category] ?? [];
    setLegalProgressModal({ visible: true, category, data: details, loading: false, error: null });
  }, [data]);

  /** 营销师催收明细弹窗：使用超时维度数据（OA deadline_at） */
  const handleMarketerDetailOpen = useCallback((marketer: MarketerStats) => {
    if (!data) return;
    const details = data.details.filter((row) => row.managerUserName === marketer.marketerName);
    // 聚合所有管道状态的超时明细（通过 instanceNo 匹配）
    const timeoutNos = new Set<string>();
    for (const items of Object.values(data.popupData?.pipelineTimeoutDetails ?? {})) {
      for (const item of items) {
        timeoutNos.add(item.instanceNo);
      }
    }
    setMarketerDetailModal({
      visible: true,
      marketer,
      details,
      timeoutInstanceNos: timeoutNos,
      loading: false,
      error: null,
    });
  }, [data]);

  // Loading 状态：200ms 后显示骨架屏，缓存命中时不会闪烁
  if (loading && showSkeleton) {
    return (
      <div className={styles.page}>
        {/* 页头骨架 */}
        <div className={styles.header}>
          <Skeleton.Input active style={{ width: 200, height: 22 }} />
          <Skeleton.Input active size="small" style={{ width: 160, height: 14 }} />
        </div>

        {/* KPI 卡片骨架 — 复用 styles.kpiGrid 自动继承 4 个响应式断点 */}
        <section className={styles.section}>
          <div className={styles.kpiGrid}>
            {Array.from({ length: 6 }).map((_, i) => (
              <Card key={i} bordered={false} size="small" style={{ borderRadius: 8 }}>
                <Skeleton active paragraph={{ rows: 1, width: ['50%', '40%'] }} title={false} />
              </Card>
            ))}
          </div>
        </section>

        {/* 催收进度骨架 */}
        <section className={styles.section}>
          <Card bordered={false} style={{ borderRadius: 8 }}>
            <Skeleton active paragraph={{ rows: 3 }} />
          </Card>
        </section>

        {/* 营销师面板骨架 */}
        <section className={styles.section}>
          <Card bordered={false} style={{ borderRadius: 8 }}>
            <Skeleton active paragraph={{ rows: 4 }} />
          </Card>
        </section>

        {/* 明细表骨架 */}
        <section className={styles.section}>
          <Card bordered={false} style={{ borderRadius: 8 }}>
            <Skeleton active paragraph={{ rows: 5 }} />
          </Card>
        </section>
      </div>
    );
  }

  // 错误状态：保留页面标题 + 可重试的 Result 组件
  if (error) {
    return (
      <div className={styles.page}>
        <div className={styles.header}>
          <Title level={3} className={styles.title}>应收账款全景看板</Title>
        </div>
        <div style={{ padding: 24 }}>
          <Result
            status="error"
            title="数据加载失败"
            subTitle={error}
            extra={<Button onClick={() => window.location.reload()}>重新加载</Button>}
          />
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
        <Text type="secondary">
          数据更新时间：{data.updatedAt?.replace('T', ' ').slice(0, 19) || '--'}
          {data.isStale && <Tag color="orange" style={{ marginLeft: 8 }}>数据正在更新中</Tag>}
        </Text>
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
          onLegalClick={handleLegalProgressOpen}
        />
      </section>

      {/* 第三区：营销师维度 */}
      <section className={styles.section}>
        <MarketerPanel
          data={data.marketers}
          onCollectingClick={handleMarketerDetailOpen}
        />
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
      <PipelineNodeModal
        visible={pipelineNodeModal.visible}
        onClose={() => setPipelineNodeModal(p => ({ ...p, visible: false }))}
        node={pipelineNodeModal.node}
        allDetails={pipelineNodeModal.nodeDetails}
        timeoutDetails={pipelineNodeModal.timeoutDetails}
        timeoutLoading={pipelineNodeModal.loading}
        error={pipelineNodeModal.error}
      />
      <LegalProgressModal
        visible={legalProgressModal.visible}
        onClose={() => setLegalProgressModal(p => ({ ...p, visible: false }))}
        category={legalProgressModal.category}
        data={legalProgressModal.data}
        loading={legalProgressModal.loading}
        error={legalProgressModal.error}
      />
      <MarketerDetailModal
        visible={marketerDetailModal.visible}
        onClose={() => setMarketerDetailModal(p => ({ ...p, visible: false }))}
        marketer={marketerDetailModal.marketer}
        details={marketerDetailModal.details}
        timeoutInstanceNos={marketerDetailModal.timeoutInstanceNos}
        error={marketerDetailModal.error}
      />
    </div>
  );
};

export default ArDashboard;
