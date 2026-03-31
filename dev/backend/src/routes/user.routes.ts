import { Router } from 'express';
import {
  listUsers,
  getUser,
  updateUserInfo,
  updateUserStatusHandler,
  assignRoles,
  getLoginLogs,
  batchUpdateUserStatus,
  batchAssignUserRoles,
} from '../controllers/user.controller';
import { authMiddleware } from '../middleware/auth';
import { requirePermission } from '../middleware/permission';

const router = Router();

// 所有路由需要认证
router.use(authMiddleware);

// 用户列表
router.get('/', requirePermission('system:user:read'), listUsers);

// 批量操作路由（放在 /:id 路由之前）
router.put('/batch/status', requirePermission('system:user:write'), batchUpdateUserStatus);
router.put('/batch/roles', requirePermission('system:user:write'), batchAssignUserRoles);

// 用户详情
router.get('/:id', requirePermission('system:user:read'), getUser);

// 更新用户信息
router.put('/:id', requirePermission('system:user:write'), updateUserInfo);

// 更新用户状态
router.put('/:id/status', requirePermission('system:user:write'), updateUserStatusHandler);

// 分配用户角色
router.put('/:id/roles', requirePermission('system:user:write'), assignRoles);

// 用户登录日志
router.get('/:id/login-logs', requirePermission('system:user:read'), getLoginLogs);

export default router;
