/**
 * 催收管理 - 统计与待办查询服务
 */

import { appQuery as query } from '../../db/appPool';

/**
 * 构建统计查询的角色 WHERE 条件（不含表别名前缀）
 */
function buildStatsRoleFilter(role: string, userId: number, paramIndex: number): { sql: string; params: any[]; nextIndex: number } {
  switch (role) {
    case 'marketer':
      return {
        sql: `manager_user_id = $${paramIndex}`,
        params: [userId],
        nextIndex: paramIndex + 1,
      };
    case 'marketing_manager':
    case 'marketing_supervisor':
      return {
        sql: `(status = 'escalated' AND escalation_level = 1)`,
        params: [],
        nextIndex: paramIndex,
      };
    case 'current_accountant':
    case 'finance_staff':
      return {
        sql: `(status = 'difference_processing' OR (status = 'escalated' AND escalation_level = 2))`,
        params: [],
        nextIndex: paramIndex,
      };
    case 'cashier':
      return {
        sql: `status = 'pending_verify'`,
        params: [],
        nextIndex: paramIndex,
      };
    default:
      // admin / manager: 全部
      return { sql: '1=1', params: [], nextIndex: paramIndex };
  }
}

/**
 * 获取催收统计概览
 * 返回 4 个指标卡数据 + 状态分布
 */
export async function getCollectionStats(userId: number, role: string) {
  try {
    const roleFilter = buildStatsRoleFilter(role, userId, 1);
    const whereClause = roleFilter.sql;
    const whereParams = roleFilter.params;

    // 指标卡统计
    const statsResult = await query(
      `SELECT
        COUNT(CASE WHEN status = 'collecting' THEN 1 END) AS collecting_count,
        COALESCE(SUM(CASE WHEN status = 'collecting' THEN total_amount END), 0) AS collecting_amount,
        COUNT(CASE WHEN status IN ('difference_processing', 'extension', 'escalated') THEN 1 END) AS waiting_count,
        COALESCE(SUM(CASE WHEN status IN ('difference_processing', 'extension', 'escalated') THEN total_amount END), 0) AS waiting_amount,
        COUNT(CASE WHEN status = 'pending_verify' OR max_overdue_days >= 30 THEN 1 END) AS attention_count,
        COALESCE(SUM(CASE WHEN status = 'pending_verify' OR max_overdue_days >= 30 THEN total_amount END), 0) AS attention_amount,
        COUNT(CASE WHEN status IN ('verified', 'closed') AND created_at >= date_trunc('month', CURRENT_DATE) THEN 1 END) AS collected_count,
        COALESCE(SUM(CASE WHEN status IN ('verified', 'closed') AND created_at >= date_trunc('month', CURRENT_DATE) THEN total_amount END), 0) AS collected_amount
      FROM ar_collection_tasks
      WHERE ${whereClause}`,
      whereParams
    );

    // 状态分布
    const distResult = await query(
      `SELECT
        status,
        COUNT(*) AS count,
        COALESCE(SUM(total_amount), 0) AS amount
      FROM ar_collection_tasks
      WHERE ${whereClause}
      GROUP BY status`,
      whereParams
    );

    const s = statsResult.rows[0];
    const totalTasks = distResult.rows.reduce((sum: number, r: any) => sum + parseInt(r.count), 0);
    const statusDistribution = distResult.rows.map((r: any) => ({
      status: r.status,
      count: parseInt(r.count) || 0,
      amount: parseFloat(r.amount) || 0,
      percentage: totalTasks > 0
        ? Math.round((parseInt(r.count) / totalTasks) * 10000) / 100
        : 0,
    }));

    return {
      collecting: {
        count: parseInt(s.collecting_count) || 0,
        amount: parseFloat(s.collecting_amount) || 0,
      },
      waiting: {
        count: parseInt(s.waiting_count) || 0,
        amount: parseFloat(s.waiting_amount) || 0,
      },
      attention: {
        count: parseInt(s.attention_count) || 0,
        amount: parseFloat(s.attention_amount) || 0,
      },
      collected: {
        count: parseInt(s.collected_count) || 0,
        amount: parseFloat(s.collected_amount) || 0,
      },
      statusDistribution,
    };
  } catch (error) {
    console.error('[ArCollection] 获取统计概览失败:', error);
    throw new Error('获取催收统计失败');
  }
}

/**
 * 获取我的待办统计（按角色返回不同分类）
 */
export async function getMyTasks(userId: number, role: string) {
  try {
    if (role === 'marketer') {
      return await getMarketerTasks(userId);
    } else if (role === 'marketing_manager' || role === 'marketing_supervisor') {
      return await getSupervisorTasks(userId);
    } else if (role === 'current_accountant' || role === 'finance_staff') {
      return await getFinanceTasks(userId);
    } else if (role === 'cashier') {
      return await getCashierTasks(userId);
    }
    // admin/manager/operations_manager 返回总览
    return await getAdminTasks();
  } catch (error) {
    console.error('[ArCollection] 获取我的待办失败:', error);
    throw new Error('获取我的待办失败');
  }
}

