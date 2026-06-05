/**
 * OA - 详情查询
 * @module services/oa/queries/approval-detail
 */

import { appQuery as query } from '../../../db/appPool';
import { OaActionRow, FormSchema, WorkflowDef } from '../oa.types';
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
}

export interface ApprovalNodeDetail {
  id: number;
  nodeOrder: number;
  nodeName: string;
  nodeType: string;
  roleCode: string | null;
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
  const instanceResult = await query<any>(
    `
    SELECT
      i.*,
      ft.code as form_type_code,
      ft.name as form_type_name,
      ft.icon as form_type_icon,
      ft.form_schema as form_schema,
      ft.workflow_def as workflow_def,
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
     LEFT JOIN users u ON n.assigned_user_id = u.id
     WHERE n.instance_id = $1
     ORDER BY n.node_order`,
    [instanceId]
  );

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
      nodesResult.rows.find(n => n.node_order === instance.current_node_order)?.node_name || null,
    submittedAt: instance.submitted_at,
    completedAt: instance.completed_at,
    formData: instance.form_data,
    formSchema: instance.form_schema || codeFallback?.formSchema || { fields: [] },
    workflowDef: instance.workflow_def || codeFallback?.workflowDef || null,
    erpMeta: instance.erp_meta,
    nodes: nodesResult.rows.map((n: any) => ({
      id: n.id,
      nodeOrder: n.node_order,
      nodeName: n.node_name,
      nodeType: n.node_type,
      roleCode: n.role_code || null,
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
