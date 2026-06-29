/**
 * OA - 详情查询
 * @module services/oa/queries/approval-detail
 */

import { appQuery as query } from '../../../db/appPool';
import { OaActionRow, FormSchema, WorkflowDef, TimeoutConfig, ViewPermissionsOverride } from '../oa.types';
import { getFormTypeByCode } from '../form-types';
import { InstanceListItem } from '../oa.query';

/**
 * 审批详情返回类型
 */
export interface ApprovalDetail extends InstanceListItem {
  applicantAvatar: string | null;
  formData: Record<string, unknown>;
  formSchema: FormSchema;
  workflowDef: WorkflowDef | null;
  erpMeta: Record<string, unknown> | null;
  nodes: ApprovalNodeDetail[];
  actions: ApprovalActionDetail[];
  ccUsers: CcUserDetail[];
  /** 查看权限 DB 覆盖值（非办理人查看详情时使用） */
  viewPermissions?: ViewPermissionsOverride;
  /** 可查看该表单数据的角色列表（用于前端判断当前用户是否为数据查看人） */
  dataReadRoles?: string[];
  /** 可查看该表单数据的用户ID列表（用于前端判断当前用户是否为数据查看人） */
  dataReadUsers?: number[];
}

export interface ApprovalNodeDetail {
  id: number;
  nodeOrder: number;
  /** 执行轮次（退回后重新走同一环节时 round + 1） */
  round: number;
  nodeName: string;
  nodeType: string;
  roleCode: string | null;
  assignedUserIds: number[] | null;
  assignedUserNames: string[] | null;
  assignedUserAvatar: string | null;
  status: string;
  comment: string | null;
  actedAt: Date | null;
  isCountersign: boolean;
  /** 节点截止时间 */
  deadlineAt: Date | null;
  /** 时限配置快照 */
  timeoutConfig: TimeoutConfig | null;
  /** 已催办次数 */
  reminderCount: number;
  /** 首次抄送上级时间 */
  ccSupervisorAt: Date | null;
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
  const instanceResult = await query<any>(
    `
    SELECT
      i.*,
      ft.code as form_type_code,
      ft.name as form_type_name,
      ft.icon as form_type_icon,
      ft.view_permissions as view_permissions,
      ft.data_read_roles as data_read_roles,
      ft.data_read_users as data_read_users,
      u.avatar AS applicant_avatar
    FROM oa_approval_instances i
    LEFT JOIN oa_form_types ft ON i.form_type_id = ft.id
    LEFT JOIN users u ON i.applicant_id = u.id
    WHERE i.id = $1
  `,
    [instanceId]
  );

  if (instanceResult.rows.length === 0) {
    return null;
  }

  const instance = instanceResult.rows[0];

  const nodesResult = await query<any>(
    `SELECT n.*, u.avatar AS assigned_user_avatar
     FROM oa_approval_nodes n
     LEFT JOIN users u ON u.id = n.assigned_user_ids[1]
     WHERE n.instance_id = $1
     ORDER BY n.node_order, n.round`,
    [instanceId]
  );

  // 批量查询所有节点处理人的用户名
  const allUserIds = new Set<number>();
  for (const n of nodesResult.rows) {
    if (Array.isArray(n.assigned_user_ids)) {
      for (const uid of n.assigned_user_ids) allUserIds.add(uid);
    }
  }
  const userNameMap = new Map<number, string>();
  if (allUserIds.size > 0) {
    const usersResult = await query<{ id: number; name: string }>(
      `SELECT id, name FROM users WHERE id = ANY($1)`,
      [Array.from(allUserIds)]
    );
    for (const u of usersResult.rows) userNameMap.set(u.id, u.name);
  }

  const actionsResult = await query<OaActionRow>(
    `SELECT * FROM oa_approval_actions WHERE instance_id = $1 ORDER BY action_at`,
    [instanceId]
  );

  const ccResult = await query<any>(
    `SELECT c.*, u.avatar
     FROM oa_approval_cc c
     LEFT JOIN users u ON c.user_id = u.id
     WHERE c.instance_id = $1`,
    [instanceId]
  );

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
    applicantId: instance.applicant_id,
    applicantName: instance.applicant_name,
    applicantDept: instance.applicant_dept,
    applicantAvatar: instance.applicant_avatar || null,
    currentNodeOrder: instance.current_node_order,
    currentNodeName:
      [...nodesResult.rows].reverse().find(n => n.node_order === instance.current_node_order)?.node_name || null,
    currentNodeDeadlineAt:
      [...nodesResult.rows].reverse().find(n => n.node_order === instance.current_node_order)?.deadline_at || null,
    submittedAt: instance.submitted_at,
    completedAt: instance.completed_at,
    previewFields: [],  // 详情页展示完整表单，无需字段预览
    formData: instance.form_data,
    formSchema: codeFallback?.formSchema ?? { fields: [] },
    workflowDef: codeFallback?.workflowDef || null,
    // fieldPermissions: 代码固化，唯一数据源
    fieldPermissions: codeFallback?.fieldPermissions ?? { nodes: {} },
    // viewPermissions: DB 覆盖值（非办理人查看详情时使用）
    ...(instance.view_permissions && { viewPermissions: instance.view_permissions }),
    // dataReadRoles: 可查看该表单数据的角色列表（前端判断数据查看人身份用）
    ...(instance.data_read_roles && { dataReadRoles: instance.data_read_roles }),
    // dataReadUsers: 可查看该表单数据的用户ID列表（前端判断数据查看人身份用）
    ...(instance.data_read_users && { dataReadUsers: instance.data_read_users }),
    erpMeta: instance.erp_meta,
    nodes: nodesResult.rows.map((n: any) => {
      const userIds: number[] | null = Array.isArray(n.assigned_user_ids) ? n.assigned_user_ids : null;
      const userNames: string[] | null = userIds
        ? userIds.map((uid: number) => userNameMap.get(uid) || '未知').filter(Boolean)
        : null;
      return {
        id: n.id,
        nodeOrder: n.node_order,
        round: n.round ?? 1,
        nodeName: n.node_name,
        nodeType: n.node_type,
        roleCode: n.role_code || null,
        signMode: n.sign_mode || null,
        assignedUserIds: userIds,
        assignedUserNames: userNames,
        assignedUserAvatar: n.assigned_user_avatar || null,
        status: n.status,
        comment: n.comment,
        actedAt: n.acted_at,
        isCountersign: n.is_countersign,
        deadlineAt: n.deadline_at || null,
        timeoutConfig: n.timeout_config || null,
        reminderCount: n.reminder_count || 0,
        ccSupervisorAt: n.cc_supervisor_at || null,
      };
    }),
    actions: actionsResult.rows.map(a => ({
      id: a.id,
      actionType: a.action_type,
      operatorId: a.operator_id,
      operatorName: a.operator_name,
      nodeOrder: a.node_order,
      comment: a.comment,
      details: a.details,
      attachments: a.attachments || [],
      actionAt: a.action_at,
    })),
    ccUsers: ccResult.rows.map((c: any) => ({
      id: c.id,
      userId: c.user_id,
      userName: c.user_name,
      avatar: c.avatar || null,
      readAt: c.read_at,
      sourceNodeOrder: c.source_node_order ?? null,
    })),
  };
}
