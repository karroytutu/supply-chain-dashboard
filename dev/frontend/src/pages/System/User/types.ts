/**
 * 用户管理页面类型定义
 */

/** 用户信息 */
export interface UserItem {
  id: number;
  name: string;
  avatar: string;
  mobile: string;
  email: string;
  department_id: number;
  department_name: string;
  position: string;
  status: number; // 1=正常, 0=禁用
  last_login_at: string;
  created_at: string;
  roles: UserRole[];
}

/** 用户角色 */
export interface UserRole {
  id: number;
  code: string;
  name: string;
}

/** 角色信息 */
export interface RoleInfo {
  id: number;
  code: string;
  name: string;
  description?: string;
  is_system?: boolean;
}

/** 部门信息 */
export interface Department {
  id: number;
  name: string;
}

/** 用户统计 */
export interface UserStats {
  total: number;
  active: number;
  disabled: number;
}

/** 筛选参数 */
export interface UserFilters {
  keyword: string;
  departmentId?: number;
  roleId?: number;
  status?: number;
}

/** 分页参数 */
export interface PaginationParams {
  page: number;
  pageSize: number;
}

/** 用户列表查询参数 */
export interface UserListParams extends PaginationParams, Partial<UserFilters> {}
