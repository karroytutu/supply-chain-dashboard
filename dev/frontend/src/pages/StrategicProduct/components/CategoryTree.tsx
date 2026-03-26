/**
 * 品类树侧边栏组件
 */
import React from 'react';
import { Card, Tree } from 'antd';
import type { TreeProps } from 'antd';
import type { CategoryNode } from '@/types/strategic-product';
import styles from '../index.less';

interface CategoryTreeProps {
  tree: CategoryNode[];
  selectedPath?: string;
  expandedKeys: string[];
  onExpand: (keys: string[]) => void;
  onSelect: TreeProps['onSelect'];
}

/**
 * 转换品类树数据为 antd Tree 格式
 */
const convertToTreeData = (nodes: CategoryNode[]): any[] => {
  return nodes.map(node => ({
    key: node.key,
    title: node.name,
    children: node.children ? convertToTreeData(node.children) : undefined,
  }));
};

const CategoryTree: React.FC<CategoryTreeProps> = ({
  tree,
  selectedPath,
  expandedKeys,
  onExpand,
  onSelect,
}) => {
  return (
    <div className={styles.sidebar}>
      <Card title="品类筛选" size="small" className={styles.categoryCard}>
        <Tree
          treeData={convertToTreeData(tree)}
          selectedKeys={selectedPath ? [selectedPath] : []}
          expandedKeys={expandedKeys}
          onExpand={(keys) => onExpand(keys as string[])}
          onSelect={onSelect}
          showLine
        />
      </Card>
    </div>
  );
};

export default CategoryTree;
