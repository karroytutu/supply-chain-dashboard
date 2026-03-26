/**
 * 商品选择管理 Hook
 */
import { useState, useCallback } from 'react';
import { message } from 'antd';
import type { TreeProps } from 'antd';
import { getCategoryTree, getProductsForSelection, addStrategicProducts } from '@/services/api/strategic-product';
import type { CategoryNode, SelectableProduct } from '@/types/strategic-product';

export function useProductSelection(onSuccess?: () => void) {
  // 弹窗状态
  const [modalVisible, setModalVisible] = useState(false);

  // 品类树
  const [addCategoryTree, setAddCategoryTree] = useState<CategoryNode[]>([]);
  const [selectedAddCategoryPath, setSelectedAddCategoryPath] = useState<string | undefined>();

  // 商品列表
  const [productsForSelection, setProductsForSelection] = useState<SelectableProduct[]>([]);
  const [selectedProductIds, setSelectedProductIds] = useState<string[]>([]);
  const [productsLoading, setProductsLoading] = useState(false);
  const [productsPage, setProductsPage] = useState(1);
  const [productsPageSize, setProductsPageSize] = useState(10);
  const [productsTotal, setProductsTotal] = useState(0);
  const [productsKeyword, setProductsKeyword] = useState('');

  // 打开添加商品弹窗
  const openModal = useCallback(async () => {
    setModalVisible(true);
    setProductsKeyword('');
    setSelectedProductIds([]);
    try {
      const result = await getCategoryTree();
      setAddCategoryTree(result);
    } catch (error) {
      console.error('加载品类树失败:', error);
    }
  }, []);

  // 关闭弹窗
  const closeModal = useCallback(() => {
    setModalVisible(false);
    setSelectedProductIds([]);
    setSelectedAddCategoryPath(undefined);
    setProductsForSelection([]);
    setProductsPage(1);
    setProductsTotal(0);
    setProductsKeyword('');
  }, []);

  // 加载可选商品
  const loadProductsForSelection = useCallback(async (
    categoryPath: string,
    page = 1,
    pageSize = 10,
    keyword = ''
  ) => {
    setProductsLoading(true);
    try {
      const result = await getProductsForSelection(categoryPath, { page, pageSize, keyword: keyword || undefined });
      setProductsForSelection(result.data);
      setProductsTotal(result.total);
      setProductsPage(page);
      setProductsPageSize(pageSize);
    } catch (error) {
      console.error('加载商品列表失败:', error);
      setProductsForSelection([]);
      setProductsTotal(0);
    } finally {
      setProductsLoading(false);
    }
  }, []);

  // 添加弹窗品类选择
  const handleAddCategorySelect: TreeProps['onSelect'] = useCallback((selectedKeys: React.Key[]) => {
    const categoryPath = selectedKeys[0] as string | undefined;
    setSelectedAddCategoryPath(categoryPath);
    setSelectedProductIds([]);
    setProductsKeyword('');
    if (categoryPath) {
      loadProductsForSelection(categoryPath, 1, productsPageSize, '');
    } else {
      setProductsForSelection([]);
      setProductsTotal(0);
    }
  }, [loadProductsForSelection, productsPageSize]);

  // 弹窗商品搜索
  const handleProductsSearch = useCallback(() => {
    setProductsPage(1);
    loadProductsForSelection(selectedAddCategoryPath || '', 1, productsPageSize, productsKeyword);
  }, [loadProductsForSelection, selectedAddCategoryPath, productsPageSize, productsKeyword]);

  // 商品选择
  const handleProductSelect = useCallback((goodsId: string, checked: boolean) => {
    if (checked) {
      setSelectedProductIds(prev => [...prev, goodsId]);
    } else {
      setSelectedProductIds(prev => prev.filter(id => id !== goodsId));
    }
  }, []);

  // 全选本页
  const handleSelectAllPage = useCallback(() => {
    const pageIds = productsForSelection.map(p => p.goodsId);
    setSelectedProductIds(prev => [...new Set([...prev, ...pageIds])]);
  }, [productsForSelection]);

  // 全选全部
  const handleSelectAll = useCallback(async () => {
    if (!selectedAddCategoryPath) return;
    
    setProductsLoading(true);
    try {
      const result = await getProductsForSelection(selectedAddCategoryPath, { page: 1, pageSize: 9999 });
      const allIds = result.data.map(p => p.goodsId);
      setSelectedProductIds(allIds);
      message.success(`已选择全部 ${allIds.length} 个商品`);
    } catch (error) {
      console.error('获取全部商品失败:', error);
      message.error('获取全部商品失败');
    } finally {
      setProductsLoading(false);
    }
  }, [selectedAddCategoryPath]);

  // 取消全选
  const handleClearSelection = useCallback(() => {
    setSelectedProductIds([]);
  }, []);

  // 确认添加商品
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

  // 分页变化
  const handlePaginationChange = useCallback((page: number, pageSize: number) => {
    loadProductsForSelection(selectedAddCategoryPath || '', page, pageSize, productsKeyword);
  }, [loadProductsForSelection, selectedAddCategoryPath, productsKeyword]);

  return {
    // 状态
    modalVisible,
    addCategoryTree,
    selectedAddCategoryPath,
    productsForSelection,
    selectedProductIds,
    productsLoading,
    productsPage,
    productsPageSize,
    productsTotal,
    productsKeyword,
    // 设置函数
    setProductsKeyword,
    // 操作函数
    openModal,
    closeModal,
    handleAddCategorySelect,
    handleProductsSearch,
    handleProductSelect,
    handleSelectAllPage,
    handleSelectAll,
    handleClearSelection,
    handleAddProducts,
    handlePaginationChange,
  };
}
