/**
 * OA审批 - 数据管理查询
 * @module services/oa-approval/queries/data-query
 */

import { appQuery as query } from '../../../db/appPool';
import {
  ApprovalListParams,
  WorkflowNodeDef,
} from '../oa-approval.types';
import { getFormTypeByCode } from '../form-types';
import { formatInstanceListItem, InstanceListItem } from '../oa-approval.query';

/**
 * 获取所有审批数据列表（数据管理用）
 */
export async function getDataListAll(
  params: ApprovalListParams
): Promise<{ list: InstanceListItem[]; total: number }> {
  const conditions: string[] = [];
  const queryParams: unknown[] = [];
  let paramIndex = 1;

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

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  const page = params.page || 1;
  const pageSize = params.pageSize || 20;
  const offset = (page - 1) * pageSize;

  const countResult = await query<{ total: number }>(`
    SELECT COUNT(DISTINCT i.id) as total
    FROM oa_approval_instances i
    JOIN oa_form_types ft ON i.form_type_id = ft.id
    ${whereClause}
  `, queryParams);

  const total = countResult.rows[0]?.total || 0;

  const listResult = await query<any>(`
    SELECT 
      i.id, i.instance_no, i.form_type_id, i.title, i.form_data,
      i.status, i.applicant_id, i.applicant_name, i.applicant_dept,
      i.current_node_order, i.submitted_at, i.completed_at,
      ft.code as form_type_code, ft.name as form_type_name, ft.icon as form_type_icon,
      (
        SELECT n.node_name FROM oa_approval_nodes n
        WHERE n.instance_id = i.id AND n.node_order = i.current_node_order LIMIT 1
      ) as current_node_name
    FROM oa_approval_instances i
    JOIN oa_form_types ft ON i.form_type_id = ft.id
    ${whereClause}
    ORDER BY i.submitted_at DESC
    LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
  `, [...queryParams, pageSize, offset]);

  return {
    list: listResult.rows.map(row => formatInstanceListItem(row)),
    total,
  };
}

/** 预解析节点审批人结果 */
export interface PreviewApprover {
  nodeOrder: number;
  approverId: number | null;
  approverName: string | null;
  approverAvatar: string | null;
}

/**
 * 为指定的节点列表解析审批人
 */
export async function resolvePreviewApproversForNodes(
  nodes: WorkflowNodeDef[],
  userId: number
): Promise<PreviewApprover[]> {
  const { resolveApproverId } = await import('../oa-approval-utils');
  const results: PreviewApprover[] = [];

  for (const node of nodes) {
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
 */
export async function previewApprovers(
  formTypeCode: string,
  userId: number
): Promise<PreviewApprover[]> {
  const formType = await getFormTypeByCode(formTypeCode);
  if (!formType) return [];

  return resolvePreviewApproversForNodes(formType.workflowDef.nodes, userId);
}
