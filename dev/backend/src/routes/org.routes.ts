/**
 * 组织架构路由
 */

import { Router } from 'express';
import {
  getDeptTreeHandler,
  getDeptUsersHandler,
  getSupervisorHandler,
  getSubordinatesHandler,
} from '../controllers/org.controller';
import { authMiddleware } from '../middleware/auth';
import { requirePermission } from '../middleware/permission';

const router = Router();

// 所有路由需要认证 + 组织架构查看权限
router.use(authMiddleware);
router.use(requirePermission('system:org:read'));

// 获取部门骨架树
router.get('/dept-tree', getDeptTreeHandler);

// 获取指定部门下的用户列表（deptId 为钉钉部门ID）
router.get('/dept-users/:deptId', getDeptUsersHandler);

// 获取用户的直属上级
router.get('/users/:id/supervisor', getSupervisorHandler);

// 获取用户的直属下属
router.get('/users/:id/subordinates', getSubordinatesHandler);

export default router;