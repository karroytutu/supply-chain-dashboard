/**
 * 催收管理 - 数据访问层 (Repository)
 * 收敛所有 SQL 查询和缓存逻辑，Service 层不再直接编写 SQL
 * 遵循规范：Controller → Service → Repository → DB
 */

import { appQuery as query } from '../../db/appPool';
import { cache, CACHE_TTL } from '../../utils/cache';
import type { TaskQueryParams } from './ar-collection.types';
import { PENDING_ROLE_SQL, ASSESSMENT_TIERS_SQL } from './ar-collection.query.sql';

const CACHE_PREFIX = 'ar:collection';

// ==================== 辅助函数 ====================

/**
 * 构建角色数据权限 WHERE 条件
 */
function buildRoleFilter(role: string, userId: number, paramIndex: number): { sql: string; params: any[]; nextIndex: number } {
  switch (role) {
    case 'marketer':
      return {
        sql: `(t.manager_user_id = $${paramIndex})`,
        params: [userId],
        nextIndex: paramIndex + 1,
      };
    case 'current_accountant':
    case 'finance_staff':
      return {
        sql: `(t.status = 'difference_processing' OR (t.status = 'escalated' AND t.escalation_level = 2))`,
        params: [],
        nextIndex: paramIndex,
      };
    case 'cashier':
      return {
        sql: `(t.status = 'pending_verify')`,
        params: [],
        nextIndex: paramIndex,
      };
    case 'marketing_supervisor':
    case 'marketing_manager':
      return {
        sql: `(t.status = 'escalated' AND t.escalation_level = 1)`,
        params: [],
        nextIndex: paramIndex,
      };
    default:
      return { sql: '1=1', params: [], nextIndex: paramIndex };
  }
}

/**
 * 校验用户是否有权访问指定任务
 */
function checkTaskAccess(task: any, userId: number, role: string): boolean {
  switch (role) {
    case 'marketer':
      return task.manager_user_id === userId;
    case 'current_accountant':
    case 'finance_staff':
      return task.status === 'difference_processing' || (task.status === 'escalated' && task.escalation_level === 2);
    case 'cashier':
      return task.status === 'pending_verify';
    case 'marketing_supervisor':
    case 'marketing_manager':
      return task.status === 'escalated' && task.escalation_level === 1;
    default:
      return true;
  }
}

// ==================== 读取操作 ====================

/**
 * 获取催收任务列表（分页）
 */
export async function getTasks(params: TaskQueryParams & { userId: number; role: string; viewAll?: boolean }) {
  const {
    page = 1,
    page_size = 20,
    keyword,
    status,
    priority,
    sort_by = 'max_overdue_days',
    sort_order = 'desc',
    userId,
    role,
    viewAll,
    start_date,
    end_date,
  } = params;

  // 缓存 key 基于查询参数
  const cacheKey = `${CACHE_PREFIX}:tasks:${JSON.stringify({ page, page_size, keyword, status, priority, sort_by, sort_order, userId, role, viewAll, start_date, end_date })}`;
  const cached = cache.get<any>(cacheKey);
  if (cached) return cached;

  const offset = (page - 1) * page_size;
  const conditions: string[] = [];
  const queryParams: any[] = [];
  let paramIndex = 1;

  // 角色数据权限过滤
  const isAdmin = role === 'admin' || role === 'manager' || role === 'marketing_manager' || role === 'marketing_supervisor';
  if (!(isAdmin && viewAll)) {
    const roleFilter = buildRoleFilter(role, userId, paramIndex);
    conditions.push(roleFilter.sql);
    queryParams.push(...roleFilter.params);
    paramIndex = roleFilter.nextIndex;
  }

  if (status) {
    conditions.push(`t.status = $${paramIndex++}`);
    queryParams.push(status);
  }

  if (params.escalation_level !== undefined) {
    conditions.push(`t.escalation_level = $${paramIndex++}`);
    queryParams.push(params.escalation_level);
  }

  if (keyword) {
    conditions.push(`(t.consumer_name ILIKE $${paramIndex} OR t.task_no ILIKE $${paramIndex})`);
    queryParams.push(`%${keyword}%`);
    paramIndex++;
  }

  if (priority) {
    conditions.push(`t.priority = $${paramIndex++}`);
    queryParams.push(priority);
  }

  if (params.handler_id) {
    conditions.push(`t.current_handler_id = $${paramIndex++}`);
    queryParams.push(params.handler_id);
  }

  if (start_date) {
    conditions.push(`t.created_at >= $${paramIndex++}::timestamp`);
    queryParams.push(start_date);
  }
  if (end_date) {
    conditions.push(`t.created_at < ($${paramIndex++}::date + interval '1 day')`);
    queryParams.push(end_date);
  }

  const whereClause = conditions.length > 0 ? conditions.join(' AND ') : '1=1';

  const allowedSorts = ['max_overdue_days', 'total_amount', 'created_at', 'updated_at', 'priority'];
  const sortField = allowedSorts.includes(sort_by) ? sort_by : 'max_overdue_days';
  const sortDir = sort_order === 'asc' ? 'ASC' : 'DESC';

  const countResult = await query(
    `SELECT COUNT(*) AS total FROM ar_collection_tasks t WHERE ${whereClause}`,
    queryParams
  );
  const total = parseInt(countResult.rows[0]?.total) || 0;

  const listParams = [...queryParams, page_size, offset];
  const result = await query(
    `SELECT
      t.*,
      u.name AS handler_name,
      ${PENDING_ROLE_SQL},
      ${ASSESSMENT_TIERS_SQL}
    FROM ar_collection_tasks t
    LEFT JOIN users u ON t.current_handler_id = u.id
    WHERE ${whereClause}
    ORDER BY t.${sortField} ${sortDir}
    LIMIT $${paramIndex++} OFFSET $${paramIndex++}`,
    listParams
  );

  const data = {
    data: result.rows,
    total,
    page,
    pageSize: page_size,
    totalPages: Math.ceil(total / page_size),
  };

  cache.set(cacheKey, data, CACHE_TTL.DASHBOARD);
  return data;
}

