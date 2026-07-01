/**
 * 目标管理页面
 * 双视图模式：
 * - 概览模式（selectedMarketerId === null）：展示全局概览 + 营销师明细表
 * - 编辑模式（selectedMarketerId 有值）：展示客户列表 + 品类商品明细表
 */
import React, { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import { message } from 'antd';
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
import type { MarketerOverview } from '@/services/api/sales-target';
import styles from './index.less';

const TargetManagementPage: React.FC = () => {
  const { filters, data, actions } = useTargetManagement();
  const calc = useTargetCalculation();

  // 弹窗状态
  const [customerModalVisible, setCustomerModalVisible] = useState(false);
  const [productModalVisible, setProductModalVisible] = useState(false);
  const [productModalCategory, setProductModalCategory] = useState<{
    categoryId: string;
    categoryName: string;
  } | null>(null);

  // 脏状态追踪：通过比较 customers 引用判断是否有未保存的编辑
  const savedSnapshotRef = useRef(data.customers);
  const [dirtyVersion, setDirtyVersion] = useState(0);

  // 数据重新加载时重置快照
  useEffect(() => {
    savedSnapshotRef.current = data.customers;
    setDirtyVersion((v) => v + 1);
  }, [data.marketers, filters.selectedMarketerId, filters.currentMonth]);

  const isDirty = data.customers !== savedSnapshotRef.current
    && !!filters.selectedMarketerId
    && !filters.isHistoryMonth
    && data.canEdit;

  const markDirty = useCallback(() => setDirtyVersion((v) => v + 1), []);

  // 保存后更新快照
  const handleSave = useCallback(async () => {
    await actions.handleSave();
    savedSnapshotRef.current = data.customers;
    markDirty();
  }, [actions, data.customers, markDirty]);

  // useMemo 缓存数据转换
  const marketerOptions = useMemo(
    () => data.marketers.map((m) => ({ id: String(m.id), name: m.name })),
    [data.marketers],
  );

  const availableCustomers = useMemo(
    () =>
      data.customerList.map((c) => ({
        customerId: c.erpConsumerId,
        customerName: c.consumerName,
        industry: c.consumerManagerName || '公海客户',
        status: c.isPublicSea ? '公海' : '已分配',
      })),
    [data.customerList],
  );

  const availableProducts = useMemo(
    () =>
      data.productCatalog.flatMap((cat) =>
        cat.products.map((p) => ({
          productId: String(p.erpGoodsId),
          productName: p.goodsName,
          categoryId: cat.categoryName,
          categoryName: cat.categoryName,
          unit: p.unit,
          unitPrice: p.unitPrice || 0,
        })),
      ),
    [data.productCatalog],
  );

  // 从已加载的客户数据构建当前营销师摘要（编辑模式用）
  const currentMarketerSummary: MarketerOverview | null = useMemo(() => {
    if (!filters.selectedMarketerId || !data.customers.length) return null;
    const firstCustomer = data.customers[0];
    let targetAmount = 0;
    let lastMonthActual = 0;
    for (const c of data.customers) {
      for (const cat of c.categories) {
        targetAmount += cat.targetAmount;
        lastMonthActual += cat.actualAmountLastMonth;
      }
    }
    const growthRate = lastMonthActual > 0
      ? (targetAmount - lastMonthActual) / lastMonthActual
      : null;
    const overviewMarketer = data.overviewData?.marketers.find(
      (m) => m.id === filters.selectedMarketerId,
    );
    return {
      id: filters.selectedMarketerId,
      name: firstCustomer.marketerName || overviewMarketer?.name || '',
      targetAmount: Math.round(targetAmount * 100) / 100,
      lastMonthActual: Math.round(lastMonthActual * 100) / 100,
      growthRate: growthRate !== null ? Math.round(growthRate * 10000) / 10000 : null,
      hasSaved: !!data.currentTargetId,
      customerCount: data.customers.length,
    };
  }, [filters.selectedMarketerId, data.customers, data.currentTargetId, data.overviewData]);

  // 弹窗操作
  const handleAddProduct = useCallback(
    (customerId: number, categoryId: string, categoryName: string) => {
      setProductModalCategory({ categoryId, categoryName });
      setProductModalVisible(true);
    },
    [],
  );

  const handleAddCategory = useCallback(() => {
    setProductModalCategory(null);
    setProductModalVisible(true);
  }, []);

  const handleOpenCustomerModal = useCallback(() => {
    data.loadCustomerList();
    setCustomerModalVisible(true);
  }, [data.loadCustomerList]);

  const handleOpenProductModal = useCallback(
    (customerId: number, categoryId: string, categoryName: string) => {
      data.loadProductCatalog();
      handleAddProduct(customerId, categoryId, categoryName);
    },
    [data.loadProductCatalog, handleAddProduct],
  );

  const handleOpenAddCategory = useCallback(() => {
    data.loadProductCatalog();
    handleAddCategory();
  }, [data.loadProductCatalog, handleAddCategory]);

  // 包装 actions，在每次编辑后标记脏状态
  const wrappedActions = useMemo(() => ({
    handleUpdateProduct: (...args: Parameters<typeof actions.handleUpdateProduct>) => {
      actions.handleUpdateProduct(...args);
      markDirty();
    },
    handleAddCustomers: (...args: Parameters<typeof actions.handleAddCustomers>) => {
      actions.handleAddCustomers(...args);
      markDirty();
    },
    handleAddProducts: (...args: Parameters<typeof actions.handleAddProducts>) => {
      actions.handleAddProducts(...args);
      markDirty();
    },
    handleSplit: (...args: Parameters<typeof actions.handleSplit>) => {
      actions.handleSplit(...args);
      markDirty();
    },
  }), [actions, markDirty]);

  // 视图模式
  const isOverviewMode = filters.selectedMarketerId === null;

  // 从概览点击营销师进入编辑模式
  const handleClickMarketer = useCallback((marketerId: number) => {
    filters.setSelectedMarketerId(marketerId);
  }, [filters.setSelectedMarketerId]);

  // 返回概览
  const handleBackToOverview = useCallback(() => {
    filters.setSelectedMarketerId(null);
  }, [filters.setSelectedMarketerId]);

  return (
    <div className={`page-full ${styles.page}`}>
      <TargetToolbar
        marketers={marketerOptions}
        selectedMarketerId={filters.selectedMarketerId ? String(filters.selectedMarketerId) : ''}
        onSelectMarketer={(id) => filters.setSelectedMarketerId(id ? Number(id) : null)}
        currentMonth={filters.currentMonth}
        onPrevMonth={filters.handlePrevMonth}
        onNextMonth={filters.handleNextMonth}
        canPrevMonth={filters.canPrevMonth}
        isHistoryMonth={filters.isHistoryMonth}
        readOnly={filters.readOnly}
        canSave={data.canEdit && !filters.isHistoryMonth && !!filters.selectedMarketerId}
        isDirty={isDirty}
        onSave={handleSave}
        onBackToOverview={!isOverviewMode ? handleBackToOverview : undefined}
      />

      {isOverviewMode ? (
        data.overviewData ? (
          <OverviewPanel
            data={data.overviewData}
            onClickMarketer={handleClickMarketer}
          />
        ) : (
          <div className={styles.loadingHint}>正在加载概览数据...</div>
        )
      ) : (
        <>
          {currentMarketerSummary && (
            <MarketerSummary marketer={currentMarketerSummary} />
          )}
          <div className={styles.contentWrapper}>
            <CustomerListPanel
              customers={data.customers}
              selectedCustomerId={filters.selectedCustomerId}
              onSelectCustomer={(id) => filters.setSelectedCustomerId(id)}
              onAddCustomer={handleOpenCustomerModal}
              getCustomerTotal={calc.getCustomerTotal}
              readOnly={filters.readOnly}
              showMarketerTag={false}
            />

            <CategoryProductTable
              customer={data.selectedCustomer}
              readOnly={filters.readOnly}
              getCategoryAggregates={calc.getCategoryAggregates}
              onUpdateProduct={wrappedActions.handleUpdateProduct}
              onSplit={wrappedActions.handleSplit}
              onAddProduct={handleOpenProductModal}
              onAddCategory={() => handleOpenAddCategory()}
            />
          </div>
        </>
      )}

      <AddCustomerModal
        visible={customerModalVisible}
        onClose={() => setCustomerModalVisible(false)}
        onSuccess={(customers) => {
          wrappedActions.handleAddCustomers(customers);
          setCustomerModalVisible(false);
          message.success(`已添加 ${customers.length} 个客户`);
        }}
        availableCustomers={availableCustomers}
      />

      <AddProductModal
        visible={productModalVisible}
        onClose={() => setProductModalVisible(false)}
        onSuccess={(products) => {
          if (filters.selectedCustomerId) {
            wrappedActions.handleAddProducts(filters.selectedCustomerId, products);
          }
          setProductModalVisible(false);
          setProductModalCategory(null);
          message.success(`已添加 ${products.length} 个商品`);
        }}
        availableProducts={availableProducts}
        customerName={data.selectedCustomer?.customerName || ''}
        filterCategoryId={productModalCategory?.categoryId}
        filterCategoryName={productModalCategory?.categoryName}
      />
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
