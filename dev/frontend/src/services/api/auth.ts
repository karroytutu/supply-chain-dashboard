import request from './request';

export interface LoginResult {
  success: boolean;
  token?: string;
  user?: UserInfo;
  message?: string;
}

export interface UserInfo {
  id: number;
  name: string;
  avatar: string;
  mobile: string;
  email: string;
  departmentId: string;
  departmentName: string;
  position: string;
  roles: RoleInfo[];
  permissions: string[];
}

export interface RoleInfo {
  id: number;
  code: string;
  name: string;
  description?: string;
  is_system?: boolean;
}

export interface QrcodeConfig {
  appId: string;
  redirectUri: string;
  state: string;
}

export interface EnvCheckResult {
  isInDingtalk: boolean;
  clientType: 'pc' | 'mobile' | 'outside';
  corpId: string;
  agentId: string;
}

/**
 * 检测钉钉环境
 */
export async function checkDingtalkEnv(): Promise<EnvCheckResult> {
  return request.get('/auth/check-env');
}

/**
 * 钉钉免登
 * 使用 skipErrorHandler 避免全局401处理器在登录页触发重定向
 */
export async function dingtalkAutoLogin(authCode: string): Promise<LoginResult> {
  return request.post('/auth/dingtalk/auto-login', { authCode }, { skipErrorHandler: true });
}

/**
 * 获取扫码登录配置
 */
export async function getQrcodeConfig(): Promise<QrcodeConfig> {
  return request.get('/auth/dingtalk/qrcode-config');
}

/**
 * 扫码登录回调
 * 使用 skipErrorHandler 避免全局401处理器在登录页触发重定向
 */
export async function dingtalkCallback(authCode: string, state?: string): Promise<LoginResult> {
  return request.post('/auth/dingtalk/callback', { authCode, state }, { skipErrorHandler: true });
}

/**
 * 获取当前用户信息
 */
export async function getCurrentUser(): Promise<UserInfo> {
  return request.get('/auth/me');
}

/**
 * 登出
 */
export async function logout(): Promise<{ success: boolean }> {
  return request.post('/auth/logout');
}

/**
 * 开发环境登录（仅开发环境可用）
 */
export async function devLogin(): Promise<LoginResult> {
  return request.post('/auth/dev-login', undefined, { skipErrorHandler: true });
}

/**
 * 获取用户列表
 */
export async function getUserList(params: {
  page?: number;
  pageSize?: number;
  keyword?: string;
  status?: number;
  roleId?: number;
}): Promise<{ data: any[]; total: number }> {
  return request.get('/users', { params });
}

/**
 * 更新用户状态
 */
export async function updateUserStatus(id: number, status: number): Promise<{ success: boolean }> {
  return request.put(`/users/${id}/status`, { status });
}

/**
 * 分配用户角色
 */
export async function assignUserRoles(id: number, roleIds: number[]): Promise<{ success: boolean }> {
  return request.put(`/users/${id}/roles`, { roleIds });
}

/**
 * 获取所有角色
 */
export async function getAllRoles(): Promise<{ data: RoleInfo[] }> {
  return request.get('/roles/all');
}

/**
 * 获取角色列表
 */
export async function getRoleList(params: {
  page?: number;
  pageSize?: number;
  keyword?: string;
}): Promise<{ data: any[]; total: number }> {
  return request.get('/roles', { params });
}

/**
 * 创建角色
 */
export async function createRole(data: { code: string; name: string; description?: string }): Promise<{ data: any }> {
  return request.post('/roles', data);
}

/**
 * 更新角色
 */
export async function updateRole(id: number, data: { name?: string; description?: string }): Promise<{ data: any }> {
  return request.put(`/roles/${id}`, data);
}

/**
 * 删除角色
 */
export async function deleteRole(id: number): Promise<{ success: boolean }> {
  return request.delete(`/roles/${id}`);
}

/**
 * 分配角色权限
 */
export async function assignRolePermissions(id: number, permissionIds: number[]): Promise<{ success: boolean }> {
  return request.put(`/roles/${id}/permissions`, { permissionIds });
}

/**
 * 获取权限树
 */
export async function getPermissionTree(): Promise<{ data: any[] }> {
  return request.get('/permissions/tree');
}

/**
 * 创建权限
 */
export async function createPermission(data: {
  code: string;
  name: string;
  resource_type: string;
  resource_key: string;
  action: string;
  parent_id?: number;
}): Promise<{ data: any }> {
  return request.post('/permissions', data);
}

/**
 * 批量更新用户状态
 */
export async function batchUpdateUserStatus(userIds: number[], status: number): Promise<{ success: boolean }> {
  return request.put('/users/batch/status', { userIds, status });
}

/**
 * 批量分配用户角色
 */
export async function batchAssignUserRoles(userIds: number[], roleIds: number[]): Promise<{ success: boolean }> {
  return request.put('/users/batch/roles', { userIds, roleIds });
}
