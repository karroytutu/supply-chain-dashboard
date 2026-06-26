/**
 * 目标管理页面
 * 营销师按 客户→品类→商品 维度制定月度销售目标
 */
import React, { useState, useCallback } from 'react';
import { Alert, message } from 'antd';
import TargetToolbar from './components/TargetToolbar';
import SummaryCards from './components/SummaryCards';
import CustomerListPanel from './components/CustomerListPanel';
import CategoryProductTable from './components/CategoryProductTable';
import AddCustomerModal from './components/AddCustomerModal';
import AddProductModal from './components/AddProductModal';
import ApprovalActions from './components/ApprovalActions';
import { useTargetManagement } from './hooks/useTargetManagement';
import { useTargetCalculation } from './hooks/useTargetCalculation';
import { AVAILABLE_CUSTOMERS, AVAILABLE_PRODUCTS } from '@/constants/targetManagement';
import type { TargetStatus } from '@/types/target-management';
import styles from './index.less';

const TargetManagement: React.FC = () => {
  const tm = useTargetManagement();
  const calc = useTargetCalculation();

  // 弹窗状态
  const [customerModalVisible, setCustomerModalVisible] = useState(false);
  const [productModalVisible, setProductModalVisible] = useState(false);
  const [productModalCategory, setProductModalCategory] = useState<{ categoryId: string; categoryName: string } | null>(null);

  // 模拟操作
  const handleSaveDraft = useCallback(() => {
    message.success('草稿已保存');
  }, []);

  const handleSubmit = useCallback(() => {
    tm.handleStatusAction('pending' as TargetStatus);
    message.success('已提交审批');
  }, [tm]);

  const handleWithdraw = useCallback(() => {
    tm.handleStatusAction('draft' as TargetStatus);
    message.info('已撤回审批');
  }, [tm]);

  const handleApprove = useCallback(() => {
    tm.handleStatusAction('approved' as TargetStatus);
    message.success('审批已通过');
  }, [tm]);

  const handleReject = useCallback(() => {
    tm.handleStatusAction('rejected' as TargetStatus);
    message.warning('已驳回');
  }, [tm]);

  const handleResubmit = useCallback(() => {
    tm.handleStatusAction('pending' as TargetStatus);
    message.success('已重新提交审批');
  }, [tm]);

  // 添加客户/商品
  const handleAddProduct = useCallback((customerId: string, categoryId: string, categoryName: string) => {
    setProductModalCategory({ categoryId, categoryName });
    setProductModalVisible(true);
  }, []);

  const handleAddCategory = useCallback(() => {
    setProductModalCategory(null);
    setProductModalVisible(true);
  }, []);

  return (
    <div className={styles.page}>
      <Alert
        className={styles.prototypeBanner}
        type="warning"
        showIcon
        message="原型设计预览 — 当前页面数据均为模拟数据，仅用于展示布局与交互效果"
      />

      <TargetToolbar
        marketers={tm.marketers}
        selectedMarketerId={tm.selectedMarketerId}
        onSelectMarketer={tm.setSelectedMarketerId}
        currentMonth={tm.currentMonth}
        onPrevMonth={tm.handlePrevMonth}
        onNextMonth={tm.handleNextMonth}
        status={tm.status}
        isHistoryMonth={tm.isHistoryMonth}
      />

      <SummaryCards summary={tm.summary} />

      <div className={styles.mainContent}>
        <CustomerListPanel
          customers={tm.filteredCustomers}
          selectedCustomerId={tm.selectedCustomerId}
          onSelectCustomer={tm.setSelectedCustomerId}
          onAddCustomer={() => setCustomerModalVisible(true)}
          getCustomerTotal={calc.getCustomerTotal}
          readOnly={tm.isHistoryMonth}
        />

        <CategoryProductTable
          customer={tm.selectedCustomer}
          readOnly={tm.isHistoryMonth}
          onUpdateProduct={tm.handleUpdateProduct}
          onSplit={tm.handleSplit}
          onAddProduct={handleAddProduct}
          onAddCategory={handleAddCategory}
        />
      </div>

      <ApprovalActions
        status={tm.status}
        userRole={tm.userRole}
        readOnly={tm.isHistoryMonth}
        onSaveDraft={handleSaveDraft}
        onSubmit={handleSubmit}
        onWithdraw={handleWithdraw}
        onApprove={handleApprove}
        onReject={handleReject}
        onResubmit={handleResubmit}
      />

      <AddCustomerModal
        visible={customerModalVisible}
        onClose={() => setCustomerModalVisible(false)}
        onSuccess={(customers) => {
          tm.handleAddCustomers(customers);
          setCustomerModalVisible(false);
          message.success(`已添加 ${customers.length} 个客户`);
        }}
        availableCustomers={AVAILABLE_CUSTOMERS}
      />

      <AddProductModal
        visible={productModalVisible}
        onClose={() => setProductModalVisible(false)}
        onSuccess={(products) => {
          if (tm.selectedCustomerId) {
            tm.handleAddProducts(tm.selectedCustomerId, products);
          }
          setProductModalVisible(false);
          setProductModalCategory(null);
          message.success(`已添加 ${products.length} 个商品`);
        }}
        availableProducts={AVAILABLE_PRODUCTS}
        customerName={tm.selectedCustomer?.customerName || ''}
        filterCategoryId={productModalCategory?.categoryId}
        filterCategoryName={productModalCategory?.categoryName}
      />
    </div>
  );
};

export default TargetManagement;
