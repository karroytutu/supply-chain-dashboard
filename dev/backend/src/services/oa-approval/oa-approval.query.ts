/**
 * OA审批实例查询服务
 * @module services/oa-approval/oa-approval.query
 */

import { appQuery as query } from '../../db/appPool';
import {
  ApprovalListParams,
  ViewMode,
  ApprovalStats,
  OaApprovalInstanceRow,
  OaApprovalNodeRow,
  OaApprovalCcRow,
  OaApprovalActionRow,
  OaFormTypeRow,
  ApprovalStatus,
  Urgency,
  FormSchema,
  WorkflowNodeDef,
} from './oa-approval.types';
import { getFormTypeByCode } from './form-types';

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

  // 根据视图模式构建条件
  switch (params.viewMode) {
    case 'pending':
      // 待处理：当前用户是待审批节点的审批人
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
      // 已处理：当前用户已审批过的
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
      // 我发起的：当前用户是申请人
      conditions.push(`i.applicant_id = $${paramIndex}`);
      queryParams.push(userId);
      paramIndex++;
      break;

    case 'cc':
      // 抄送我的：当前用户在抄送列表中
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

  // 表单类型筛选
  if (params.formTypeCode) {
    conditions.push(`ft.code = $${paramIndex}`);
    queryParams.push(params.formTypeCode);
    paramIndex++;
  }

  // 状态筛选
  if (params.status) {
    conditions.push(`i.status = $${paramIndex}`);
    queryParams.push(params.status);
    paramIndex++;
  }

  // 紧急程度筛选
  if (params.urgency) {
    conditions.push(`i.urgency = $${paramIndex}`);
    queryParams.push(params.urgency);
    paramIndex++;
  }

  // 时间范围筛选
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

  // 查询总数
  const countResult = await query<{ total: number }>(`
    SELECT COUNT(DISTINCT i.id) as total
    FROM oa_approval_instances i
    JOIN oa_form_types ft ON i.form_type_id = ft.id
    ${whereClause}
  `, queryParams);

  const total = countResult.rows[0]?.total || 0;

  // 查询列表
  const listResult = await query<any>(`
    SELECT 
      i.id,
      i.instance_no,
      i.form_type_id,
      i.title,
      i.form_data,
      i.status,
      i.urgency,
      i.applicant_id,
      i.applicant_name,
      i.applicant_dept,
      i.current_node_order,
      i.submitted_at,
      i.completed_at,
      ft.code as form_type_code,
      ft.name as form_type_name,
      ft.icon as form_type_icon,
      (
        SELECT n.node_name
        FROM oa_approval_nodes n
        WHERE n.instance_id = i.id
          AND n.node_order = i.current_node_order
        LIMIT 1
      ) as current_node_name
    FROM oa_approval_instances i
    JOIN oa_form_types ft ON i.form_type_id = ft.id
    ${whereClause}
    ${orderBy}
    LIMIT $${queryParams.length + 1} OFFSET $${queryParams.length + 2}
  `, [...queryParams, pageSize, offset]);

  return {
    list: listResult.rows.map(formatInstanceListItem),
    total,
  };
}

/**
 * 列表项格式化
 */
interface InstanceListItem {
  id: number;
  instanceNo: string;
  formTypeCode: string;
  formTypeName: string;
  formTypeIcon: string | null;
  title: string;
  status: ApprovalStatus;
  urgency: Urgency;
  applicantId: number;
  applicantName: string;
  applicantDept: string | null;
  currentNodeOrder: number;
  currentNodeName: string | null;
  submittedAt: Date;
  completedAt: Date | null;
}

