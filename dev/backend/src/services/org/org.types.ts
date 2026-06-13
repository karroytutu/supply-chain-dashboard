/** 组织架构模块类型定义 */

/** 部门骨架节点（不含用户详情，用于树形展示） */
export interface DeptTreeNode {
  id: number;
  dingtalk_dept_id: string;
  name: string;
  parent_id: string | null;
  auto_add_user: boolean;
  /** 该部门（含子部门）的在职人数 */
  user_count: number;
  children: DeptTreeNode[];
}

/** 部门下用户信息 */
export interface DeptUserItem {
  id: number;
  name: string;
  avatar: string;
  position: string;
  department_name: string;
  is_primary: boolean;
  is_leader: boolean;
  roles: { code: string; name: string }[];
  manager_userid: string | null;
}

/** 用户简要信息（用于上级/下属展示） */
export interface UserBrief {
  id: number;
  name: string;
  avatar: string;
  position: string;
  department_name: string;
  dingtalk_user_id: string;
}

/** 直属上级查询结果 */
export interface SupervisorResult {
  supervisor: UserBrief | null;
}

/** 直属下属查询结果 */
export interface SubordinateResult {
  subordinates: UserBrief[];
}