/**
 * OA实例查询服务 - 统一导出入口
 * 列表/统计保留在此文件，详情/消息/数据管理已拆分到 queries/ 子目录
 * @module services/oa/oa.query
 */

import { appQuery as query } from '../../db/appPool';
import { escapeLikePattern } from '../../utils/sqlHelpers';
import { ApprovalListParams, ApprovalStats, ApprovalStatus } from './oa.types';
import { extractFormSummary } from './oa-form-summary';

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
  submittedAt: Date;
  completedAt: Date | null;
  /** 抄送是否未读（仅 viewMode='cc' 时有意义） */
  isUnread?: boolean;
  /** 表单字段预览摘要（前几个关键字段） */
  previewFields: Array<{ label: string; value: string }>;
}

export function formatInstanceListItem(
  row: any,
  viewMode?: string,
  formSchema?: any
): InstanceListItem {
  // 优先使用显式传入的 formSchema；回退到 row.form_schema（向后兼容）；
  // 两者都无值时跳过 extractFormSummary，避免无效计算
  const resolvedSchema = formSchema ?? row.form_schema ?? null;
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
      // 同时约束节点状态和实例状态，避免已完成的实例因残留 pending 节点而误显示
      conditions.push(`i.status = 'pending'`);
      conditions.push(`
        EXISTS (
          SELECT 1 FROM oa_approval_nodes n
          WHERE n.instance_id = i.id
            AND n.assigned_user_id = $${paramIndex}
            AND n.status = 'pending'
        )
      `);
      queryParams.push(userId);
      paramIndex++;
      break;

    case 'processed':
      conditions.push(`
        EXISTS (
          SELECT 1 FROM oa_approval_nodes n
          WHERE n.instance_id = i.id
            AND n.assigned_user_id = $${paramIndex}
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
  const orderBy = 'ORDER BY i.submitted_at DESC';

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
      (
        SELECT n.node_name FROM oa_approval_nodes n
        WHERE n.instance_id = i.id AND n.node_order = i.current_node_order LIMIT 1
      ) as current_node_name,
      ${ccReadAtColumn}
    FROM oa_approval_instances i
    JOIN oa_form_types ft ON i.form_type_id = ft.id
    ${whereClause}
    ${orderBy}
    LIMIT $${queryParams.length + 1} OFFSET $${queryParams.length + 2}
  `,
    [...queryParams, pageSize, offset]
  );

  // 批量查询 form_schema（同一 form_type_id 只查一次，避免逐行重复传输 JSONB）
  const uniqueFormTypeIds = [...new Set(listResult.rows.map(r => r.form_type_id))];
  const schemaMap = new Map<number, any>();
  if (uniqueFormTypeIds.length > 0) {
    const schemaResult = await query<{ id: number; form_schema: any }>(
      `SELECT id, form_schema FROM oa_form_types WHERE id = ANY($1)`,
      [uniqueFormTypeIds]
    );
    for (const r of schemaResult.rows) schemaMap.set(r.id, r.form_schema);
  }

  return {
    list: listResult.rows.map(row =>
      formatInstanceListItem(row, params.viewMode, schemaMap.get(row.form_type_id))
    ),
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
  const [pendingResult, processedResult, myResult, ccResult] = await Promise.all([
    query<{ count: number }>(
      `
      SELECT COUNT(DISTINCT i.id) as count
      FROM oa_approval_instances i
      JOIN oa_approval_nodes n ON n.instance_id = i.id
      WHERE n.assigned_user_id = $1
        AND n.status = 'pending'
        AND i.status = 'pending'
    `,
      [userId]
    ),

    query<{ count: number }>(
      `
      SELECT COUNT(DISTINCT i.id) as count
      FROM oa_approval_instances i
      JOIN oa_approval_nodes n ON n.instance_id = i.id
      WHERE n.assigned_user_id = $1
        AND n.status IN ('approved', 'rejected', 'transferred')
    `,
      [userId]
    ),

    query<{ count: number }>(
      `
      SELECT COUNT(*) as count FROM oa_approval_instances WHERE applicant_id = $1
    `,
      [userId]
    ),

    query<{ count: number }>(
      `
      SELECT COUNT(DISTINCT i.id) as count
      FROM oa_approval_instances i
      JOIN oa_approval_cc cc ON cc.instance_id = i.id
      WHERE cc.user_id = $1
    `,
      [userId]
    ),
  ]);

  return {
    pending: pendingResult.rows[0]?.count || 0,
    processed: processedResult.rows[0]?.count || 0,
    my: myResult.rows[0]?.count || 0,
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
  // 角色过滤：通过 OA 节点的 assigned_user_id 过滤
  let roleFilter = '';
  const params: (number | string)[] = [];
  let paramIdx = 1;

  if (role === 'marketer') {
    roleFilter = `AND EXISTS (
      SELECT 1 FROM oa_approval_nodes n2
      WHERE n2.instance_id = i.id AND n2.assigned_user_id = $${paramIdx}
        AND n2.role_code = 'marketer' AND n2.status = 'pending'
    )`;
    params.push(userId);
    paramIdx++;
  } else if (role === 'current_accountant' || role === 'finance_staff') {
    roleFilter = `AND EXISTS (
      SELECT 1 FROM oa_approval_nodes n2
      WHERE n2.instance_id = i.id AND n2.assigned_user_id IS NOT NULL
        AND n2.role_code IN ('current_accountant', 'finance_staff') AND n2.status = 'pending'
    )`;
  } else if (role === 'cashier') {
    roleFilter = `AND i.status = 'pending' AND EXISTS (
      SELECT 1 FROM oa_approval_nodes n2
      WHERE n2.instance_id = i.id AND n2.node_name LIKE '%核销%' AND n2.status = 'pending'
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
