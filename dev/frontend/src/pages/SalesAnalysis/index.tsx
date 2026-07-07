/**
 * 销售分析首页总览
 * 原型阶段页面，使用静态模拟数据
 * 5 个板块：经营全景 -> 问题发现 -> 目标追踪 -> 客户分析 -> 商品分析
 */
import React from 'react';
import OverviewSection from './components/OverviewSection';
import RiskDiscoverySection from './components/RiskDiscoverySection';
import TargetTrackingSection from './components/TargetTrackingSection';
import CustomerAnalysisSection from './components/CustomerAnalysisSection';
import ProductAnalysisSection from './components/ProductAnalysisSection';

const SalesAnalysis: React.FC = () => {
  return (
    <div className="page-scroll">
      <OverviewSection />
      <RiskDiscoverySection />
      <TargetTrackingSection />
      <CustomerAnalysisSection />
      <ProductAnalysisSection />
    </div>
  );
};

export default SalesAnalysis;
