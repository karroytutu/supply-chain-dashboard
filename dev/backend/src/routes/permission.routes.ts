import { Router } from 'express';
import {
  listPermissions,
  getPermissionTreeHandler,
  getPermission,
  createNewPermission,
  updatePermissionInfo,
  deletePermissionHandler,
} from '../controllers/permission.controller';
import { authMiddleware } from '../middleware/auth';
import { requirePermission, requireAdmin } from '../middleware/permission';

const router = Router();

// 所有路由需要认证
router.use(authMiddleware);

// 权限列表
router.get('/', requirePermission('system:permission:read'), listPermissions);

// 权限树
router.get('/tree', requirePermission('system:permission:read'), getPermissionTreeHandler);

// 权限详情
router.get('/:id', requirePermission('system:permission:read'), getPermission);

// 创建权限
router.post('/', requireAdmin, createNewPermission);

// 更新权限
router.put('/:id', requirePermission('system:permission:write'), updatePermissionInfo);

// 删除权限
router.delete('/:id', requireAdmin, deletePermissionHandler);

export default router;