/**
 * 获取单个任务详情
 */
export async function getTaskById(id: number, userId?: number, role?: string) {
  const cacheKey = `${CACHE_PREFIX}:task:${id}`;
  const cached = cache.get<any>(cacheKey);
  if (cached) return cached;

  const result = await query(
    `SELECT
      t.*,
      u.name AS handler_name,
      m.name AS manager_name,
      ${PENDING_ROLE_SQL},
      ${ASSESSMENT_TIERS_SQL}
    FROM ar_collection_tasks t
    LEFT JOIN users u ON t.current_handler_id = u.id
    LEFT JOIN users m ON t.manager_user_id = m.id
    WHERE t.id = $1`,
    [id]
  );

  if (result.rows.length === 0) return null;

  const task = result.rows[0];

  if (userId !== undefined && role !== undefined) {
    if (!checkTaskAccess(task, userId, role)) {
      return null;
    }
  }

  cache.set(cacheKey, task, CACHE_TTL.DASHBOARD);
  return task;
}

/**
 * 获取任务关联的欠款明细列表
 */
export async function getTaskDetails(taskId: number) {
  const cacheKey = `${CACHE_PREFIX}:details:${taskId}`;
  const cached = cache.get<any[]>(cacheKey);
  if (cached) return cached;

  const result = await query(
    `SELECT
      d.*,
      u.name AS processed_by_name
    FROM ar_collection_details d
    LEFT JOIN users u ON d.processed_by = u.id
    WHERE d.task_id = $1
    ORDER BY d.overdue_days DESC NULLS LAST, d.id ASC`,
    [taskId]
  );

  cache.set(cacheKey, result.rows, CACHE_TTL.DASHBOARD);
  return result.rows;
}

/**
 * 获取操作历史
 */
export async function getTaskActions(taskId: number) {
  const cacheKey = `${CACHE_PREFIX}:actions:${taskId}`;
  const cached = cache.get<any[]>(cacheKey);
  if (cached) return cached;

  const result = await query(
    `SELECT
      a.*,
      u.name AS operator_display_name
    FROM ar_collection_actions a
    LEFT JOIN users u ON a.operator_id = u.id
    WHERE a.task_id = $1
    ORDER BY a.created_at DESC`,
    [taskId]
  );

  cache.set(cacheKey, result.rows, CACHE_TTL.DASHBOARD);
  return result.rows;
}

/**
 * 获取法律催收进展记录
 */
export async function getLegalProgress(taskId: number) {
  const cacheKey = `${CACHE_PREFIX}:legal:${taskId}`;
  const cached = cache.get<any[]>(cacheKey);
  if (cached) return cached;

  const result = await query(
    `SELECT
      lp.*,
      u.name AS operator_name
    FROM ar_legal_progress lp
    LEFT JOIN users u ON lp.operator_id = u.id
    WHERE lp.task_id = $1
    ORDER BY lp.created_at ASC`,
    [taskId]
  );

  cache.set(cacheKey, result.rows, CACHE_TTL.DASHBOARD);
  return result.rows;
}

/**
 * 获取所有有任务的处理人列表
 */
export async function getHandlers() {
  const cacheKey = `${CACHE_PREFIX}:handlers`;
  const cached = cache.get<any[]>(cacheKey);
  if (cached) return cached;

  const result = await query(
    `SELECT DISTINCT u.id, u.name
     FROM ar_collection_tasks t
     JOIN users u ON t.current_handler_id = u.id
     WHERE t.current_handler_id IS NOT NULL
     ORDER BY u.name`
  );

  cache.set(cacheKey, result.rows, CACHE_TTL.LOW_FREQUENCY);
  return result.rows;
}

// ==================== 缓存失效 ====================

/**
 * 失效指定任务相关的所有缓存
 * 写入操作（UPDATE/INSERT/DELETE）后调用
 */
export function invalidateTaskCache(taskId?: number): void {
  // 批量清除任务列表缓存
  cache.invalidate(`${CACHE_PREFIX}:tasks:`);

  if (taskId) {
    cache.invalidate(`${CACHE_PREFIX}:task:${taskId}`);
    cache.invalidate(`${CACHE_PREFIX}:details:${taskId}`);
    cache.invalidate(`${CACHE_PREFIX}:actions:${taskId}`);
    cache.invalidate(`${CACHE_PREFIX}:legal:${taskId}`);
  }

  // 处理人列表可能因任务状态变更而变化
  cache.invalidate(`${CACHE_PREFIX}:handlers`);
}

/**
 * 失效统计相关缓存
 */
export function invalidateStatsCache(): void {
  cache.invalidate(`${CACHE_PREFIX}:stats:`);
}
