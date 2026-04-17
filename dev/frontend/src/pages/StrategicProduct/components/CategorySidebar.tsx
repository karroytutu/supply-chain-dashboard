import React from 'react';
import { Button, Drawer } from 'antd';
import { FilterOutlined } from '@ant-design/icons';
import CategoryTree from './CategoryTree';
import styles from '../index.less';

interface CategorySidebarProps {
  isMobile: boolean;
  categoryDrawerVisible: boolean;
  categoryTree: any[];
  selectedCategoryPath?: string;
  expandedKeys: string[];
  onExpand: (keys: string[]) => void;
  onCategorySelect: (keys: any, info: any) => void;
  onDrawerVisibleChange: (visible: boolean) => void;
}

const CategorySidebar: React.FC<CategorySidebarProps> = ({
  isMobile, categoryDrawerVisible, categoryTree, selectedCategoryPath,
  expandedKeys, onExpand, onCategorySelect, onDrawerVisibleChange,
}) => {
  // 移动端筛选按钮
  if (isMobile) {
    return (
      <>
        <Button
          className={styles.filterBtn}
          icon={<FilterOutlined />}
          onClick={() => onDrawerVisibleChange(true)}
        >
          品类筛选
        </Button>
        <Drawer
          title="品类筛选"
          placement="left"
          open={categoryDrawerVisible}
          onClose={() => onDrawerVisibleChange(false)}
          width="80%"
        >
          <CategoryTree
            tree={categoryTree}
            selectedPath={selectedCategoryPath}
            expandedKeys={expandedKeys}
            onExpand={onExpand}
            onSelect={(keys, info) => {
              onCategorySelect(keys, info);
              onDrawerVisibleChange(false);
            }}
          />
        </Drawer>
      </>
    );
  }

  // 桌面端侧边栏
  return (
    <CategoryTree
      tree={categoryTree}
      selectedPath={selectedCategoryPath}
      expandedKeys={expandedKeys}
      onExpand={onExpand}
      onSelect={onCategorySelect}
    />
  );
};

export default CategorySidebar;
