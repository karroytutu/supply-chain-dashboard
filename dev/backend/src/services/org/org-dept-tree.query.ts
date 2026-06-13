/**
 * 部门骨架树查询
 * 返回部门层级 + 各部门人数，不含用户详情
 */
import { createLogger } from '../../utils/logger';
const log = createLogger('Org');

import { appQuery } from '../../db/appPool';
import { cache, CACHE_TTL } from '../../utils/cache';
import type { DeptTreeNode } from './org.types';

const CACHE_PREFIX = 'org:dept-tree';

/** 部门行数据（扁平） */
interface DeptRow {
  id: number;
  dingtalk_dept_id: string;
  name: string;
  parent_id: string | null;
  auto_add_user: boolean;
  user_count: string; // COUNT 返回的是字符串
}

/**
 * 获取部门骨架树
 * 仅包含部门层级 + 各部门主部门下的在职人数
 */
export async function getDeptTree(): Promise<DeptTreeNode[]> {
  const cacheKey = `${CACHE_PREFIX}:full`;
  const cached = cache.get<DeptTreeNode[]>(cacheKey);
  if (cached) return cached;

  // 查询所有部门 + 主部门在职人数
  const result = await appQuery(`
    SELECT
      d.id, d.dingtalk_dept_id, d.name, d.parent_id, d.auto_add_user,
      COUNT(ud.id) FILTER (WHERE ud.is_primary = true AND u.status = 1)::text AS user_count
    FROM dingtalk_departments d
    LEFT JOIN user_departments ud ON ud.dept_id = d.id
    LEFT JOIN users u ON u.id = ud.user_id
    GROUP BY d.id
    ORDER BY d.name
  `);

  // 内存构建树
  const tree = buildTree(result.rows);
  cache.set(cacheKey, tree, CACHE_TTL.LOW_FREQUENCY);
  return tree;
}

/**
 * 将扁平部门列表构建为树形结构
 * parent_id='1' 或 IS NULL 的部门作为顶层
 */
function buildTree(rows: DeptRow[]): DeptTreeNode[] {
  const nodeMap = new Map<string, DeptTreeNode>();

  // 创建所有节点
  for (const row of rows) {
    nodeMap.set(row.dingtalk_dept_id, {
      id: row.id,
      dingtalk_dept_id: row.dingtalk_dept_id,
      name: row.name,
      parent_id: row.parent_id,
      auto_add_user: row.auto_add_user,
      user_count: parseInt(row.user_count, 10) || 0,
      children: [],
    });
  }

  const roots: DeptTreeNode[] = [];

  for (const node of nodeMap.values()) {
    // parent_id='1' 是钉钉根部门（通常不在数据库中），或 parent_id IS NULL → 顶层
    const isTopLevel = !node.parent_id || node.parent_id === '1';
    const parent = isTopLevel ? null : nodeMap.get(node.parent_id!);

    if (parent) {
      parent.children.push(node);
    } else {
      roots.push(node);
    }
  }

  // 后序遍历：将子树人数累加到父节点
  aggregateCounts(roots);

  return roots;
}

/** 后序遍历：将子树人数累加到父节点 */
function aggregateCounts(nodes: DeptTreeNode[]): number {
  let total = 0;
  for (const node of nodes) {
    const childrenSum = aggregateCounts(node.children);
    node.user_count += childrenSum;
    total += node.user_count;
  }
  return total;
}