function formatInstanceListItem(row: any): InstanceListItem {
  return {
    id: row.id as number,
    instanceNo: row.instance_no as string,
    formTypeCode: row.form_type_code as string,
    formTypeName: row.form_type_name as string,
    formTypeIcon: row.form_type_icon as string | null,
    title: row.title as string,
    status: row.status as ApprovalStatus,
    urgency: row.urgency as Urgency,
    applicantId: row.applicant_id as number,
    applicantName: row.applicant_name as string,
    applicantDept: row.applicant_dept as string | null,
    currentNodeOrder: row.current_node_order as number,
    currentNodeName: row.current_node_name as string | null,
    submittedAt: row.submitted_at as Date,
    completedAt: row.completed_at as Date | null,
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
    // 待处理数量
    query<{ count: number }>(`
      SELECT COUNT(DISTINCT i.id) as count
      FROM oa_approval_instances i
      JOIN oa_approval_nodes n ON n.instance_id = i.id
      WHERE n.assigned_user_id = $1
        AND n.status = 'pending'
        AND i.status = 'pending'
    `, [userId]),

    // 已处理数量
    query<{ count: number }>(`
      SELECT COUNT(DISTINCT i.id) as count
      FROM oa_approval_instances i
      JOIN oa_approval_nodes n ON n.instance_id = i.id
      WHERE n.assigned_user_id = $1
        AND n.status IN ('approved', 'rejected', 'transferred')
    `, [userId]),

    // 我发起的数量
    query<{ count: number }>(`
      SELECT COUNT(*) as count
      FROM oa_approval_instances i
      WHERE i.applicant_id = $1
    `, [userId]),

    // 抄送我的数量（未读）
    query<{ count: number }>(`
      SELECT COUNT(*) as count
      FROM oa_approval_cc cc
      WHERE cc.user_id = $1 AND cc.read_at IS NULL
    `, [userId]),
  ]);

  return {
    pending: pendingResult.rows[0]?.count || 0,
    processed: processedResult.rows[0]?.count || 0,
    my: myResult.rows[0]?.count || 0,
    cc: ccResult.rows[0]?.count || 0,
  };
}

// =====================================================
// 审批详情
// =====================================================

/**
 * 审批详情返回类型
 */
export interface ApprovalDetail extends InstanceListItem {
  applicantAvatar: string | null;
  formData: Record<string, unknown>;
  formSchema: FormSchema;
  erpMeta: Record<string, unknown> | null;
  nodes: ApprovalNodeDetail[];
  actions: ApprovalActionDetail[];
  ccUsers: CcUserDetail[];
}

export interface ApprovalNodeDetail {
  id: number;
  nodeOrder: number;
  nodeName: string;
  nodeType: string;
  assignedUserId: number | null;
  assignedUserName: string | null;
  assignedUserAvatar: string | null;
  status: string;
  comment: string | null;
  actedAt: Date | null;
  isCountersign: boolean;
}

export interface ApprovalActionDetail {
  id: number;
  actionType: string;
  operatorId: number | null;
  operatorName: string | null;
  nodeOrder: number | null;
  comment: string | null;
  details: Record<string, unknown> | null;
  actionAt: Date;
}

export interface CcUserDetail {
  id: number;
  userId: number;
  userName: string | null;
  avatar: string | null;
  readAt: Date | null;
}

/**
 * 获取审批详情
 */
