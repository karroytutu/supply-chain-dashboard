/**
 * 通用部门树形选择器
 * 用于用户管理页面的部门筛选等场景
 */
import { useState, useEffect } from 'react';
import { TreeSelect, Spin } from 'antd';
import { getDeptTree, type DeptTreeNode } from '@/services/api/org';

interface DeptTreeSelectProps {
  value?: string;
  onChange?: (value: string | undefined) => void;
  placeholder?: string;
  style?: React.CSSProperties;
  allowClear?: boolean;
}

/** 将部门树转为 TreeSelect 所需的 treeData 格式 */
function toTreeSelectData(nodes: DeptTreeNode[]): any[] {
  return nodes.map(node => ({
    value: node.dingtalkDeptId,
    title: `${node.name} (${node.userCount})`,
    children: node.children.length > 0 ? toTreeSelectData(node.children) : [],
  }));
}

export default function DeptTreeSelect({
  value,
  onChange,
  placeholder = '选择部门',
  style,
  allowClear = true,
}: DeptTreeSelectProps) {
  const [treeData, setTreeData] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const data = await getDeptTree();
        if (!cancelled) {
          setTreeData(toTreeSelectData(data));
        }
      } catch {
        if (!cancelled) setError(true);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // 无权限或加载失败时隐藏筛选器
  if (error) return null;

  if (loading && treeData.length === 0) {
    return <Spin size="small" />;
  }

  return (
    <TreeSelect
      value={value}
      onChange={onChange}
      treeData={treeData}
      placeholder={placeholder}
      style={style}
      allowClear={allowClear}
      showSearch
      treeNodeFilterProp="title"
      treeDefaultExpandAll={false}
    />
  );
}