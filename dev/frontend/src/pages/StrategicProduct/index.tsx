/**
 * 战略商品管理页面
 */
import { useEffect, useState } from 'react';
import Card from 'antd/es/card';
import styles from './index.less';

// Hooks
import { useStrategicProducts } from './hooks/useStrategicProducts';
import { useCategoryTree } from './hooks/useCategoryTree';
import { useProductSelection } from './hooks/useProductSelection';
import { useProductActions } from './hooks/useProductActions';

// Components
import StatsCards from './components/StatsCards';
import CategorySidebar from './components/CategorySidebar';
import StrategicProductTable from './components/StrategicProductTable';
import AddProductModal from './components/AddProductModal';

export default function StrategicProductManage() {
  const [categoryDrawerVisible, setCategoryDrawerVisible] = useState(false);
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth < 768);
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  // 商品数据和操作
  const {
    loading, dataSource, total, page, pageSize, keyword, statusFilter,
    stats, selectedRowKeys, batchLoading, selectAll, syncLoading, exportLoading,
    setPage, setPageSize, setKeyword, setStatusFilter,
    setSelectedRowKeys, setSelectAll, loadStats, loadStrategicProducts,
    handleDelete, handleConfirm, handleBatchConfirm, handleBatchDelete,
    handleSyncCategory, handleExport,
  } = useStrategicProducts();

  // 品类树
  const {
    categoryTree, selectedCategoryPath, expandedKeys, setExpandedKeys,
    handleCategorySelect, loadCategoryTree,
  } = useCategoryTree();

  // 商品选择（添加弹窗）
  const productSelection = useProductSelection(() => {
    loadStrategicProducts(selectedCategoryPath, statusFilter, keyword);
    loadStats();
  });

  // 操作回调
  const { onSearch, onDelete, onConfirm, onBatchConfirm, onBatchDelete, onSyncCategory, onExport, refresh } = useProductActions({
    handleDelete, handleConfirm, handleBatchConfirm, handleBatchDelete,
    handleSyncCategory, handleExport,
    loadStrategicProducts, loadStats, loadCategoryTree,
    selectedCategoryPath, statusFilter, keyword,
    selectAll, selectedRowKeys, total, setPage,
  });

  // 加载商品列表
  useEffect(() => {
    loadStrategicProducts(selectedCategoryPath, statusFilter, keyword);
  }, [loadStrategicProducts, selectedCategoryPath, statusFilter, page, pageSize]);

  return (
    <div className={styles.container}>
      <CategorySidebar
        isMobile={isMobile}
        categoryDrawerVisible={categoryDrawerVisible}
        categoryTree={categoryTree}
        selectedCategoryPath={selectedCategoryPath}
        expandedKeys={expandedKeys}
        onExpand={setExpandedKeys}
        onCategorySelect={handleCategorySelect}
        onDrawerVisibleChange={setCategoryDrawerVisible}
      />

      <div className={styles.main}>
        <StatsCards stats={stats} />
        <Card className={styles.tableCard}>
          <StrategicProductTable
            dataSource={dataSource}
            total={total}
            page={page}
            pageSize={pageSize}
            keyword={keyword}
            statusFilter={statusFilter}
            loading={loading}
            batchLoading={batchLoading}
            selectAll={selectAll}
            selectedRowKeys={selectedRowKeys}
            syncLoading={syncLoading}
            exportLoading={exportLoading}
            onKeywordChange={setKeyword}
            onSearch={onSearch}
            onStatusFilterChange={setStatusFilter}
            onPageChange={(p, ps) => { setPage(p); setPageSize(ps); }}
            onSelectedRowKeysChange={setSelectedRowKeys}
            onSelectAllChange={setSelectAll}
            onConfirm={onConfirm}
            onDelete={onDelete}
            onBatchConfirm={onBatchConfirm}
            onBatchDelete={onBatchDelete}
            onAddClick={productSelection.openModal}
            onRefresh={() => loadStrategicProducts(selectedCategoryPath, statusFilter, keyword)}
            onSyncCategory={onSyncCategory}
            onExport={onExport}
          />
        </Card>
      </div>

      <AddProductModal
        visible={productSelection.modalVisible}
        categoryTree={productSelection.addCategoryTree}
        selectedCategoryPath={productSelection.selectedAddCategoryPath}
        products={productSelection.productsForSelection}
        selectedProductIds={productSelection.selectedProductIds}
        loading={productSelection.productsLoading}
        page={productSelection.productsPage}
        pageSize={productSelection.productsPageSize}
        total={productSelection.productsTotal}
        keyword={productSelection.productsKeyword}
        onClose={productSelection.closeModal}
        onCategorySelect={productSelection.handleAddCategorySelect}
        onKeywordChange={productSelection.setProductsKeyword}
        onSearch={productSelection.handleProductsSearch}
        onProductSelect={productSelection.handleProductSelect}
        onSelectAllPage={productSelection.handleSelectAllPage}
        onSelectAll={productSelection.handleSelectAll}
        onClearSelection={productSelection.handleClearSelection}
        onConfirm={productSelection.handleAddProducts}
        onPaginationChange={productSelection.handlePaginationChange}
      />
    </div>
  );
}
