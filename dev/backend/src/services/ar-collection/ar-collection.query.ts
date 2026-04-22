/**
 * 催收管理 - 任务查询服务
 */

import { appQuery as query } from '../../db/appPool';
import type { TaskQueryParams } from './ar-collection.types';
import { PENDING_ROLE_SQL, ASSESSMENT_TIERS_SQL } from './ar-collection.query.sql';

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
    case 'finance_staff': // 兼容旧角色编码
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
    default:
      // admin / manager / operations_manager / marketing_manager / marketing_supervisor: 全部
      return { sql: '1=1', params: [], nextIndex: paramIndex };
  }
}

/**
 * 获取催收任务列表（分页）
 */
export async function getCollectionTasks(params: TaskQueryParams & { userId: number; role: string; viewAll?: boolean }) {
  try {
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

    const offset = (page - 1) * page_size;
    const conditions: string[] = [];
    const queryParams: any[] = [];
    let paramIndex = 1;

    // 角色数据权限过滤（管理员 viewAll 时跳过）
    const isAdmin = role === 'admin' || role === 'manager';
    if (!(isAdmin && viewAll)) {
      const roleFilter = buildRoleFilter(role, userId, paramIndex);
      conditions.push(roleFilter.sql);
      queryParams.push(...roleFilter.params);
      paramIndex = roleFilter.nextIndex;
    }

    // 状态过滤
    if (status) {
      conditions.push(`t.status = $${paramIndex++}`);
      queryParams.push(status);
    }

    // 关键词搜索
    if (keyword) {
      conditions.push(`(t.consumer_name ILIKE $${paramIndex} OR t.task_no ILIKE $${paramIndex})`);
      queryParams.push(`%${keyword}%`);
      paramIndex++;
    }

    // 优先级过滤
    if (priority) {
      conditions.push(`t.priority = $${paramIndex++}`);
      queryParams.push(priority);
    }

    // 处理人过滤
    if (params.handler_id) {
      conditions.push(`t.current_handler_id = $${paramIndex++}`);
      queryParams.push(params.handler_id);
    }

    // 创建日期范围过滤
    if (start_date) {
      conditions.push(`t.created_at >= $${paramIndex++}::timestamp`);
      queryParams.push(start_date);
    }
    if (end_date) {
      conditions.push(`t.created_at < ($${paramIndex++}::date + interval '1 day')`);
      queryParams.push(end_date);
    }

    const whereClause = conditions.length > 0 ? conditions.join(' AND ') : '1=1';

    // 排序白名单
    const allowedSorts = ['max_overdue_days', 'total_amount', 'created_at', 'updated_at', 'priority'];
    const sortField = allowedSorts.includes(sort_by) ? sort_by : 'max_overdue_days';
    const sortDir = sort_order === 'asc' ? 'ASC' : 'DESC';

    // 总数查询
    const countResult = await query(
      `SELECT COUNT(*) AS total FROM ar_collection_tasks t WHERE ${whereClause}`,
      queryParams
    );
    const total = parseInt(countResult.rows[0]?.total) || 0;

    // 列表查询
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

    return {
      data: result.rows,
      total,
      page,
      pageSize: page_size,
      totalPages: Math.ceil(total / page_size),
    };
  } catch (error) {
    console.error('[ArCollection] 获取任务列表失败:', error);
    throw new Error('获取催收任务列表失败');
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
    default:
      // admin / manager: 无限制
      return true;
  }
}

/**
 * 获取单个任务详情
 */
export async function getTaskById(id: number, userId?: number, role?: string) {
  try {
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

    // 如果提供了 userId 和 role，校验访问权限
    if (userId !== undefined && role !== undefined) {
      if (!checkTaskAccess(task, userId, role)) {
        return null;
      }
    }

    return task;
  } catch (error) {
    console.error('[ArCollection] 获取任务详情失败:', error);
    throw new Error('获取任务详情失败');
  }
}

/**
 * 获取任务关联的欠款明细列表
 */
export async function getTaskDetails(taskId: number) {
  try {
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
    return result.rows;
  } catch (error) {
    console.error('[ArCollection] 获取任务明细失败:', error);
    throw new Error('获取任务明细失败');
  }
}

/**
 * 获取操作历史（按时间倒序）
 */
export async function getTaskActions(taskId: number) {
  try {
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
    return result.rows;
  } catch (error) {
    console.error('[ArCollection] 获取操作历史失败:', error);
    throw new Error('获取操作历史失败');
  }
}

/**
 * 获取法律催收进展记录（按时间正序）
 */
export async function getLegalProgress(taskId: number) {
  try {
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
    return result.rows;
  } catch (error) {
    console.error('[ArCollection] 获取法律进展失败:', error);
    throw new Error('获取法律催收进展失败');
  }
}

/**
 * 获取所有有任务的处理人列表
 */
export async function getHandlers() {
  try {
    const result = await query(
      `SELECT DISTINCT u.id, u.name
       FROM ar_collection_tasks t
       JOIN users u ON t.current_handler_id = u.id
       WHERE t.current_handler_id IS NOT NULL
       ORDER BY u.name`
    );
    return result.rows;
  } catch (error) {
    console.error('[ArCollection] 获取处理人列表失败:', error);
    throw new Error('获取处理人列表失败');
  }
}
