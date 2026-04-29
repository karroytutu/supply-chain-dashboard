/**
 * 销售分析首页总览
 * 原型阶段页面，使用静态模拟数据
 */

import React from 'react';
import { Alert } from 'antd';
import MetricSparkCard from './components/MetricSparkCard';
import CustomerMetricCard from './components/CustomerMetricCard';
import CustomerStructure from './components/CustomerStructure';
import ProductRanking from './components/ProductRanking';
import ProductMatrix from './components/ProductMatrix';
import ComboInventory from './components/ComboInventory';
import RepPerformanceTable from './components/RepPerformanceTable';
import RepRadarChart from './components/RepRadarChart';
import RepTrendChart from './components/RepTrendChart';
import DiagnosisCard from './components/DiagnosisCard';
import CustomerDrilldownModal from './components/CustomerDrilldownModal';
import { useCustomerDrilldown } from './hooks/useCustomerDrilldown';
import {
  ALL_METRICS,
  CUSTOMER_METRIC_DATA,
  CUSTOMER_QUADRANT_DATA,
  PRODUCT_RANKING,
  PRODUCT_MATRIX,
  INVENTORY_MATCH,
  SALES_REP_PERFORMANCE,
  DIAGNOSIS_ITEMS,
} from '@/constants/salesAnalysis';
import type { CustomerMetricType } from '@/types/sales-analysis';
import styles from './index.less';

const SalesAnalysis: React.FC = () => {
  const drilldown = useCustomerDrilldown();

  return (
    <div className={styles.page}>
      <Alert
        className={styles.prototypeBanner}
        type="warning"
        showIcon
        message="原型设计预览 — 当前页面数据均为模拟数据，仅用于展示布局与交互效果"
      />
      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>指标概览</h2>
        <div className={styles.metricGrid}>
          {ALL_METRICS.map((metric) => (
            <MetricSparkCard key={metric.key} data={metric} />
          ))}
        </div>
      </section>

      <CustomerSection onMetricClick={(t: CustomerMetricType) => drilldown.actions.openModal(t)} />

      <ProductSection />

      <RepSection />

      <CustomerDrilldownModal drilldown={drilldown} />
    </div>
  );
};

/** 客户分析板块 */
const CustomerSection: React.FC<{ onMetricClick: (metricType: CustomerMetricType) => void }> = ({ onMetricClick }) => (
  <section className={styles.section}>
    <h2 className={styles.sectionTitle}>客户分析</h2>
    <div className={styles.riskGrid}>
      {Object.values(CUSTOMER_METRIC_DATA).map((metric) => (
        <CustomerMetricCard key={metric.metricType} data={metric} onClick={onMetricClick} />
      ))}
    </div>
    <div className={styles.customerGrid}>
      <CustomerStructure data={CUSTOMER_QUADRANT_DATA} />
    </div>
  </section>
);

/** 产品分析板块 */
const ProductSection: React.FC = () => (
  <section className={styles.section}>
    <h2 className={styles.sectionTitle}>产品分析</h2>
    <div className={styles.threeCol}>
      <ProductRanking data={PRODUCT_RANKING} />
      <ProductMatrix data={PRODUCT_MATRIX} />
      <ComboInventory inventoryData={INVENTORY_MATCH} />
    </div>
  </section>
);

/** 业务员分析板块 */
const RepSection: React.FC = () => (
  <section className={styles.section}>
    <h2 className={styles.sectionTitle}>业务员分析</h2>
    <div className={styles.sectionGrid}>
      <RepPerformanceTable data={SALES_REP_PERFORMANCE} />
      <RepRadarChart />
    </div>
    <div className={styles.sectionGrid} style={{ marginTop: 16 }}>
      <RepTrendChart />
      <DiagnosisCard data={DIAGNOSIS_ITEMS} />
    </div>
  </section>
);

export default SalesAnalysis;
