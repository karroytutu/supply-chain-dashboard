/**
 * PermissionTree 组件类型定义
 */
import type { DataNode } from 'antd/es/tree';

// 权限项数据结构
export interface PermissionItem {
  id: number;
  code: string;
  name: string;
  children?: PermissionItem[];
}

// 组件属性
export interface PermissionTreeProps {
  /** 权限树数据 */
  treeData: PermissionItem[];
  /** 选中的权限ID列表 */
  value?: number[];
  /** 选中变化回调 */
  onChange?: (keys: number[]) => void;
  /** 是否默认展开全部 */
  defaultExpandAll?: boolean;
  /** 树高度 */
  height?: number;
  /** 搜索框占位符 */
  placeholder?: string;
}

// 导出 antd Tree 的类型，供外部使用
export type { DataNode };
