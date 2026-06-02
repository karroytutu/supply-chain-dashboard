/**
 * 商品选择管理 Hook - 组合入口
 * 数据加载 → useProductSelectionData
 * 选择操作 → useProductSelectionActions
 */
import { useProductSelectionData } from './useProductSelectionData';
import { useProductSelectionActions } from './useProductSelectionActions';

export function useProductSelection(onSuccess?: () => void) {
  const data = useProductSelectionData();
  const actions = useProductSelectionActions(data, onSuccess);

  return {
    // 状态
    modalVisible: actions.modalVisible,
    addCategoryTree: data.addCategoryTree,
    selectedAddCategoryPath: data.selectedAddCategoryPath,
    productsForSelection: data.productsForSelection,
    selectedProductIds: actions.selectedProductIds,
    productsLoading: data.productsLoading,
    productsPage: data.productsPage,
    productsPageSize: data.productsPageSize,
    productsTotal: data.productsTotal,
    productsKeyword: actions.productsKeyword,
    // 设置函数
    setProductsKeyword: actions.handleProductsSearch,
    // 操作函数
    openModal: actions.openModal,
    closeModal: actions.closeModal,
    handleAddCategorySelect: data.handleAddCategorySelect,
    handleProductsSearch: actions.handleProductsSearch,
    handleProductSelect: actions.handleProductSelect,
    handleSelectAllPage: actions.handleSelectAllPage,
    handleSelectAll: actions.handleSelectAll,
    handleClearSelection: actions.handleClearSelection,
    handleAddProducts: actions.handleAddProducts,
    handlePaginationChange: actions.handlePaginationChange,
  };
}
