/**
 * OA流程交接 - 扫描服务
 * 扫描受影响的流程定义和在途审批单
 * @module services/oa/handover/handover-scanner
 */

import { createLogger } from '../../../utils/logger';
const log = createLogger('HandoverScanner');

import { appQuery as query } from '../../../db/appPool';

// =====================================================
// 类型定义
// =====================================================

export interface AffectedFormType {
  code: string;
  name: string;
  category: string;
  affectedNodes: Array<{ order: number; name: string }>;
}

export interface AffectedInstance {
  nodeId: number;
  instanceId: number;
  instanceNo: string;
  title: string;
  formTypeName: string;
  formTypeCode: string;
  nodeOrder: number;
  nodeName: string;
}

export interface HandoverScanResult {
  formTypes: AffectedFormType[];
  instances: AffectedInstance[];
  summary: {
    formTypeCount: number;
    instanceCount: number;
    nodeCount: number;
  };
}

// =====================================================
// 扫描逻辑
// =====================================================

/**
 * 扫描指定用户在在途审批单中的影响范围
 *
 * 注：流程定义交接功能已停用（workflowDef 改为代码唯一来源，
 * 且所有表单均使用 roleCode 而非 userId，流程定义层无用户级交接需求）。
 * 交接仅作用于在途审批单的节点重分配。
 */
export async function scanHandoverImpact(sourceUserId: number): Promise<HandoverScanResult> {
  // 1. 流程定义扫描已停用（workflowDef 改为代码唯一来源，所有表单使用 roleCode）
  const formTypes: AffectedFormType[] = [];

  // 2. 扫描在途实例：找出 assigned_user_id 匹配的 pending 节点
  const instances = await scanInFlightInstances(sourceUserId);

  // instanceCount 统计唯一实例数（一个审批单可能有多个节点分配给同一用户）
  const uniqueInstanceIds = new Set(instances.map(i => i.instanceId));

  return {
    formTypes,
    instances,
    summary: {
      formTypeCount: formTypes.length,
      instanceCount: uniqueInstanceIds.size,
      nodeCount: instances.length,
    },
  };
}

/**
 * 扫描受影响的流程定义
 *
 * @deprecated workflowDef 已改为代码唯一来源，且所有表单均使用 roleCode，
 * 流程定义层无用户级交接需求。交接仅作用于在途审批单。
 */
async function scanAffectedFormTypes(_sourceUserId: number): Promise<AffectedFormType[]> {
  return [];
}

/**
 * 扫描在途审批单（pending 状态且 assigned 给指定用户的节点）
 */
async function scanInFlightInstances(sourceUserId: number): Promise<AffectedInstance[]> {
  const result = await query<{
    node_id: number;
    instance_id: number;
    node_order: number;
    node_name: string;
    instance_no: string;
    title: string;
    form_type_name: string;
    form_type_code: string;
  }>(
    `SELECT n.id AS node_id, n.instance_id, n.node_order, n.node_name,
            i.instance_no, i.title, ft.name AS form_type_name, ft.code AS form_type_code
     FROM oa_approval_nodes n
     JOIN oa_approval_instances i ON i.id = n.instance_id
     JOIN oa_form_types ft ON ft.id = i.form_type_id
     WHERE n.assigned_user_id = $1 AND n.status = 'pending'
     ORDER BY i.submitted_at DESC`,
    [sourceUserId]
  );

  return result.rows.map(row => ({
    nodeId: row.node_id,
    instanceId: row.instance_id,
    instanceNo: row.instance_no,
    title: row.title,
    formTypeName: row.form_type_name,
    formTypeCode: row.form_type_code,
    nodeOrder: row.node_order,
    nodeName: row.node_name,
  }));
}

/**
 * 搜索用户（用于交接人员选择器）
 * 空关键词时返回全部启用用户（支持下拉浏览），有关键词时模糊搜索
 */
export async function searchUsers(keyword: string): Promise<Array<{ id: number; name: string }>> {
  if (!keyword || keyword.trim().length < 1) {
    // 无关键词：返回全部启用用户，支持下拉浏览
    const result = await query<{ id: number; name: string }>(
      `SELECT id, name FROM users WHERE status = 1 ORDER BY name LIMIT 100`,
      []
    );
    return result.rows;
  }

  // 有关键词：模糊搜索
  const result = await query<{ id: number; name: string }>(
    `SELECT id, name FROM users
     WHERE status = 1
       AND (name ILIKE $1 OR id::text = $1)
     ORDER BY name
     LIMIT 20`,
    [`%${keyword}%`]
  );

  return result.rows;
}

/** 交接历史日志行类型（handover_log） */
interface HandoverLogRow {
  id: number;
  source_user_name: string;
  target_user_name: string;
  operator_name: string;
  form_types_updated: number;
  instances_updated: number;
  nodes_reassigned: number;
  affected_form_type_codes: string[];
  affected_instance_ids: number[] | null;
  created_at: string;
}

/**
 * 获取交接历史记录（分页）
 */
export async function getHandoverHistory(
  page: number = 1,
  pageSize: number = 20
): Promise<{ list: Array<Record<string, unknown>>; total: number }> {
  const offset = (page - 1) * pageSize;

  const [listResult, countResult] = await Promise.all([
    query<HandoverLogRow>(
      `SELECT id, source_user_name, target_user_name, operator_name,
              form_types_updated, instances_updated, nodes_reassigned,
              affected_form_type_codes, affected_instance_ids, created_at
       FROM oa_workflow_handovers
       ORDER BY created_at DESC
       LIMIT $1 OFFSET $2`,
      [pageSize, offset]
    ),
    query<{ total: string }>(`SELECT COUNT(*) as total FROM oa_workflow_handovers`),
  ]);

  return {
    list: listResult.rows.map(row => ({
      id: row.id,
      sourceUserName: row.source_user_name,
      targetUserName: row.target_user_name,
      operatorName: row.operator_name,
      instancesUpdated: row.instances_updated,
      affectedFormTypeCodes: row.affected_form_type_codes,
      affectedInstanceIds: row.affected_instance_ids ?? [],
      createdAt: row.created_at,
    })),
    total: parseInt(countResult.rows[0].total),
  };
}
