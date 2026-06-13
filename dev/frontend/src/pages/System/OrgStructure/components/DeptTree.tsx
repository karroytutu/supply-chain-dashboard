import { Tree, Spin } from 'antd';

const DirectoryTree = Tree.DirectoryTree;
import type { DeptTreeNode } from '@/services/api/org';

interface DeptTreeProps {
  treeData: DeptTreeNode[];
  loading: boolean;
  onSelect: (dingtalkDeptId: string, name: string) => void;
}

/** 将 API 树数据转为 Ant Design DirectoryTree 所需格式 */
function toAntTreeData(nodes: DeptTreeNode[]): any[] {
  return nodes.map(node => ({
    key: node.dingtalkDeptId,
    title: `${node.name} ${node.userCount}`,
    children: node.children.length > 0 ? toAntTreeData(node.children) : [],
  }));
}

export default function DeptTree({ treeData, loading, onSelect }: DeptTreeProps) {
  if (loading) {
    return <Spin style={{ display: 'block', margin: '40px auto' }} />;
  }

  return (
    <DirectoryTree
      treeData={toAntTreeData(treeData)}
      onSelect={(keys, info) => {
        if (info.node) {
          const key = keys[0] as string;
          const title = (info.node.title as string) || '';
          const name = title.replace(/\s+\d+$/, ''); // 去掉末尾人数
          onSelect(key, name);
        }
      }}
      defaultExpandAll={false}
    />
  );
}