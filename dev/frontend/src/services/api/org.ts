import request from './request';

/** 部门骨架树节点 */
export interface DeptTreeNode {
  id: number;
  dingtalkDeptId: string;
  name: string;
  parentId: string | null;
  autoAddUser: boolean;
  userCount: number;
  children: DeptTreeNode[];
}

/** 部门下用户信息 */
export interface DeptUserItem {
  id: number;
  name: string;
  avatar: string;
  position: string;
  departmentName: string;
  isPrimary: boolean;
  isLeader: boolean;
  roles: { code: string; name: string }[];
  managerUserid: string | null;
}

/** 用户简要信息 */
export interface UserBrief {
  id: number;
  name: string;
  avatar: string;
  position: string;
  departmentName: string;
  dingtalkUserId: string;
}

/** 获取部门骨架树 */
export async function getDeptTree(): Promise<DeptTreeNode[]> {
  return request.get('/org/dept-tree');
}

/** 获取指定部门下的用户列表 */
export async function getDeptUsers(deptId: string): Promise<DeptUserItem[]> {
  return request.get(`/org/dept-users/${deptId}`);
}

/** 获取用户的直属上级 */
export async function getSupervisor(userId: number): Promise<{ supervisor: UserBrief | null }> {
  return request.get(`/org/users/${userId}/supervisor`);
}

/** 获取用户的直属下属 */
export async function getSubordinates(userId: number): Promise<{ subordinates: UserBrief[] }> {
  return request.get(`/org/users/${userId}/subordinates`);
}