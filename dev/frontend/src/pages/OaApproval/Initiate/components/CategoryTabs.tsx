/**
 * 分类 Tab 栏组件 - Tab 筛选 + 搜索
 */
import React from 'react';
import { Input } from 'antd';
import { SearchOutlined } from '@ant-design/icons';
import type { FormCategory } from '@/types/oa-approval';
import { CATEGORY_LABELS } from '@/types/oa-approval';
import styles from './CategoryTabs.less';

export type ActiveCategory = FormCategory | 'all';

interface CategoryTabsProps {
  activeCategory: ActiveCategory;
  onCategoryChange: (category: ActiveCategory) => void;
  categoryCounts: Record<FormCategory, number>;
  searchText: string;
  onSearchChange: (text: string) => void;
}

const TAB_ITEMS: ActiveCategory[] = ['all', 'finance', 'supply_chain', 'marketing', 'hr', 'admin'];

const CategoryTabs: React.FC<CategoryTabsProps> = ({
  activeCategory,
  onCategoryChange,
  categoryCounts,
  searchText,
  onSearchChange,
}) => (
  <div className={styles.tabPanel}>
    <div className={styles.tabBar}>
      <div className={styles.tabList}>
        {TAB_ITEMS.map((key) => {
          const isActive = activeCategory === key;
          const label = key === 'all' ? '全部' : CATEGORY_LABELS[key as FormCategory];
          const count = key === 'all'
            ? Object.values(categoryCounts).reduce((sum, c) => sum + c, 0)
            : categoryCounts[key as FormCategory];

          return (
            <span
              key={key}
              className={`${styles.tabItem} ${isActive ? styles.tabItemActive : ''}`}
              onClick={() => onCategoryChange(key)}
            >
              {label}
              <span className={styles.tabCount}>({count})</span>
            </span>
          );
        })}
      </div>
      <Input
        className={styles.searchInput}
        placeholder="搜索表单类型..."
        prefix={<SearchOutlined />}
        value={searchText}
        onChange={(e) => onSearchChange(e.target.value)}
        allowClear
      />
    </div>
  </div>
);

export default CategoryTabs;
