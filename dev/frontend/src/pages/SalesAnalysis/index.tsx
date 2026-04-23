/**
 * 销售分析首页总览
 * 原型阶段页面，使用静态模拟数据
 */

import React from 'react';
import PageHeader from './components/PageHeader';
import MetricSection from './components/MetricSection';
import RiskCard from './components/RiskCard';
import CustomerStructure from './components/CustomerStructure';
import CoreCustomerValue from './components/CoreCustomerValue';
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
  SALES_PAYMENT_METRICS,
  EXPENSE_PROFIT_METRICS,
  RISK_CARD_DATA,
  GRADES_DATA,
  TYPE_DISTRIBUTION,
  TOP_CUSTOMERS,
  DISTRICT_SHARE,
  PRODUCT_RANKING,
  PRODUCT_MATRIX,
  INVENTORY_MATCH,
  SALES_REP_PERFORMANCE,
  DIAGNOSIS_ITEMS,
} from '@/constants/salesAnalysis';
import type { RiskLevel } from '@/types/sales-analysis';
import styles from './index.less';

const SalesAnalysis: React.FC = () => {
  const drilldown = useCustomerDrilldown();

  return (
    <div className={styles.page}>
      <PageHeader />
      <MetricSection title="销售与回款" metrics={SALES_PAYMENT_METRICS} />
      <MetricSection title="费用与利润" metrics={EXPENSE_PROFIT_METRICS} secondary />

      <CustomerSection onRiskClick={(l: RiskLevel) => drilldown.actions.openModal(l)} />

      <ProductSection />

      <RepSection />

      <CustomerDrilldownModal drilldown={drilldown} />
    </div>
  );
};

/** 客户分析板块 */
const CustomerSection: React.FC<{ onRiskClick: (level: RiskLevel) => void }> = ({ onRiskClick }) => (
  <section className={styles.section}>
    <div className={styles.sectionHeader}>
      <h2 className={styles.sectionTitle}>客户分析</h2>
      <p className={styles.sectionDesc}>
        按&ldquo;风险优先&rdquo;组织首页内容，先发现问题客户，再安排动作，最后辅助判断客户结构与核心价值。
      </p>
    </div>
    <div className={styles.riskGrid}>
      {Object.values(RISK_CARD_DATA).map((risk) => (
        <RiskCard key={risk.level} data={risk} onClick={onRiskClick} />
      ))}
    </div>
    <div className={styles.customerGrid}>
      <div className={styles.col2}>
        <CustomerStructure grades={GRADES_DATA} typeDistribution={TYPE_DISTRIBUTION} />
      </div>
      <div className={styles.col1}>
        <CoreCustomerValue topCustomers={TOP_CUSTOMERS} districtShare={DISTRICT_SHARE} />
      </div>
    </div>
  </section>
);

/** 产品分析板块 */
const ProductSection: React.FC = () => (
  <section className={styles.section}>
    <div className={styles.sectionHeader}>
      <h2 className={styles.sectionTitle}>产品分析</h2>
      <p className={styles.sectionDesc}>
        从销量、毛利、关联销售和库存匹配四个方向识别产品结构问题。
      </p>
    </div>
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
    <div className={styles.sectionHeader}>
      <h2 className={styles.sectionTitle}>业务员分析</h2>
      <p className={styles.sectionDesc}>
        兼顾个人业绩、工作效率、趋势变化与短板诊断。
      </p>
    </div>
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