/** 营销师待办 */
async function getMarketerTasks(userId: number) {
  const result = await query(
    `SELECT
      COUNT(CASE WHEN status = 'collecting' THEN 1 END) AS collecting,
      COALESCE(SUM(CASE WHEN status = 'collecting' THEN total_amount END), 0) AS collecting_amount,
      COUNT(CASE WHEN status = 'extension' THEN 1 END) AS extension,
      COALESCE(SUM(CASE WHEN status = 'extension' THEN total_amount END), 0) AS extension_amount,
      COUNT(CASE WHEN last_collection_at < NOW() - INTERVAL '7 days' AND status IN ('collecting', 'extension') THEN 1 END) AS overdue_follow,
      COALESCE(SUM(CASE WHEN last_collection_at < NOW() - INTERVAL '7 days' AND status IN ('collecting', 'extension') THEN total_amount END), 0) AS overdue_follow_amount
    FROM ar_collection_tasks
    WHERE manager_user_id = $1`,
    [userId]
  );
  const r = result.rows[0];
  return {
    role: 'marketer',
    categories: [
      { key: 'collecting', label: '催收中', count: parseInt(r.collecting) || 0, amount: parseFloat(r.collecting_amount) || 0, urgent: false },
      { key: 'extension', label: '延期中', count: parseInt(r.extension) || 0, amount: parseFloat(r.extension_amount) || 0, urgent: false },
      { key: 'overdue_follow', label: '超时未跟进', count: parseInt(r.overdue_follow) || 0, amount: parseFloat(r.overdue_follow_amount) || 0, urgent: true },
    ],
  };
}

/** 营销主管待办 */
async function getSupervisorTasks(userId: number) {
  const result = await query(
    `SELECT
      COUNT(CASE WHEN status = 'escalated' AND escalation_level = 1 THEN 1 END) AS pending_escalated,
      COALESCE(SUM(CASE WHEN status = 'escalated' AND escalation_level = 1 THEN total_amount END), 0) AS pending_escalated_amount,
      COUNT(CASE WHEN status = 'escalated' AND escalation_level = 1 AND extension_until::date = CURRENT_DATE THEN 1 END) AS today_due,
      COUNT(CASE WHEN status = 'escalated' AND escalation_level = 1 AND last_collection_at < NOW() - INTERVAL '7 days' THEN 1 END) AS overdue_follow
    FROM ar_collection_tasks`
  );
  const r = result.rows[0];
  return {
    role: 'marketing_manager',
    categories: [
      { key: 'pending_escalated', label: '待处理升级', count: parseInt(r.pending_escalated) || 0, amount: parseFloat(r.pending_escalated_amount) || 0, urgent: true },
      { key: 'today_due', label: '今日到期', count: parseInt(r.today_due) || 0, amount: 0, urgent: false },
      { key: 'overdue_follow', label: '超时未跟进', count: parseInt(r.overdue_follow) || 0, amount: 0, urgent: false },
    ],
  };
}

/** 财务人员待办 */
async function getFinanceTasks(userId: number) {
  const result = await query(
    `SELECT
      COUNT(CASE WHEN status = 'difference_processing' THEN 1 END) AS difference,
      COALESCE(SUM(CASE WHEN status = 'difference_processing' THEN total_amount END), 0) AS difference_amount,
      COUNT(CASE WHEN status = 'escalated' AND escalation_level = 2 THEN 1 END) AS legal_pending,
      COALESCE(SUM(CASE WHEN status = 'escalated' AND escalation_level = 2 THEN total_amount END), 0) AS legal_pending_amount
    FROM ar_collection_tasks`
  );
  const r = result.rows[0];
  return {
    role: 'current_accountant',
    categories: [
      { key: 'difference', label: '差异待处理', count: parseInt(r.difference) || 0, amount: parseFloat(r.difference_amount) || 0, urgent: true },
      { key: 'legal_pending', label: '待法务处理', count: parseInt(r.legal_pending) || 0, amount: parseFloat(r.legal_pending_amount) || 0, urgent: false },
    ],
  };
}

/** 出纳待办 */
async function getCashierTasks(userId: number) {
  const result = await query(
    `SELECT
      COUNT(CASE WHEN status = 'pending_verify' THEN 1 END) AS pending_verify,
      COALESCE(SUM(CASE WHEN status = 'pending_verify' THEN total_amount END), 0) AS pending_verify_amount,
      COUNT(CASE WHEN status = 'pending_verify' AND updated_at::date = CURRENT_DATE THEN 1 END) AS today_submitted
    FROM ar_collection_tasks`
  );
  const r = result.rows[0];
  return {
    role: 'cashier',
    categories: [
      { key: 'pending_verify', label: '待核销确认', count: parseInt(r.pending_verify) || 0, amount: parseFloat(r.pending_verify_amount) || 0, urgent: true },
      { key: 'today_submitted', label: '今日提交', count: parseInt(r.today_submitted) || 0, amount: 0, urgent: false },
    ],
  };
}

/** 管理员总览 */
async function getAdminTasks() {
  const result = await query(
    `SELECT
      COUNT(*) AS total,
      COUNT(CASE WHEN status NOT IN ('verified', 'closed') THEN 1 END) AS active,
      COALESCE(SUM(CASE WHEN status NOT IN ('verified', 'closed') THEN total_amount END), 0) AS active_amount
    FROM ar_collection_tasks`
  );
  const r = result.rows[0];
  return {
    role: 'admin',
    categories: [
      { key: 'active', label: '进行中任务', count: parseInt(r.active) || 0, amount: parseFloat(r.active_amount) || 0, urgent: false },
      { key: 'total', label: '全部任务', count: parseInt(r.total) || 0, amount: 0, urgent: false },
    ],
  };
}
