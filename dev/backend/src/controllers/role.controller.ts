import { Request, Response } from 'express';
import {
  getRoleList,
  getAllRoles,
  getRoleById,
  createRole,
  updateRole,
  deleteRole,
  assignRolePermissions,
} from '../services/role.service';

/**
 * 获取角色列表
 */
export async function listRoles(req: Request, res: Response) {
  const page = parseInt(req.query.page as string) || 1;
  const pageSize = parseInt(req.query.pageSize as string) || 10;
  const keyword = req.query.keyword as string;
  const status = req.query.status !== undefined ? parseInt(req.query.status as string) : undefined;
  
  const result = await getRoleList({ page, pageSize, keyword, status });
  
  res.json({
    success: true,
    data: result.list,
    total: result.total,
    page,
    pageSize,
  });
}

/**
 * 获取所有角色（下拉选择用）
 */
export async function listAllRoles(req: Request, res: Response) {
  const roles = await getAllRoles();
  res.json({ success: true, data: roles });
}

/**
 * 获取角色详情
 */
export async function getRole(req: Request, res: Response) {
  const id = parseInt(req.params.id);
  
  if (isNaN(id)) {
    res.status(400).json({ success: false, message: '无效的角色ID' });
    return;
  }
  
  const role = await getRoleById(id);
  
  if (!role) {
    res.status(404).json({ success: false, message: '角色不存在' });
    return;
  }
  
  res.json({ success: true, data: role });
}

/**
 * 创建角色
 */
export async function createNewRole(req: Request, res: Response) {
  const { code, name, description } = req.body;
  
  if (!code || !name) {
    res.status(400).json({ success: false, message: '角色编码和名称不能为空' });
    return;
  }
  
  try {
    const role = await createRole({ code, name, description });
    res.json({ success: true, data: role, message: '角色创建成功' });
  } catch (error: any) {
    if (error.code === '23505') {
      res.status(400).json({ success: false, message: '角色编码已存在' });
      return;
    }
    throw error;
  }
}

/**
 * 更新角色
 */
export async function updateRoleInfo(req: Request, res: Response) {
  const id = parseInt(req.params.id);
  
  if (isNaN(id)) {
    res.status(400).json({ success: false, message: '无效的角色ID' });
    return;
  }
  
  const role = await updateRole(id, req.body);
  
  if (!role) {
    res.status(404).json({ success: false, message: '角色不存在' });
    return;
  }
  
  res.json({ success: true, data: role });
}

/**
 * 删除角色
 */
export async function deleteRoleHandler(req: Request, res: Response) {
  const id = parseInt(req.params.id);
  
  if (isNaN(id)) {
    res.status(400).json({ success: false, message: '无效的角色ID' });
    return;
  }
  
  try {
    const success = await deleteRole(id);
    
    if (!success) {
      res.status(404).json({ success: false, message: '角色不存在' });
      return;
    }
    
    res.json({ success: true, message: '角色删除成功' });
  } catch (error: any) {
    res.status(400).json({ success: false, message: error.message });
  }
}

/**
 * 分配角色权限
 */
export async function assignPermissions(req: Request, res: Response) {
  const id = parseInt(req.params.id);
  const { permissionIds } = req.body;
  
  if (isNaN(id)) {
    res.status(400).json({ success: false, message: '无效的角色ID' });
    return;
  }
  
  if (!Array.isArray(permissionIds)) {
    res.status(400).json({ success: false, message: '权限ID列表格式错误' });
    return;
  }
  
  await assignRolePermissions(id, permissionIds);
  
  res.json({ success: true, message: '权限分配成功' });
}
