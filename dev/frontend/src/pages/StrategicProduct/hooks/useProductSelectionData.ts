import { useState, useCallback } from 'react';
import {  type TreeProps } from 'antd';
import { getCategoryTree, getProductsForSelection } from '@/services/api/strategic-product';
import type { CategoryNode, SelectableProduct } from '@/types/strategic-product';
import { createLogger } from '../../../utils/logger';
const log = createLogger('StrategicProducthooks');

export interface ProductSelectionData {
  addCategoryTree: CategoryNode[];
  selectedAddCategoryPath: string | undefined;
  productsForSelection: SelectableProduct[];
  productsLoading: boolean;
  productsPage: number;
  productsPageSize: number;
  productsTotal: number;
  setSelectedAddCategoryPath: (path: string | undefined) => void;
  setProductsKeyword: (keyword: string) => void;
  loadProductsForSelection: (categoryPath: string, page?: number, pageSize?: number, keyword?: string) => Promise<void>;
  loadCategoryTree: () => Promise<void>;
  handleAddCategorySelect: TreeProps['onSelect'];
  resetData: () => void;
}

export function useProductSelectionData(): ProductSelectionData {
  const [addCategoryTree, setAddCategoryTree] = useState<CategoryNode[]>([]);
  const [selectedAddCategoryPath, setSelectedAddCategoryPath] = useState<string | undefined>();
  const [productsForSelection, setProductsForSelection] = useState<SelectableProduct[]>([]);
  const [productsLoading, setProductsLoading] = useState(false);
  const [productsPage, setProductsPage] = useState(1);
  const [productsPageSize, setProductsPageSize] = useState(10);
  const [productsTotal, setProductsTotal] = useState(0);
  const [productsKeyword, setProductsKeyword] = useState('');

  const loadCategoryTree = useCallback(async () => {
    try {
      const result = await getCategoryTree();
      setAddCategoryTree(result);
    } catch (error) {
      log.error('加载品类树失败:', error);
    }
  }, []);

  const loadProductsForSelection = useCallback(async (
    categoryPath: string, page = 1, pageSize = 10, keyword = ''
  ) => {
    setProductsLoading(true);
    try {
      const result = await getProductsForSelection(categoryPath, { page, pageSize, keyword: keyword || undefined });
      setProductsForSelection(result.data);
      setProductsTotal(result.total);
      setProductsPage(page);
      setProductsPageSize(pageSize);
    } catch (error) {
      log.error('加载商品列表失败:', error);
      setProductsForSelection([]);
      setProductsTotal(0);
    } finally {
      setProductsLoading(false);
    }
  }, []);

  const handleAddCategorySelect: TreeProps['onSelect'] = useCallback((selectedKeys: React.Key[]) => {
    const categoryPath = selectedKeys[0] as string | undefined;
    setSelectedAddCategoryPath(categoryPath);
    setProductsKeyword('');
    if (categoryPath) {
      loadProductsForSelection(categoryPath, 1, productsPageSize, '');
    } else {
      setProductsForSelection([]);
      setProductsTotal(0);
    }
  }, [loadProductsForSelection, productsPageSize]);

  const resetData = useCallback(() => {
    setSelectedAddCategoryPath(undefined);
    setProductsForSelection([]);
    setProductsPage(1);
    setProductsTotal(0);
    setProductsKeyword('');
  }, []);

  return {
    addCategoryTree, selectedAddCategoryPath, productsForSelection,
    productsLoading, productsPage, productsPageSize, productsTotal,
    setSelectedAddCategoryPath, setProductsKeyword,
    loadProductsForSelection, loadCategoryTree, handleAddCategorySelect, resetData,
  };
}
