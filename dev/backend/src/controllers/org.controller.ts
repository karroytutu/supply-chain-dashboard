/**
 * 组织架构控制器
 */
import { Request, Response } from 'express';
import { getDeptTree } from '../services/org/org-dept-tree.query';
import { getDeptUsers } from '../services/org/org-dept-users.query';
import { getSupervisor, getSubordinates } from '../services/org/org-supervisor.query';
import { toDTO } from '../services/org/org.mapper';

/**
 * GET /api/org/dept-tree
 * 获取部门骨架树（轻量，仅部门+人数）
 */
export async function getDeptTreeHandler(_req: Request, res: Response): Promise<void> {
  const tree = await getDeptTree();
  res.json(toDTO(tree));
}

/**
 * GET /api/org/dept-users/:deptId
 * 获取指定部门下的用户列表
 * deptId 为钉钉部门ID
 */
export async function getDeptUsersHandler(req: Request, res: Response): Promise<void> {
  const { deptId } = req.params;
  if (!deptId) {
    res.status(400).json({ success: false, message: '缺少部门ID' });
    return;
  }
  const users = await getDeptUsers(deptId);
  res.json(toDTO(users));
}

/**
 * GET /api/org/users/:id/supervisor
 * 获取用户的直属上级
 */
export async function getSupervisorHandler(req: Request, res: Response): Promise<void> {
  const userId = parseInt(req.params.id, 10);
  if (isNaN(userId)) {
    res.status(400).json({ success: false, message: '无效的用户ID' });
    return;
  }
  const result = await getSupervisor(userId);
  res.json(toDTO(result));
}

/**
 * GET /api/org/users/:id/subordinates
 * 获取用户的直属下属
 */
export async function getSubordinatesHandler(req: Request, res: Response): Promise<void> {
  const userId = parseInt(req.params.id, 10);
  if (isNaN(userId)) {
    res.status(400).json({ success: false, message: '无效的用户ID' });
    return;
  }
  const result = await getSubordinates(userId);
  res.json(toDTO(result));
}