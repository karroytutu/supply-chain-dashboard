/**
 * OA流程交接 - 扫描服务
 * 扫描受影响的流程定义和在途审批单
 * @module services/oa/handover/handover-scanner
 */

import { createLogger } from '../../../utils/logger';
const log = createLogger('HandoverScanner');

import { appQuery as query } from '../../../db/appPool';
import type { WorkflowDef } from '../oa.types';

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
 * 扫描指定用户在流程定义和在途审批单中的影响范围
 */
export async function scanHandoverImpact(sourceUserId: number): Promise<HandoverScanResult> {
  // 1. 扫描流程定义：找出 handler.userId 匹配的表单类型
  const formTypes = await scanAffectedFormTypes(sourceUserId);

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
 */
async function scanAffectedFormTypes(sourceUserId: number): Promise<AffectedFormType[]> {
  const result = await query<{ code: string; name: string; category: string; workflow_def: WorkflowDef }>(
    `SELECT code, name, category, workflow_def
     FROM oa_form_types
     WHERE is_active = true
     ORDER BY category, sort_order`
  );

  const affected: AffectedFormType[] = [];

  for (const row of result.rows) {
    const nodes = row.workflow_def?.nodes || [];
    const matchedNodes = nodes
      .filter(node => node.handler?.userId === sourceUserId)
      .map(node => ({ order: node.order, name: node.name }));

    if (matchedNodes.length > 0) {
      affected.push({
        code: row.code,
        name: row.name,
        category: row.category,
        affectedNodes: matchedNodes,
      });
    }
  }

  return affected;
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
 */
export async function searchUsers(keyword: string): Promise<Array<{ id: number; name: string }>> {
  if (!keyword || keyword.length < 1) return [];

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

/** 交接历史日志行类型 */
interface HandoverLogRow {
  id: number;
  source_user_name: string;
  target_user_name: string;
  operator_name: string;
  form_types_updated: number;
  instances_updated: number;
  nodes_reassigned: number;
  affected_form_type_codes: string[];
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
              affected_form_type_codes, created_at
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
      formTypesUpdated: row.form_types_updated,
      instancesUpdated: row.instances_updated,
      nodesReassigned: row.nodes_reassigned,
      affectedFormTypeCodes: row.affected_form_type_codes,
      createdAt: row.created_at,
    })),
    total: parseInt(countResult.rows[0].total),
  };
}
