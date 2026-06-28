/**
 * OA实例查询服务 - 统一导出入口
 * 列表/统计保留在此文件，详情/消息/数据管理已拆分到 queries/ 子目录
 * @module services/oa/oa.query
 */

import { appQuery as query } from '../../db/appPool';
import { escapeLikePattern } from '../../utils/sqlHelpers';
import { ApprovalListParams, ApprovalStats, ApprovalStatus } from './oa.types';
import { extractFormSummary } from './oa-form-summary';
import { getFormTypeByCode } from './form-types';

// Re-export from extracted modules
export { getApprovalDetail } from './queries/approval-detail';
export type {
  ApprovalDetail,
  ApprovalNodeDetail,
  ApprovalActionDetail,
  CcUserDetail,
} from './queries/approval-detail';
export {
  getDataListAll,
  resolvePreviewApproversForNodes,
  previewApprovers,
} from './queries/data-query';
export type { PreviewApprover } from './queries/data-query';

// =====================================================
// 列表项类型与格式化（共享给 queries/data-query.ts）
// =====================================================

export interface InstanceListItem {
  id: number;
  instanceNo: string;
  formTypeCode: string;
  formTypeName: string;
  formTypeIcon: string | null;
  title: string;
  status: ApprovalStatus;
  applicantId: number;
  applicantName: string;
  applicantDept: string | null;
  currentNodeOrder: number;
  currentNodeName: string | null;
  /** 当前处理人姓名（取当前节点第一个审批人） */
  currentApproverName: string | null;
  /** 当前节点截止时间（仅 pending 状态有值） */
  currentNodeDeadlineAt: Date | null;
  submittedAt: Date;
  completedAt: Date | null;
  /** 抄送是否未读（仅 viewMode='cc' 时有意义） */
  isUnread?: boolean;
  /** 表单字段预览摘要（前几个关键字段） */
  previewFields: Array<{ label: string; value: string }>;
}

export function formatInstanceListItem(
  row: any,
  viewMode?: string
): InstanceListItem {
  // formSchema 统一从代码注册表获取（代码唯一来源）
  const resolvedSchema = row.form_type_code
    ? getFormTypeByCode(row.form_type_code)?.formSchema ?? { fields: [] }
    : null;
  const formData = row.form_data || null;
  const previewFields = resolvedSchema && formData
    ? extractFormSummary(resolvedSchema, formData).map(r => ({ label: r.key, value: r.value }))
    : [];

  return {
    id: row.id as number,
    instanceNo: row.instance_no as string,
    formTypeCode: row.form_type_code as string,
    formTypeName: row.form_type_name as string,
    formTypeIcon: row.form_type_icon as string | null,
    title: row.title as string,
    status: row.status as ApprovalStatus,
    applicantId: row.applicant_id as number,
    applicantName: row.applicant_name as string,
    applicantDept: row.applicant_dept as string | null,
    currentNodeOrder: row.current_node_order as number,
    currentNodeName: row.current_node_name as string | null,
    currentApproverName: row.current_approver_name as string | null,
    currentNodeDeadlineAt: row.current_node_deadline_at || null,
    submittedAt: row.submitted_at as Date,
    completedAt: row.completed_at as Date | null,
    isUnread: viewMode === 'cc' ? row.cc_read_at === null : undefined,
    previewFields,
  };
}

// =====================================================
// 审批列表查询
// =====================================================

/**
 * 构建审批列表查询条件
 */
