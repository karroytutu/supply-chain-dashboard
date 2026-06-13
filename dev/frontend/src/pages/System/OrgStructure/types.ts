import type { DeptTreeNode, DeptUserItem, UserBrief } from '@/services/api/org';

export type { DeptTreeNode, DeptUserItem, UserBrief };

/** 部门树选中的节点 */
export interface DeptTreeSelectedInfo {
  type: 'dept';
  dingtalkDeptId: string;
  name: string;
}

/** 用户详情选中的节点 */
export interface UserSelectedInfo {
  type: 'user';
  userId: number;
  name: string;
}

export type SelectedInfo = DeptTreeSelectedInfo | UserSelectedInfo | null;