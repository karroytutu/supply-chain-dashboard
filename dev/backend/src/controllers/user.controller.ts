import { Request, Response } from 'express';
import {
  getUserList,
  getUserById,
  updateUser,
  updateUserStatus,
  assignUserRoles,
  getUserLoginLogs,
  batchUpdateUserStatus as batchUpdateStatus,
  batchAssignUserRoles as batchAssignRoles,
} from '../services/user.service';

/**
 * 获取用户列表
 */
export async function listUsers(req: Request, res: Response) {
  const page = parseInt(req.query.page as string) || 1;
  const pageSize = parseInt(req.query.pageSize as string) || 10;
  const keyword = req.query.keyword as string;
  const status = req.query.status !== undefined ? parseInt(req.query.status as string) : undefined;
  const roleId = req.query.roleId !== undefined ? parseInt(req.query.roleId as string) : undefined;
  
  const result = await getUserList({ page, pageSize, keyword, status, roleId });
  
  res.json({
    success: true,
    data: result.list,
    total: result.total,
    page,
    pageSize,
  });
}

/**
 * 获取用户详情
 */
export async function getUser(req: Request, res: Response) {
  const id = parseInt(req.params.id);
  
  if (isNaN(id)) {
    res.status(400).json({ success: false, message: '无效的用户ID' });
    return;
  }
  
  const user = await getUserById(id);
  
  if (!user) {
    res.status(404).json({ success: false, message: '用户不存在' });
    return;
  }
  
  res.json({ success: true, data: user });
}

/**
 * 更新用户信息
 */
export async function updateUserInfo(req: Request, res: Response) {
  const id = parseInt(req.params.id);
  
  if (isNaN(id)) {
    res.status(400).json({ success: false, message: '无效的用户ID' });
    return;
  }
  
  const user = await updateUser(id, req.body);
  
  if (!user) {
    res.status(404).json({ success: false, message: '用户不存在' });
    return;
  }
  
  res.json({ success: true, data: user });
}

/**
 * 更新用户状态
 */
export async function updateUserStatusHandler(req: Request, res: Response) {
  const id = parseInt(req.params.id);
  const { status } = req.body;
  
  if (isNaN(id)) {
    res.status(400).json({ success: false, message: '无效的用户ID' });
    return;
  }
  
  if (status === undefined || ![0, 1].includes(status)) {
    res.status(400).json({ success: false, message: '无效的状态值' });
    return;
  }
  
  const success = await updateUserStatus(id, status);
  
  if (!success) {
    res.status(404).json({ success: false, message: '用户不存在' });
    return;
  }
  
  res.json({ success: true, message: status === 1 ? '用户已启用' : '用户已禁用' });
}

/**
 * 分配用户角色
 */
export async function assignRoles(req: Request, res: Response) {
  const id = parseInt(req.params.id);
  const { roleIds } = req.body;
  
  if (isNaN(id)) {
    res.status(400).json({ success: false, message: '无效的用户ID' });
    return;
  }
  
  if (!Array.isArray(roleIds)) {
    res.status(400).json({ success: false, message: '角色ID列表格式错误' });
    return;
  }
  
  await assignUserRoles(id, roleIds);
  
  res.json({ success: true, message: '角色分配成功' });
}

/**
 * 获取用户登录日志
 */
export async function getLoginLogs(req: Request, res: Response) {
  const id = parseInt(req.params.id);
  
  if (isNaN(id)) {
    res.status(400).json({ success: false, message: '无效的用户ID' });
    return;
  }
  
  const page = parseInt(req.query.page as string) || 1;
  const pageSize = parseInt(req.query.pageSize as string) || 10;
  
  const result = await getUserLoginLogs(id, page, pageSize);
  
  res.json({
    success: true,
    data: result.list,
    total: result.total,
    page,
    pageSize,
  });
}

/**
 * 批量更新用户状态
 */
export async function batchUpdateUserStatus(req: Request, res: Response) {
  const { userIds, status } = req.body;
  
  if (!Array.isArray(userIds) || userIds.length === 0) {
    res.status(400).json({ success: false, message: '用户ID列表不能为空' });
    return;
  }
  
  if (status === undefined || ![0, 1].includes(status)) {
    res.status(400).json({ success: false, message: '无效的状态值' });
    return;
  }
  
  const count = await batchUpdateStatus(userIds, status);
  
  res.json({ 
    success: true, 
    message: status === 1 ? `成功启用 ${count} 个用户` : `成功禁用 ${count} 个用户`,
    affectedCount: count,
  });
}

/**
 * 批量分配用户角色
 */
export async function batchAssignUserRoles(req: Request, res: Response) {
  const { userIds, roleIds } = req.body;
  
  if (!Array.isArray(userIds) || userIds.length === 0) {
    res.status(400).json({ success: false, message: '用户ID列表不能为空' });
    return;
  }
  
  if (!Array.isArray(roleIds)) {
    res.status(400).json({ success: false, message: '角色ID列表格式错误' });
    return;
  }
  
  await batchAssignRoles(userIds, roleIds);
  
  res.json({ 
    success: true, 
    message: `成功为 ${userIds.length} 个用户分配角色` 
  });
}
