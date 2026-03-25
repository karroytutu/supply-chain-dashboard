import React, { useState, useEffect, useCallback } from 'react';
import { Spin, Empty, Drawer } from 'antd';
import { getCategoryTree } from '@/services/api/dashboard';
import { dataCache, CACHE_KEYS, CACHE_TTL } from '@/utils/dataCache';
import type { CategoryTreeNode } from '@/services/api/dashboard';
import CategoryTable from './CategoryTable';
import ProductList from './ProductList';
import styles from './index.less';

const CategoryAvailabilityCard: React.FC = () => {
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<CategoryTreeNode[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<CategoryTreeNode | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      // 使用缓存获取品类树数据
      const result = await dataCache.getOrFetch<CategoryTreeNode[]>(
        CACHE_KEYS.CATEGORY_TREE,
        getCategoryTree,
        CACHE_TTL.CATEGORY_TREE
      );
      if (Array.isArray(result)) {
        setData(result);
      } else {
        console.error('品类树数据格式错误，期望数组但收到:', typeof result, result);
        setData([]);
      }
    } catch (error) {
      console.error('获取品类齐全率数据失败:', error);
      setData([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // 处理查看缺货商品
  const handleViewProducts = useCallback((item: CategoryTreeNode) => {
    setSelectedCategory(item);
  }, []);

  // 关闭抽屉
  const handleCloseDrawer = useCallback(() => {
    setSelectedCategory(null);
  }, []);

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <h3 className={styles.title}>品类库存齐全率分析</h3>
      </div>
      <div className={styles.content} style={{ minHeight: 340 }}>
        {loading ? (
          <div className={styles.loading}>
            <Spin />
          </div>
        ) : data.length === 0 ? (
          <Empty description="暂无数据" />
        ) : (
          <CategoryTable
            data={data}
            onViewProducts={handleViewProducts}
          />
        )}
      </div>
      <Drawer
        title={`缺货商品明细 - ${selectedCategory?.name || ''}`}
        placement="right"
        width={480}
        open={!!selectedCategory}
        onClose={handleCloseDrawer}
        destroyOnClose
      >
        {selectedCategory && (
          <ProductList
            categoryPath={selectedCategory.categoryPath}
            categoryName={selectedCategory.name}
            onBack={handleCloseDrawer}
            isDrawerMode
          />
        )}
      </Drawer>
    </div>
  );
};

export default CategoryAvailabilityCard;