export async function getApprovalDetail(instanceId: number): Promise<ApprovalDetail | null> {
  // 查询实例基本信息（LEFT JOIN 防止表单类型停用后无法查看详情，LEFT JOIN users 获取申请人头像）
  const instanceResult = await query<any>(`
    SELECT
      i.*,
      ft.code as form_type_code,
      ft.name as form_type_name,
      ft.icon as form_type_icon,
      ft.form_schema as form_schema,
      u.avatar AS applicant_avatar
    FROM oa_approval_instances i
    LEFT JOIN oa_form_types ft ON i.form_type_id = ft.id
    LEFT JOIN users u ON i.applicant_id = u.id
    WHERE i.id = $1
  `, [instanceId]);

  if (instanceResult.rows.length === 0) {
    return null;
  }

  const instance = instanceResult.rows[0];

  // 查询审批节点（LEFT JOIN users 获取审批人头像）
  const nodesResult = await query<any>(
    `SELECT n.*, u.avatar AS assigned_user_avatar
     FROM oa_approval_nodes n
     LEFT JOIN users u ON n.assigned_user_id = u.id
     WHERE n.instance_id = $1
     ORDER BY n.node_order`,
    [instanceId]
  );

  // 查询操作日志
  const actionsResult = await query<OaApprovalActionRow>(
    `SELECT * FROM oa_approval_actions WHERE instance_id = $1 ORDER BY action_at`,
    [instanceId]
  );

  // 查询抄送人（LEFT JOIN users 获取头像）
  const ccResult = await query<any>(
    `SELECT c.*, u.avatar
     FROM oa_approval_cc c
     LEFT JOIN users u ON c.user_id = u.id
     WHERE c.instance_id = $1`,
    [instanceId]
  );

  // 表单类型回退：数据库记录优先，缺失时从代码定义补充
  const codeFallback = instance.form_type_code
    ? getFormTypeByCode(instance.form_type_code)
    : undefined;

  return {
    id: instance.id,
    instanceNo: instance.instance_no,
    formTypeCode: instance.form_type_code || '',
    formTypeName: instance.form_type_name || codeFallback?.name || '未知表单类型',
    formTypeIcon: instance.form_type_icon || codeFallback?.icon,
    title: instance.title,
    status: instance.status,
    urgency: instance.urgency,
    applicantId: instance.applicant_id,
    applicantName: instance.applicant_name,
    applicantDept: instance.applicant_dept,
    applicantAvatar: instance.applicant_avatar || null,
    currentNodeOrder: instance.current_node_order,
    currentNodeName: nodesResult.rows.find(n => n.node_order === instance.current_node_order)?.node_name || null,
    submittedAt: instance.submitted_at,
    completedAt: instance.completed_at,
    formData: instance.form_data,
    formSchema: instance.form_schema || codeFallback?.formSchema || { fields: [] },
    erpMeta: instance.erp_meta,
    nodes: nodesResult.rows.map((n: any) => ({
      id: n.id,
      nodeOrder: n.node_order,
      nodeName: n.node_name,
      nodeType: n.node_type,
      assignedUserId: n.assigned_user_id,
      assignedUserName: n.assigned_user_name,
      assignedUserAvatar: n.assigned_user_avatar || null,
      status: n.status,
      comment: n.comment,
      actedAt: n.acted_at,
      isCountersign: n.is_countersign,
    })),
    actions: actionsResult.rows.map(a => ({
      id: a.id,
      actionType: a.action_type,
      operatorId: a.operator_id,
      operatorName: a.operator_name,
      nodeOrder: a.node_order,
      comment: a.comment,
      details: a.details,
      actionAt: a.action_at,
    })),
    ccUsers: ccResult.rows.map((c: any) => ({
      id: c.id,
      userId: c.user_id,
      userName: c.user_name,
      avatar: c.avatar || null,
      readAt: c.read_at,
    })),
  };
}

// =====================================================
// 站内消息查询
// =====================================================

/**
 * 获取站内消息列表
 */
export async function getMessages(
  userId: number,
  page: number = 1,
  pageSize: number = 20
): Promise<{ list: MessageItem[]; total: number }> {
  const offset = (page - 1) * pageSize;

  const countResult = await query<{ total: number }>(
    `SELECT COUNT(*) as total FROM oa_in_app_messages WHERE user_id = $1`,
    [userId]
  );

  const listResult = await query<any>(`
    SELECT 
      id, user_id, type, title, content, instance_id, is_read, read_at, created_at
    FROM oa_in_app_messages
    WHERE user_id = $1
    ORDER BY created_at DESC
    LIMIT $2 OFFSET $3
  `, [userId, pageSize, offset]);

  return {
    list: listResult.rows.map(formatMessageItem),
    total: countResult.rows[0]?.total || 0,
  };
}

export interface MessageItem {
  id: number;
  userId: number;
  type: string;
  title: string;
  content: string | null;
  instanceId: number | null;
  isRead: boolean;
  readAt: Date | null;
  createdAt: Date;
}

function formatMessageItem(row: any): MessageItem {
  return {
    id: row.id as number,
    userId: row.user_id as number,
    type: row.type as string,
    title: row.title as string,
    content: row.content as string | null,
    instanceId: row.instance_id as number | null,
    isRead: row.is_read as boolean,
    readAt: row.read_at as Date | null,
    createdAt: row.created_at as Date,
  };
}

/**
 * 获取未读消息数量
 */
export async function getUnreadMessageCount(userId: number): Promise<number> {
  const result = await query<{ count: number }>(
    `SELECT COUNT(*) as count FROM oa_in_app_messages WHERE user_id = $1 AND is_read = false`,
    [userId]
  );
  return result.rows[0]?.count || 0;
}