function buildListWhereClause(
  params: ApprovalListParams,
  userId: number
): { whereClause: string; queryParams: unknown[]; orderBy: string } {
  const conditions: string[] = [];
  const queryParams: unknown[] = [];
  let paramIndex = 1;

  switch (params.viewMode) {
    case 'pending':
      // 同时约束节点状态和实例状态，并校验节点为当前活跃节点（node_order = current_node_order），
      // 避免后续尚未轮到的节点出现在审批人的待处理列表中
      conditions.push(`i.status = 'pending'`);
      conditions.push(`
        EXISTS (
          SELECT 1 FROM oa_approval_nodes n
          WHERE n.instance_id = i.id
            AND $${paramIndex} = ANY(n.assigned_user_ids)
            AND n.status = 'pending'
            AND n.node_order = i.current_node_order
        )
      `);
      queryParams.push(userId);
      paramIndex++;
      break;

    case 'processed':
      // 排除已终态实例，避免残留节点误导显示
      conditions.push(`i.status NOT IN ('withdrawn', 'cancelled')`);
      conditions.push(`
        EXISTS (
          SELECT 1 FROM oa_approval_nodes n
          WHERE n.instance_id = i.id
            AND $${paramIndex} = ANY(n.assigned_user_ids)
            AND n.status IN ('approved', 'rejected', 'transferred')
        )
      `);
      queryParams.push(userId);
      paramIndex++;
      break;

    case 'my':
      conditions.push(`i.applicant_id = $${paramIndex}`);
      queryParams.push(userId);
      paramIndex++;
      break;

    case 'cc':
      conditions.push(`
        EXISTS (
          SELECT 1 FROM oa_approval_cc cc
          WHERE cc.instance_id = i.id
            AND cc.user_id = $${paramIndex}
        )
      `);
      queryParams.push(userId);
      paramIndex++;
      break;
  }

  if (params.formTypeCode) {
    conditions.push(`ft.code = $${paramIndex}`);
    queryParams.push(params.formTypeCode);
    paramIndex++;
  }

  if (params.status) {
    conditions.push(`i.status = $${paramIndex}`);
    queryParams.push(params.status);
    paramIndex++;
  }

  if (params.startDate) {
    conditions.push(`i.submitted_at >= $${paramIndex}`);
    queryParams.push(params.startDate);
    paramIndex++;
  }
  if (params.endDate) {
    conditions.push(`i.submitted_at <= $${paramIndex}::date + interval '1 day'`);
    queryParams.push(params.endDate);
    paramIndex++;
  }

  // keyword 模糊搜索审批编号、标题和申请人（OR 关系，括号包裹与外部 AND 衔接）
  if (params.keyword && params.keyword.trim()) {
    const keywordPattern = `%${escapeLikePattern(params.keyword.trim())}%`;
    conditions.push(`(i.instance_no ILIKE $${paramIndex} OR i.title ILIKE $${paramIndex} OR i.applicant_name ILIKE $${paramIndex})`);
    queryParams.push(keywordPattern);
    paramIndex++;
  }

  // applicant_name 模糊搜索申请人姓名
  if (params.applicantName && params.applicantName.trim()) {
    conditions.push(`i.applicant_name ILIKE $${paramIndex}`);
    queryParams.push(`%${escapeLikePattern(params.applicantName.trim())}%`);
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  const orderBy = params.viewMode === 'cc'
    ? 'ORDER BY cc_read_at NULLS FIRST, i.submitted_at DESC'
    : 'ORDER BY i.submitted_at DESC';

  return { whereClause, queryParams, orderBy };
}

/**
 * 获取审批列表
 */
export async function getApprovalList(
  params: ApprovalListParams,
  userId: number
): Promise<{ list: InstanceListItem[]; total: number }> {
  const { whereClause, queryParams, orderBy } = buildListWhereClause(params, userId);
  const page = params.page || 1;
  const pageSize = params.pageSize || 20;
  const offset = (page - 1) * pageSize;

  const countResult = await query<{ total: number }>(
    `
    SELECT COUNT(DISTINCT i.id) as total
    FROM oa_approval_instances i
    JOIN oa_form_types ft ON i.form_type_id = ft.id
    ${whereClause}
  `,
    queryParams
  );

  const total = countResult.rows[0]?.total || 0;

  const ccReadAtColumn =
    params.viewMode === 'cc'
      ? `(
        SELECT cc.read_at
        FROM oa_approval_cc cc
        WHERE cc.instance_id = i.id
          AND cc.user_id = $1
        LIMIT 1
      ) as cc_read_at`
      : `NULL as cc_read_at`;

  const listResult = await query<any>(
    `
    SELECT 
      i.id, i.instance_no, i.form_type_id, i.title, i.form_data,
      i.status, i.applicant_id, i.applicant_name, i.applicant_dept,
      i.current_node_order, i.submitted_at, i.completed_at,
      ft.code as form_type_code, ft.name as form_type_name, ft.icon as form_type_icon,
      cn.node_name AS current_node_name,
      cn.deadline_at AS current_node_deadline_at,
      ${ccReadAtColumn}
    FROM oa_approval_instances i
    JOIN oa_form_types ft ON i.form_type_id = ft.id
    LEFT JOIN LATERAL (
      SELECT n.node_name, n.deadline_at
      FROM oa_approval_nodes n
      WHERE n.instance_id = i.id AND n.node_order = i.current_node_order
      ORDER BY CASE WHEN n.status = 'pending' THEN 0 ELSE 1 END, n.round DESC
      LIMIT 1
    ) cn ON true
    ${whereClause}
    ${orderBy}
    LIMIT $${queryParams.length + 1} OFFSET $${queryParams.length + 2}
  `,
    [...queryParams, pageSize, offset]
  );

  // formSchema 已由 formatInstanceListItem 内部从代码注册表获取，无需额外 DB 查询
  return {
    list: listResult.rows.map(row => formatInstanceListItem(row, params.viewMode)),
    total,
  };
}

// =====================================================
// 审批统计
// =====================================================

/**
 * 获取审批统计数据
 */
export async function getApprovalStats(userId: number): Promise<ApprovalStats> {
  const [pendingResult, processedResult, myStatsResult, ccResult] = await Promise.all([
    query<{ count: number }>(
      `
      SELECT COUNT(DISTINCT i.id) as count
      FROM oa_approval_instances i
      JOIN oa_approval_nodes n ON n.instance_id = i.id
      WHERE $1 = ANY(n.assigned_user_ids)
        AND n.status = 'pending'
        AND i.status = 'pending'
        AND n.node_order = i.current_node_order
    `,
      [userId]
    ),

    query<{ count: number }>(
      `
      SELECT COUNT(DISTINCT i.id) as count
      FROM oa_approval_instances i
      JOIN oa_approval_nodes n ON n.instance_id = i.id
      WHERE $1 = ANY(n.assigned_user_ids)
        AND n.status IN ('approved', 'rejected', 'transferred')
        AND i.status NOT IN ('withdrawn', 'cancelled')
    `,
      [userId]
    ),

    query<{ total: number; approved: number; rejected: number }>(
      `
      SELECT
        COUNT(*) as total,
        COUNT(CASE WHEN status = 'approved' THEN 1 END) as approved,
        COUNT(CASE WHEN status = 'rejected' THEN 1 END) as rejected
      FROM oa_approval_instances
      WHERE applicant_id = $1
    `,
      [userId]
    ),

    query<{ count: number }>(
      `
      SELECT COUNT(DISTINCT i.id) as count
      FROM oa_approval_instances i
      JOIN oa_approval_cc cc ON cc.instance_id = i.id
      WHERE cc.user_id = $1
        AND cc.read_at IS NULL
    `,
      [userId]
    ),
  ]);

  const myStats = myStatsResult.rows[0];

  return {
    total: myStats?.total || 0,
    pending: pendingResult.rows[0]?.count || 0,
    processed: processedResult.rows[0]?.count || 0,
    approved: myStats?.approved || 0,
    rejected: myStats?.rejected || 0,
    my: myStats?.total || 0,
    cc: ccResult.rows[0]?.count || 0,
  };
}

/**
 * 催收 OA 统计：查询 ar_collection 类型审批实例的状态分布
 * 供工作台催收模块展示使用
 */
export async function getCollectionOaStats(
  userId: number,
  role: string
): Promise<{
  pending: { count: number; amount: number };
  approved: { count: number; amount: number };
  attention: { count: number; amount: number };
}> {
  // 角色过滤：通过 OA 节点的 assigned_user_ids 过滤
  let roleFilter = '';
  const params: (number | string)[] = [];

  if (role === 'marketer') {
    roleFilter = `AND EXISTS (
      SELECT 1 FROM oa_approval_nodes n2
      WHERE n2.instance_id = i.id AND $1 = ANY(n2.assigned_user_ids)
        AND n2.role_code = 'marketer' AND n2.status = 'pending'
        AND n2.node_order = i.current_node_order
    )`;
    params.push(userId);
  } else if (role === 'current_accountant') {
    roleFilter = `AND EXISTS (
      SELECT 1 FROM oa_approval_nodes n2
      WHERE n2.instance_id = i.id AND n2.assigned_user_ids IS NOT NULL
        AND n2.role_code = 'current_accountant' AND n2.status = 'pending'
        AND n2.node_order = i.current_node_order
    )`;
  } else if (role === 'cashier') {
    roleFilter = `AND i.status = 'pending' AND EXISTS (
      SELECT 1 FROM oa_approval_nodes n2
      WHERE n2.instance_id = i.id AND n2.node_name LIKE '%核销%' AND n2.status = 'pending'
        AND n2.node_order = i.current_node_order
    )`;
  }
  // admin/manager 等角色：不过滤，看全量

  const result = await query<{
    pending_count: number;
    pending_amount: number;
    approved_count: number;
    approved_amount: number;
    attention_count: number;
    attention_amount: number;
  }>(
    `SELECT
      COUNT(CASE WHEN i.status = 'pending' THEN 1 END) AS pending_count,
      COALESCE(SUM(CASE WHEN i.status = 'pending'
        THEN (i.form_data->>'totalAmount')::numeric END), 0) AS pending_amount,
      COUNT(CASE WHEN i.status = 'approved' THEN 1 END) AS approved_count,
      COALESCE(SUM(CASE WHEN i.status = 'approved'
        THEN (i.form_data->>'totalAmount')::numeric END), 0) AS approved_amount,
      COUNT(CASE WHEN i.status = 'pending' AND EXISTS (
        SELECT 1 FROM oa_approval_nodes n3
        WHERE n3.instance_id = i.id AND n3.node_name LIKE '%差异%'
      ) THEN 1 END) AS attention_count,
      COALESCE(SUM(CASE WHEN i.status = 'pending' AND EXISTS (
        SELECT 1 FROM oa_approval_nodes n3
        WHERE n3.instance_id = i.id AND n3.node_name LIKE '%差异%'
      ) THEN (i.form_data->>'totalAmount')::numeric END), 0) AS attention_amount
    FROM oa_approval_instances i
    JOIN oa_form_types ft ON i.form_type_id = ft.id
    WHERE ft.code = 'ar_collection' ${roleFilter}`,
    params
  );

  const row = result.rows[0];
  return {
    pending: {
      count: Number(row?.pending_count) || 0,
      amount: Number(row?.pending_amount) || 0,
    },
    approved: {
      count: Number(row?.approved_count) || 0,
      amount: Number(row?.approved_amount) || 0,
    },
    attention: {
      count: Number(row?.attention_count) || 0,
      amount: Number(row?.attention_amount) || 0,
    },
  };
}
