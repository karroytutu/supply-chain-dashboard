/**
 * PermissionTree 工具函数
 */
import type { DataNode } from 'antd/es/tree';
import type { PermissionItem } from './types';

/**
 * 转换权限数据为 Tree 格式
 */
export const convertToTreeData = (items: PermissionItem[]): DataNode[] => {
  return items.map(item => ({
    key: item.id,
    title: item.name,
    children: item.children ? convertToTreeData(item.children) : undefined,
  }));
};

/**
 * 获取所有节点的 key
 */
export const getAllKeys = (items: PermissionItem[]): React.Key[] => {
  const keys: React.Key[] = [];
  const traverse = (nodes: PermissionItem[]) => {
    nodes.forEach(node => {
      keys.push(node.id);
      if (node.children) traverse(node.children);
    });
  };
  traverse(items);
  return keys;
};

/**
 * 获取匹配节点的所有父级 key（用于搜索时自动展开）
 */
export const getParentKeys = (
  items: PermissionItem[],
  searchValue: string,
  parentKeys: React.Key[] = []
): React.Key[] => {
  const result: React.Key[] = [];
  items.forEach(item => {
    const match =
      item.name.toLowerCase().includes(searchValue.toLowerCase()) ||
      item.code.toLowerCase().includes(searchValue.toLowerCase());
    if (match) {
      result.push(...parentKeys);
    }
    if (item.children) {
      result.push(...getParentKeys(item.children, searchValue, [...parentKeys, item.id]));
    }
  });
  return [...new Set(result)];
};

/**
 * 获取匹配的节点 key（用于高亮和统计）
 */
export const getMatchedKeys = (
  items: PermissionItem[],
  searchValue: string
): React.Key[] => {
  const result: React.Key[] = [];
  const traverse = (nodes: PermissionItem[]) => {
    nodes.forEach(node => {
      const match =
        node.name.toLowerCase().includes(searchValue.toLowerCase()) ||
        node.code.toLowerCase().includes(searchValue.toLowerCase());
      if (match) result.push(node.id);
      if (node.children) traverse(node.children);
    });
  };
  traverse(items);
  return result;
};

/**
 * 获取模块下所有权限 ID
 */
export const getModulePermissionIds = (items: PermissionItem[]): number[] => {
  const ids: number[] = [];
  const traverse = (nodes: PermissionItem[]) => {
    nodes.forEach(node => {
      ids.push(node.id);
      if (node.children) traverse(node.children);
    });
  };
  traverse(items);
  return ids;
};

/**
 * 按模块分组权限
 */
export const groupByModule = (items: PermissionItem[]): Map<string, PermissionItem[]> => {
  const groups = new Map<string, PermissionItem[]>();
  
  items.forEach(item => {
    // 从权限编码中提取模块：system:user:read -> system
    const moduleCode = item.code.split(':')[0];
    if (!groups.has(moduleCode)) {
      groups.set(moduleCode, []);
    }
    groups.get(moduleCode)!.push(item);
  });
  
  return groups;
};
