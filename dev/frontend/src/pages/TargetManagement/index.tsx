/**
 * 目标管理页面
 * 双视图模式：
 * - 概览模式（selectedMarketerId === null）：展示全局概览 + 营销师明细表
 * - 编辑模式（selectedMarketerId 有值）：展示客户列表 + 品类商品明细表
 */
import React, { useCallback, useState, useRef } from 'react';
import { message, Spin, Modal, Button } from 'antd';
import { SignaturePad } from '@/components/Oa';
import TargetErrorBoundary from './TargetErrorBoundary';
import TargetToolbar from './components/TargetToolbar';
import OverviewPanel from './components/OverviewPanel';
import MarketerSummary from './components/MarketerSummary';
import CustomerListPanel from './components/CustomerListPanel';
import CategoryProductTable from './components/CategoryProductTable';
import AddCustomerModal from './components/AddCustomerModal';
import AddProductModal from './components/AddProductModal';
import { useTargetManagement } from './hooks/useTargetManagement';
import { useTargetCalculation } from './hooks/useTargetCalculation';
import { useTargetDerivedData } from './hooks/useTargetDerivedData';
import { useTargetModalState } from './hooks/useTargetModalState';
import styles from './index.less';

const TargetManagementPage: React.FC = () => {
  const { filters, data, actions } = useTargetManagement();
  const calc = useTargetCalculation();

  // 派生数据（弹窗选项、营销师摘要）
  const derived = useTargetDerivedData({
    marketers: data.marketers,
    customers: data.customers,
    customerList: data.customerList,
    productCatalog: data.productCatalog,
    overviewData: data.overviewData,
    currentTargetId: data.currentTargetId,
    selectedMarketerId: filters.selectedMarketerId,
    selectedCustomerId: filters.selectedCustomerId,
  });

  // 弹窗状态 + 脏状态追踪
  const modal = useTargetModalState({
    customers: data.customers,
    selectedMarketerId: filters.selectedMarketerId,
    isHistoryMonth: filters.isHistoryMonth,
    canEdit: data.canEdit,
    loading: data.loading,
    productCatalog: data.productCatalog,
    loadCustomerList: data.loadCustomerList,
    loadProductCatalog: data.loadProductCatalog,
    actions,
    handleSave: actions.handleSave,
  });

  const isOverviewMode = filters.selectedMarketerId === null;

  // 存储待审批的 targetId，供签名确认后使用（避免闭包过时）
  const pendingApprovalTargetIdRef = useRef<number | null>(null);

  const handleSubmitApprovalWithId = useCallback(async () => {
    const targetId = await actions.handleSubmitApproval();
    if (targetId) {
      pendingApprovalTargetIdRef.current = targetId;
    }
  }, [actions.handleSubmitApproval]);

  const handleConfirmSignature = useCallback(async (signatureData: string) => {
    const targetId = pendingApprovalTargetIdRef.current;
    if (!targetId) return;
    pendingApprovalTargetIdRef.current = null;
    await actions.confirmSignature(signatureData, targetId);
  }, [actions.confirmSignature]);

  // 已审批状态下保存时弹出确认弹框（修改后需重新提交审批）
  const handleSaveWithConfirm = useCallback(async () => {
    if (data.targetStatus === 'approved') {
      const confirmed = await new Promise<boolean>((resolve) => {
        let resolved = false;
        Modal.confirm({
          title: '确认修改',
          content: '修改后目标将回退为草稿，需重新提交审批。是否继续？',
          okText: '继续修改',
          cancelText: '取消',
          onOk: () => { resolved = true; resolve(true); },
          onCancel: () => { resolved = true; resolve(false); },
          afterClose: () => { if (!resolved) resolve(false); },
        });
      });
      if (!confirmed) return;
    }
    await modal.handleSave();
  }, [data.targetStatus, modal.handleSave]);

  const handleClickMarketer = useCallback((marketerId: number) => {
    filters.setSelectedMarketerId(marketerId);
  }, [filters.setSelectedMarketerId]);

  const handleBackToOverview = useCallback(() => {
    filters.setSelectedMarketerId(null);
  }, [filters.setSelectedMarketerId]);

  return (
    <div className={`page-full ${styles.page}`}>
      <TargetToolbar
        marketers={derived.marketerOptions}
        selectedMarketerId={filters.selectedMarketerId ? String(filters.selectedMarketerId) : ''}
        onSelectMarketer={(id) => filters.setSelectedMarketerId(id ? Number(id) : null)}
        currentMonth={filters.currentMonth}
        onPrevMonth={filters.handlePrevMonth}
        onNextMonth={filters.handleNextMonth}
        canPrevMonth={filters.canPrevMonth}
        isHistoryMonth={filters.isHistoryMonth}
        readOnly={filters.readOnly || data.targetStatus === 'pending'}
        canSave={data.canEdit && !filters.isHistoryMonth && !!filters.selectedMarketerId && data.targetStatus !== 'pending'}
        isDirty={modal.isDirty}
        targetStatus={data.targetStatus}
        onSave={handleSaveWithConfirm}
        onSubmitApproval={handleSubmitApprovalWithId}
        submitLoading={actions.submitLoading}
        onBackToOverview={!isOverviewMode ? handleBackToOverview : undefined}
      />

      {isOverviewMode ? (
        data.overviewData ? (
          <OverviewPanel
            data={data.overviewData}
            onClickMarketer={handleClickMarketer}
          />
        ) : (
          <div className={styles.loadingHint}><Spin /> 正在加载概览数据...</div>
        )
      ) : (
        <>
          {data.loading ? (
            <div className={styles.loadingHint}><Spin /> 加载目标数据...</div>
          ) : (
            <>
              {derived.currentMarketerSummary && (
                <MarketerSummary marketer={derived.currentMarketerSummary} />
              )}
              <div className={styles.contentWrapper}>
                <CustomerListPanel
                  customers={data.customers}
                  selectedCustomerId={filters.selectedCustomerId}
                  onSelectCustomer={(id) => filters.setSelectedCustomerId(id)}
                  onAddCustomer={modal.handleOpenCustomerModal}
                  onRemoveCustomer={modal.wrappedActions.handleRemoveCustomer}
                  getCustomerTotal={calc.getCustomerTotal}
                  readOnly={filters.readOnly}
                  showMarketerTag={false}
                />

                <CategoryProductTable
                  customer={data.selectedCustomer}
                  readOnly={filters.readOnly}
                  getCategoryAggregates={calc.getCategoryAggregates}
                  onUpdateProduct={modal.wrappedActions.handleUpdateProduct}
                  onUpdateCategoryRemark={modal.wrappedActions.handleUpdateCategoryRemark}
                  onSplit={modal.wrappedActions.handleSplit}
                  onAddProduct={modal.handleOpenProductModal}
                  onAddCategory={modal.handleOpenAddCategory}
                />
              </div>
            </>
          )}
        </>
      )}

      <AddCustomerModal
        visible={modal.customerModalVisible}
        loading={data.customerListLoading}
        onClose={() => modal.setCustomerModalVisible(false)}
        onSuccess={(customers) => {
          modal.wrappedActions.handleAddCustomers(customers);
          modal.setCustomerModalVisible(false);
          message.success(`已添加 ${customers.length} 个客户`);
        }}
        availableCustomers={derived.availableCustomers}
        myCustomerIds={derived.myCustomerIds}
      />

      <AddProductModal
        visible={modal.productModalVisible}
        onClose={() => modal.setProductModalVisible(false)}
        onSuccess={(products) => {
          if (filters.selectedCustomerId) {
            modal.wrappedActions.handleAddProducts(filters.selectedCustomerId, products);
          }
          modal.setProductModalVisible(false);
          modal.setProductModalCategory(null);
          message.success(`已添加 ${products.length} 个商品`);
        }}
        availableProducts={derived.availableProducts}
        existingProductIds={derived.existingProductIds}
        customerName={data.selectedCustomer?.customerName || ''}
        filterCategoryId={modal.productModalCategory?.categoryId}
        filterCategoryName={modal.productModalCategory?.categoryName}
      />

      <Modal
        title="电子签名确认"
        open={actions.signatureModalVisible}
        onCancel={() => {
          pendingApprovalTargetIdRef.current = null;
          actions.cancelSignature();
        }}
        footer={null}
        destroyOnClose
        width={520}
      >
        <SignatureModalContent
          onConfirm={handleConfirmSignature}
        />
      </Modal>
    </div>
  );
};

/** 签名弹窗内容组件 */
const SignatureModalContent: React.FC<{
  onConfirm: (data: string) => void;
}> = ({ onConfirm }) => {
  const [signature, setSignature] = useState<string | undefined>();

  return (
    <div>
      <p style={{ marginBottom: 12 }}>请在下方签名确认后提交审批</p>
      <SignaturePad
        value={signature}
        onChange={setSignature}
        width={460}
        height={200}
      />
      <div style={{ marginTop: 16, textAlign: 'right' }}>
        <Button
          type="primary"
          disabled={!signature}
          onClick={() => signature && onConfirm(signature)}
        >
          确认签名并提交
        </Button>
      </div>
    </div>
  );
};

/** 用 ErrorBoundary 包裹页面，防止渲染异常导致白屏 */
const TargetManagement: React.FC = () => (
  <TargetErrorBoundary>
    <TargetManagementPage />
  </TargetErrorBoundary>
);

export default TargetManagement;
