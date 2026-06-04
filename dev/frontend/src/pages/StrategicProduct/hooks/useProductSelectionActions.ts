import { useState, useCallback } from 'react';
import { message } from 'antd';
import { getProductsForSelection, addStrategicProducts } from '@/services/api/strategic-product';
import type { } from '@/types/strategic-product';
import type { ProductSelectionData } from './useProductSelectionData';
import { createLogger } from '../../../utils/logger';
const log = createLogger('StrategicProducthooks');

export interface ProductSelectionActions {
  modalVisible: boolean;
  selectedProductIds: string[];
  productsKeyword: string;
  openModal: () => Promise<void>;
  closeModal: () => void;
  handleProductsSearch: () => void;
  handleProductSelect: (goodsId: string, checked: boolean) => void;
  handleSelectAllPage: () => void;
  handleSelectAll: () => Promise<void>;
  handleClearSelection: () => void;
  handleAddProducts: () => Promise<boolean>;
  handlePaginationChange: (page: number, pageSize: number) => void;
}

export function useProductSelectionActions(
  data: ProductSelectionData,
  onSuccess?: () => void,
): ProductSelectionActions {
  const [modalVisible, setModalVisible] = useState(false);
  const [selectedProductIds, setSelectedProductIds] = useState<string[]>([]);
  const [productsKeyword, setProductsKeyword] = useState('');

  const openModal = useCallback(async () => {
    setModalVisible(true);
    setProductsKeyword('');
    setSelectedProductIds([]);
    await data.loadCategoryTree();
  // eslint-disable-next-line react-hooks/exhaustive-deps -- 依赖稳定无需重复触发
  }, [data.loadCategoryTree]);

  const closeModal = useCallback(() => {
    setModalVisible(false);
    setSelectedProductIds([]);
    setProductsKeyword('');
    data.resetData();
  // eslint-disable-next-line react-hooks/exhaustive-deps -- 依赖稳定无需重复触发
  }, [data.resetData]);

  const handleProductsSearch = useCallback(() => {
    data.loadProductsForSelection(data.selectedAddCategoryPath || '', 1, data.productsPageSize, productsKeyword);
  // eslint-disable-next-line react-hooks/exhaustive-deps -- 依赖稳定无需重复触发
  }, [data.loadProductsForSelection, data.selectedAddCategoryPath, data.productsPageSize, productsKeyword]);

  const handleProductSelect = useCallback((goodsId: string, checked: boolean) => {
    if (checked) {
      setSelectedProductIds(prev => [...prev, goodsId]);
    } else {
      setSelectedProductIds(prev => prev.filter(id => id !== goodsId));
    }
  }, []);

  const handleSelectAllPage = useCallback(() => {
    const pageIds = data.productsForSelection.map(p => p.goodsId);
    setSelectedProductIds(prev => [...new Set([...prev, ...pageIds])]);
  }, [data.productsForSelection]);

  const handleSelectAll = useCallback(async () => {
    if (!data.selectedAddCategoryPath) return;
    try {
      const result = await getProductsForSelection(data.selectedAddCategoryPath, { page: 1, pageSize: 9999 });
      const allIds = result.data.map(p => p.goodsId);
      setSelectedProductIds(allIds);
      message.success(`已选择全部 ${allIds.length} 个商品`);
    } catch (error) {
      log.error('获取全部商品失败:', error);
      message.error('获取全部商品失败');
    }
  }, [data.selectedAddCategoryPath]);

  const handleClearSelection = useCallback(() => {
    setSelectedProductIds([]);
  }, []);

  const handleAddProducts = useCallback(async () => {
    if (selectedProductIds.length === 0) {
      message.warning('请选择至少一个商品');
      return false;
    }
    try {
      const result = await addStrategicProducts({ goodsIds: selectedProductIds });
      const addedCount = result.addedCount ?? 0;
      message.success(`成功添加 ${addedCount} 个战略商品`);
      closeModal();
      onSuccess?.();
      return true;
    } catch (error) {
      message.error('添加失败');
      return false;
    }
  }, [selectedProductIds, closeModal, onSuccess]);

  const handlePaginationChange = useCallback((page: number, pageSize: number) => {
    data.loadProductsForSelection(data.selectedAddCategoryPath || '', page, pageSize, productsKeyword);
  // eslint-disable-next-line react-hooks/exhaustive-deps -- 依赖稳定无需重复触发
  }, [data.loadProductsForSelection, data.selectedAddCategoryPath, productsKeyword]);

  return {
    modalVisible, selectedProductIds, productsKeyword,
    openModal, closeModal, handleProductsSearch, handleProductSelect,
    handleSelectAllPage, handleSelectAll, handleClearSelection,
    handleAddProducts, handlePaginationChange,
  };
}
