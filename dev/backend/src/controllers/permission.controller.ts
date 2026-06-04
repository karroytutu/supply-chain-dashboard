import { Request, Response } from 'express';
import {
  getAllPermissions,
  getPermissionTree,
  getPermissionById,
  createPermission,
  updatePermission,
  deletePermission,
} from '../services/permission.service';
import { buildSuccessResponse, buildErrorResponse } from '../utils/response';
import { getErrorMessage } from '../utils/errorUtils';

/**
 * 获取所有权限
 */
export async function listPermissions(req: Request, res: Response) {
  const permissions = await getAllPermissions();
  res.json(buildSuccessResponse(permissions));
}

/**
 * 获取权限树
 */
export async function getPermissionTreeHandler(req: Request, res: Response) {
  const tree = await getPermissionTree();
  res.json(buildSuccessResponse(tree));
}

/**
 * 获取权限详情
 */
export async function getPermission(req: Request, res: Response) {
  const id = parseInt(req.params.id);

  if (isNaN(id)) {
    res.status(400).json(buildErrorResponse(400, '无效的权限ID'));
    return;
  }

  const permission = await getPermissionById(id);

  if (!permission) {
    res.status(404).json(buildErrorResponse(404, '权限不存在'));
    return;
  }

  res.json(buildSuccessResponse(permission));
}

/**
 * 创建权限
 */
export async function createNewPermission(req: Request, res: Response) {
  const { code, name, resource_type, resource_key, action, parent_id, sort_order } = req.body;

  if (!code || !name || !resource_type || !resource_key || !action) {
    res.status(400).json(buildErrorResponse(400, '缺少必要参数'));
    return;
  }

  try {
    const permission = await createPermission({
      code,
      name,
      resource_type,
      resource_key,
      action,
      parent_id,
      sort_order,
    });
    res.json(buildSuccessResponse(permission, '权限创建成功'));
  } catch (error: any) {
    if (error.code === '23505') {
      res.status(400).json(buildErrorResponse(400, '权限编码已存在'));
      return;
    }
    throw error;
  }
}

/**
 * 更新权限
 */
export async function updatePermissionInfo(req: Request, res: Response) {
  const id = parseInt(req.params.id);

  if (isNaN(id)) {
    res.status(400).json(buildErrorResponse(400, '无效的权限ID'));
    return;
  }

  const permission = await updatePermission(id, req.body);

  if (!permission) {
    res.status(404).json(buildErrorResponse(404, '权限不存在'));
    return;
  }

  res.json(buildSuccessResponse(permission));
}

/**
 * 删除权限
 */
export async function deletePermissionHandler(req: Request, res: Response) {
  const id = parseInt(req.params.id);

  if (isNaN(id)) {
    res.status(400).json(buildErrorResponse(400, '无效的权限ID'));
    return;
  }

  try {
    const success = await deletePermission(id);

    if (!success) {
      res.status(404).json(buildErrorResponse(404, '权限不存在'));
      return;
    }

    res.json(buildSuccessResponse(null, '权限删除成功'));
  } catch (error) {
    res.status(400).json(buildErrorResponse(400, getErrorMessage(error)));
  }
}
