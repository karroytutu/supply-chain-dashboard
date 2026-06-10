/**
 * 应收账款全景看板
 * 前端原型，数据来自 Mock 常量，后续对接 API 替换
 */

import React, { useState, useCallback } from 'react';
import { Alert, Typography } from 'antd';
import KpiCard from './components/KpiCard';
import CollectionPipeline from './components/CollectionPipeline';
import MarketerPanel from './components/MarketerPanel';
import ArDetailTable from './components/ArDetailTable';
import UpcomingExpiryModal from './components/UpcomingExpiryModal';
import PipelineExpiryModal from './components/PipelineExpiryModal';
import {
  KPI_DATA,
  PIPELINE_NODES,
  LEGAL_PROGRESS,
  MARKETER_DATA,
  MARKETER_OPTIONS,
  DETAIL_DATA,
  UPCOMING_EXPIRY_CUSTOMERS,
  PIPELINE_EXPIRY_DETAILS,
  UPDATED_AT,
} from '@/constants/arDashboard';
import styles from './index.less';

const { Title, Text } = Typography;

const ArDashboard: React.FC = () => {
  /** 催收进度节点点击时，联动筛选明细表的复合状态 */
  const [pipelineFilter, setPipelineFilter] = useState<PipelineFilter>({ status: '' });

  /** 即将逾期弹窗（KPI 卡片） */
  const [expiryModalVisible, setExpiryModalVisible] = useState(false);

  /** 管道节点即将逾期弹窗 */
  const [pipelineExpiryModal, setPipelineExpiryModal] = useState<{
    visible: boolean;
    nodeLabel: string;
    data: PipelineExpiryDetail[];
  }>({ visible: false, nodeLabel: '', data: [] });

  const handlePipelineNodeClick = useCallback((node: PipelineNode) => {
    setPipelineFilter((prev) => {
      if (prev.status === node.status && prev.escalationLevel === node.escalationLevel) {
        return { status: '' };
      }
      return { status: node.status, escalationLevel: node.escalationLevel };
    });
  }, []);

  /** 管道节点即将逾期标记点击 */
  const handlePipelineExpiryClick = useCallback((node: PipelineNode) => {
    const key = node.status === 'escalated'
      ? `${node.status}_${node.escalationLevel}`
      : node.status;
    const details = PIPELINE_EXPIRY_DETAILS[key] || [];
    setPipelineExpiryModal({ visible: true, nodeLabel: node.label, data: details });
  }, []);

  return (
    <div className={styles.page}>
      <Alert
        message="原型设计预览 — 当前页面数据均为模拟数据"
        type="info"
        showIcon
        banner
        className={styles.alert}
      />

      <div className={styles.header}>
        <Title level={3} className={styles.title}>应收账款全景看板</Title>
        <Text type="secondary">数据更新时间：{UPDATED_AT}</Text>
      </div>

      {/* 第一区：KPI 指标 */}
      <section className={styles.section}>
        <div className={styles.kpiGrid}>
          {KPI_DATA.map((item) => (
            <KpiCard
              key={item.key}
              data={item}
              onClick={item.key === 'upcomingExpiry' ? () => setExpiryModalVisible(true) : undefined}
            />
          ))}
        </div>
      </section>

      {/* 第二区：催收进度 */}
      <section className={styles.section}>
        <CollectionPipeline
          nodes={PIPELINE_NODES}
          legalProgress={LEGAL_PROGRESS}
          activeFilter={pipelineFilter}
          onNodeClick={handlePipelineNodeClick}
          onExpiryClick={handlePipelineExpiryClick}
        />
      </section>

      {/* 第三区：营销师维度 */}
      <section className={styles.section}>
        <MarketerPanel data={MARKETER_DATA} />
      </section>

      {/* 第四区：应收账款明细表 */}
      <section className={styles.section}>
        <ArDetailTable
          data={DETAIL_DATA}
          marketerOptions={MARKETER_OPTIONS}
          pipelineFilter={pipelineFilter}
        />
      </section>

      {/* 弹窗 */}
      <UpcomingExpiryModal
        visible={expiryModalVisible}
        onClose={() => setExpiryModalVisible(false)}
        data={UPCOMING_EXPIRY_CUSTOMERS}
      />
      <PipelineExpiryModal
        visible={pipelineExpiryModal.visible}
        onClose={() => setPipelineExpiryModal((p) => ({ ...p, visible: false }))}
        nodeLabel={pipelineExpiryModal.nodeLabel}
        data={pipelineExpiryModal.data}
      />
    </div>
  );
};

export default ArDashboard;
