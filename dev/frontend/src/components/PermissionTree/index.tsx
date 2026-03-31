/**
 * 权限树公共组件
 * 支持搜索、展开控制、高亮匹配
 */
import React, { useState, useMemo, useCallback } from 'react';
import { Tree, Input, Button, Space, Empty } from 'antd';
import { SearchOutlined, DownOutlined } from '@ant-design/icons';
import type { TreeProps, DataNode } from 'antd/es/tree';
import styles from './index.less';
import type { PermissionTreeProps } from './types';
import {
  convertToTreeData,
  getAllKeys,
  getParentKeys,
  getMatchedKeys,
} from './utils';

const PermissionTree: React.FC<PermissionTreeProps> = ({
  treeData,
  value = [],
  onChange,
  defaultExpandAll = false,
  height = 400,
  placeholder = '搜索权限名称或编码',
}) => {
  const [searchValue, setSearchValue] = useState('');
  const [expandedKeys, setExpandedKeys] = useState<React.Key[]>(() =>
    defaultExpandAll ? getAllKeys(treeData) : []
  );
  const [autoExpandParent, setAutoExpandParent] = useState(true);

  // 所有节点 key
  const allKeys = useMemo(() => getAllKeys(treeData), [treeData]);

  // 匹配的节点 key（用于高亮）
  const matchedKeys = useMemo(
    () => (searchValue ? getMatchedKeys(treeData, searchValue) : []),
    [treeData, searchValue]
  );

  // Tree 数据
  const treeDataNodes = useMemo(() => convertToTreeData(treeData), [treeData]);

  // 搜索处理
  const handleSearch = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const { value } = e.target;
    setSearchValue(value);
    if (value) {
      const newExpandedKeys = getParentKeys(treeData, value);
      setExpandedKeys(newExpandedKeys);
      setAutoExpandParent(true);
    }
  }, [treeData]);

  // 展开全部
  const handleExpandAll = useCallback(() => {
    setExpandedKeys(allKeys);
    setAutoExpandParent(false);
  }, [allKeys]);

  // 收起全部
  const handleCollapseAll = useCallback(() => {
    setExpandedKeys([]);
    setAutoExpandParent(false);
  }, []);

  // 选中处理
  const handleCheck: TreeProps['onCheck'] = (checkedKeys) => {
    onChange?.(checkedKeys as number[]);
  };

  // 展开处理
  const handleExpand: TreeProps['onExpand'] = (expandedKeys) => {
    setExpandedKeys(expandedKeys);
    setAutoExpandParent(false);
  };

  // 自定义 title 渲染（支持高亮）
  const renderTitle = useCallback(
    (node: DataNode) => {
      const title = node.title as string;
      if (!searchValue) return title;

      const index = title.toLowerCase().indexOf(searchValue.toLowerCase());
      if (index === -1) return title;

      const beforeStr = title.substring(0, index);
      const matchStr = title.substring(index, index + searchValue.length);
      const afterStr = title.substring(index + searchValue.length);

      return (
        <span>
          {beforeStr}
          <span className={styles.highlight}>{matchStr}</span>
          {afterStr}
        </span>
      );
    },
    [searchValue]
  );

  return (
    <div className={styles.container}>
      <div className={styles.toolbar}>
        <Input
          placeholder={placeholder}
          prefix={<SearchOutlined />}
          value={searchValue}
          onChange={handleSearch}
          allowClear
          className={styles.searchInput}
        />
        <Space size="small">
          <Button size="small" onClick={handleExpandAll}>
            展开全部
          </Button>
          <Button size="small" onClick={handleCollapseAll}>
            收起全部
          </Button>
        </Space>
      </div>

      <div className={styles.treeWrapper} style={{ height }}>
        {treeData.length === 0 ? (
          <Empty description="暂无权限数据" />
        ) : (
          <Tree
            checkable
            checkedKeys={value}
            expandedKeys={expandedKeys}
            autoExpandParent={autoExpandParent}
            onCheck={handleCheck}
            onExpand={handleExpand}
            treeData={treeDataNodes}
            titleRender={renderTitle}
            switcherIcon={<DownOutlined />}
            className={styles.tree}
          />
        )}
      </div>

      {searchValue && matchedKeys.length > 0 && (
        <div className={styles.searchInfo}>
          找到 {matchedKeys.length} 个匹配项
        </div>
      )}
    </div>
  );
};

export default PermissionTree;
