/**
 * 战略商品管理页面
 */
import { useEffect, useCallback } from 'react';
import Card from 'antd/es/card';
import styles from './index.less';

// Hooks
import { useStrategicProducts } from './hooks/useStrategicProducts';
import { useCategoryTree } from './hooks/useCategoryTree';
import { useProductSelection } from './hooks/useProductSelection';

// Components
import StatsCards from './components/StatsCards';
import CategoryTree from './components/CategoryTree';
import StrategicProductTable from './components/StrategicProductTable';
import AddProductModal from './components/AddProductModal';

export default function StrategicProductManage() {
  // 商品数据和操作
  const {
    loading,
    dataSource,
    total,
    page,
    pageSize,
    keyword,
    statusFilter,
    stats,
    selectedRowKeys,
    batchLoading,
    selectAll,
    setPage,
    setPageSize,
    setKeyword,
    setStatusFilter,
    setSelectedRowKeys,
    setSelectAll,
    loadStats,
    loadStrategicProducts,
    handleDelete,
    handleConfirm,
    handleBatchConfirm,
    handleBatchDelete,
  } = useStrategicProducts();

  // 品类树
  const {
    categoryTree,
    selectedCategoryPath,
    expandedKeys,
    setExpandedKeys,
    handleCategorySelect,
  } = useCategoryTree();

  // 商品选择（添加弹窗）
  const productSelection = useProductSelection(() => {
    loadStrategicProducts(selectedCategoryPath, statusFilter, keyword);
    loadStats();
  });

  // 加载商品列表
  useEffect(() => {
    loadStrategicProducts(selectedCategoryPath, statusFilter, keyword);
  }, [loadStrategicProducts, selectedCategoryPath, statusFilter, page, pageSize]);

  // 搜索
  const handleSearch = useCallback(() => {
    setPage(1);
    loadStrategicProducts(selectedCategoryPath, statusFilter, keyword);
  }, [loadStrategicProducts, selectedCategoryPath, statusFilter, keyword, setPage]);

  // 删除后刷新
  const onDelete = useCallback(async (id: number) => {
    const success = await handleDelete(id);
    if (success) {
      loadStrategicProducts(selectedCategoryPath, statusFilter, keyword);
      loadStats();
    }
  }, [handleDelete, loadStrategicProducts, loadStats, selectedCategoryPath, statusFilter, keyword]);

  // 确认后刷新
  const onConfirm = useCallback(async (record: any, confirmed: boolean) => {
    const success = await handleConfirm(record, confirmed);
    if (success) {
      loadStrategicProducts(selectedCategoryPath, statusFilter, keyword);
      loadStats();
    }
  }, [handleConfirm, loadStrategicProducts, loadStats, selectedCategoryPath, statusFilter, keyword]);

  // 批量确认
  const onBatchConfirm = useCallback(async (action: 'confirm' | 'reject') => {
    const success = await handleBatchConfirm(action, selectedCategoryPath);
    if (success) {
      loadStrategicProducts(selectedCategoryPath, statusFilter, keyword);
      loadStats();
    }
  }, [handleBatchConfirm, loadStrategicProducts, loadStats, selectedCategoryPath, statusFilter, keyword]);

  // 批量删除
  const onBatchDelete = useCallback(async () => {
    const confirmContent = selectAll
      ? `确定要删除全部 ${total} 个符合条件的战略商品吗？`
      : `确定要删除选中的 ${selectedRowKeys.length} 个战略商品吗？`;

    // 简单确认
    if (!window.confirm(confirmContent)) return;

    const success = await handleBatchDelete(selectedCategoryPath);
    if (success) {
      loadStrategicProducts(selectedCategoryPath, statusFilter, keyword);
      loadStats();
    }
  }, [handleBatchDelete, loadStrategicProducts, loadStats, selectedCategoryPath, statusFilter, keyword, selectAll, selectedRowKeys.length, total]);

  return (
    <div className={styles.container}>
      {/* 左侧品类树 */}
      <CategoryTree
        tree={categoryTree}
        selectedPath={selectedCategoryPath}
        expandedKeys={expandedKeys}
        onExpand={setExpandedKeys}
        onSelect={handleCategorySelect}
      />

      {/* 右侧主内容区 */}
      <div className={styles.main}>
        {/* 统计卡片 */}
        <StatsCards stats={stats} />

        {/* 商品列表 */}
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
            onKeywordChange={setKeyword}
            onSearch={handleSearch}
            onStatusFilterChange={setStatusFilter}
            onPageChange={(p, ps) => {
              setPage(p);
              setPageSize(ps);
            }}
            onSelectedRowKeysChange={setSelectedRowKeys}
            onSelectAllChange={setSelectAll}
            onConfirm={onConfirm}
            onDelete={onDelete}
            onBatchConfirm={onBatchConfirm}
            onBatchDelete={onBatchDelete}
            onAddClick={productSelection.openModal}
            onRefresh={() => loadStrategicProducts(selectedCategoryPath, statusFilter, keyword)}
          />
        </Card>
      </div>

      {/* 添加商品弹窗 */}
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
