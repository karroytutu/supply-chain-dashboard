/**
 * 考核分类 Tab 组件
 */
import React from 'react';
import { Tabs, Badge } from 'antd';

interface CategoryTabsProps {
  category: AssessmentCategory;
  stats: AssessmentStats;
  onChange: (category: AssessmentCategory) => void;
}

const CategoryTabs: React.FC<CategoryTabsProps> = ({ category, stats, onChange }) => {
  const items = [
    {
      key: 'return_order',
      label: (
        <span>
          退货考核
          {category === 'return_order' && stats.pendingCount > 0 && (
            <Badge count={stats.pendingCount} size="small" style={{ marginLeft: 8 }} />
          )}
        </span>
      ),
    },
  ];

  return (
    <Tabs
      activeKey={category}
      onChange={(key) => onChange(key as AssessmentCategory)}
      items={items}
    />
  );
};

export default CategoryTabs;
