/**
 * 品类树数据管理 Hook
 */
import { useState, useEffect, useCallback } from 'react';
import type { TreeProps } from 'antd';
import { getCategoryTree } from '@/services/api/strategic-product';
import type { CategoryNode } from '@/types/strategic-product';

export function useCategoryTree() {
  const [categoryTree, setCategoryTree] = useState<CategoryNode[]>([]);
  const [selectedCategoryPath, setSelectedCategoryPath] = useState<string | undefined>();
  const [expandedKeys, setExpandedKeys] = useState<string[]>([]);

  // 加载品类树
  const loadCategoryTree = useCallback(async (forceRefresh = false) => {
    try {
      const result = await getCategoryTree(forceRefresh);
      setCategoryTree(result);
      // 默认展开第一级
      const firstLevelKeys = result.map(node => node.key);
      setExpandedKeys(firstLevelKeys);
    } catch (error) {
      console.error('加载品类树失败:', error);
    }
  }, []);

  useEffect(() => {
    loadCategoryTree();
  }, [loadCategoryTree]);

  // 品类树选择处理
  const handleCategorySelect: TreeProps['onSelect'] = useCallback((selectedKeys: React.Key[]) => {
    const categoryPath = selectedKeys[0] as string | undefined;
    setSelectedCategoryPath(categoryPath);
  }, []);

  // 清空选择
  const clearSelection = useCallback(() => {
    setSelectedCategoryPath(undefined);
  }, []);

  return {
    categoryTree,
    selectedCategoryPath,
    expandedKeys,
    setExpandedKeys,
    handleCategorySelect,
    clearSelection,
    loadCategoryTree,
  };
}

/**
 * 转换品类树数据为 antd Tree 格式
 */
export function convertToTreeData(nodes: CategoryNode[]): any[] {
  return nodes.map(node => ({
    key: node.key,
    title: node.name,
    children: node.children ? convertToTreeData(node.children) : undefined,
  }));
}
