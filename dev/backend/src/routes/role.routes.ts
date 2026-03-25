import { Router } from 'express';
import {
  listRoles,
  listAllRoles,
  getRole,
  createNewRole,
  updateRoleInfo,
  deleteRoleHandler,
  assignPermissions,
} from '../controllers/role.controller';
import { authMiddleware } from '../middleware/auth';
import { requirePermission, requireAdmin } from '../middleware/permission';

const router = Router();

// 所有路由需要认证
router.use(authMiddleware);

// 角色列表
router.get('/', requirePermission('system:role:read'), listRoles);

// 所有角色（下拉选择用）
router.get('/all', listAllRoles);

// 角色详情
router.get('/:id', requirePermission('system:role:read'), getRole);

// 创建角色
router.post('/', requireAdmin, createNewRole);

// 更新角色
router.put('/:id', requirePermission('system:role:write'), updateRoleInfo);

// 删除角色
router.delete('/:id', requireAdmin, deleteRoleHandler);

// 分配角色权限
router.put('/:id/permissions', requirePermission('system:role:write'), assignPermissions);

export default router;