// =====================================================
// 数据管理查询
// =====================================================

/**
 * 获取所有审批数据列表（数据管理用）
 */
export async function getDataListAll(
  params: ApprovalListParams
): Promise<{ list: InstanceListItem[]; total: number }> {
  const conditions: string[] = [];
  const queryParams: unknown[] = [];
  let paramIndex = 1;

  // 表单类型筛选
  if (params.formTypeCode) {
    conditions.push(`ft.code = $${paramIndex}`);
    queryParams.push(params.formTypeCode);
    paramIndex++;
  }

  // 状态筛选
  if (params.status) {
    conditions.push(`i.status = $${paramIndex}`);
    queryParams.push(params.status);
    paramIndex++;
  }

  // 时间范围筛选
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

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  const page = params.page || 1;
  const pageSize = params.pageSize || 20;
  const offset = (page - 1) * pageSize;

  // 查询总数
  const countResult = await query<{ total: number }>(`
    SELECT COUNT(DISTINCT i.id) as total
    FROM oa_approval_instances i
    JOIN oa_form_types ft ON i.form_type_id = ft.id
    ${whereClause}
  `, queryParams);

  const total = countResult.rows[0]?.total || 0;

  // 查询列表
  const listResult = await query<any>(`
    SELECT 
      i.id,
      i.instance_no,
      i.form_type_id,
      i.title,
      i.form_data,
      i.status,
      i.urgency,
      i.applicant_id,
      i.applicant_name,
      i.applicant_dept,
      i.current_node_order,
      i.submitted_at,
      i.completed_at,
      ft.code as form_type_code,
      ft.name as form_type_name,
      ft.icon as form_type_icon,
      (
        SELECT n.node_name
        FROM oa_approval_nodes n
        WHERE n.instance_id = i.id
          AND n.node_order = i.current_node_order
        LIMIT 1
      ) as current_node_name
    FROM oa_approval_instances i
    JOIN oa_form_types ft ON i.form_type_id = ft.id
    ${whereClause}
    ORDER BY i.submitted_at DESC
    LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
  `, [...queryParams, pageSize, offset]);

  return {
    list: listResult.rows.map(formatInstanceListItem),
    total,
  };
}

// =====================================================
// 预解析审批人
// =====================================================

/** 预解析节点审批人结果 */
export interface PreviewApprover {
  nodeOrder: number;
  approverId: number | null;
  approverName: string | null;
  approverAvatar: string | null;
}

// =====================================================
// 可复用的流程预览工具函数
// =====================================================

/**
 * 为指定的节点列表解析审批人
 * 可复用于 previewApprovers（全量）和 preview-workflow（过滤后）
 *
 * @param nodes 需要解析审批人的节点列表
 * @param userId 申请人ID，用于 dynamic_supervisor 类型节点
 * @returns 预解析审批人列表
 */
export async function resolvePreviewApproversForNodes(
  nodes: WorkflowNodeDef[],
  userId: number
): Promise<PreviewApprover[]> {
  const { resolveApproverId } = await import('./oa-approval-utils');
  const results: PreviewApprover[] = [];

  for (const node of nodes) {
    // auto 类型节点无需解析审批人，跳过
    if (node.type === 'auto') continue;

    const approverId = await resolveApproverId(node, userId);
    let approverName: string | null = null;
    let approverAvatar: string | null = null;

    if (approverId) {
      const userResult = await query<{ name: string; avatar: string | null }>(
        'SELECT name, avatar FROM users WHERE id = $1',
        [approverId]
      );
      if (userResult.rows.length > 0) {
        approverName = userResult.rows[0].name;
        approverAvatar = userResult.rows[0].avatar;
      }
    }

    results.push({
      nodeOrder: node.order,
      approverId,
      approverName,
      approverAvatar,
    });
  }

  return results;
}

/**
 * 预解析表单类型的审批人（全量节点）
 * 根据工作流定义，预先解析每个节点可能的审批人
 */
export async function previewApprovers(
  formTypeCode: string,
  userId: number
): Promise<PreviewApprover[]> {
  const formType = await getFormTypeByCode(formTypeCode);
  if (!formType) return [];

  return resolvePreviewApproversForNodes(formType.workflowDef.nodes, userId);
}
