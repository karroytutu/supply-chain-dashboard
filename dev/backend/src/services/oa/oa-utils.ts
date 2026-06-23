/**
 * OA模块工具函数 - 统一导出入口
 * 表单校验和工作流工具已拆分，此文件保留通用工具并做 re-export
 * @module services/oa/oa-utils
 */

import { appQuery as query } from '../../db/appPool';
import type { PoolClient } from 'pg';
import { getFormTypeByCode as getCodeFormTypeByCode } from './form-types';
import type {
  OaFormTypeRow,
  FormTypeDefinition,
  FormSchema,
  WorkflowDef,
  ApprovalStatus,
  ApprovalNodeStatus,
  OaNodeRow,
} from './oa.types';

// Re-export from split modules
export {
  numberToChineseUpper,
  validateFormData,
  validateInputData,
  checkCondition,
} from './oa-form-utils';
export {
  filterNodesByCondition,
  resolveHandlerRule,
  findUserIdsByRoleCodes,
  evaluateAndTriggerNodes,
} from './oa-workflow-utils';

// =====================================================
// 编号生成
// =====================================================

/**
 * 生成审批实例编号
 * 格式：OA + YYYYMMDD + 4位序号
 */
export async function generateInstanceNo(): Promise<string> {
  const result = await query('SELECT generate_oa_instance_no() as no');
  return result.rows[0].no;
}

// =====================================================
// 行映射工具
// =====================================================

/**
 * 从代码注册表解析 formSchema（代码唯一来源）。
 * dbFallback 仅用于未注册的历史表单类型兼容。
 */
export function resolveFormSchema(code: string, dbFallback?: FormSchema | null): FormSchema {
  return getCodeFormTypeByCode(code)?.formSchema ?? dbFallback ?? { fields: [] };
}

/**
 * 从代码注册表解析 workflowDef（代码提供骨架，DB 提供可编辑配置）。
 * 运行时合并：节点顺序/类型取自代码，处理人/条件/签署模式取自 DB 覆盖值。
 */
function resolveWorkflowDef(code: string, dbOverride?: WorkflowDef | null): WorkflowDef {
  const codeDef = getCodeFormTypeByCode(code)?.workflowDef;
  if (codeDef && dbOverride) {
    return mergeWorkflowDef(codeDef, dbOverride);
  }
  return codeDef ?? dbOverride ?? { nodes: [] };
}

/**
 * 合并代码骨架与 DB 配置覆盖
 * 结构字段（order、type）始终取自代码；配置字段（handler、signMode、condition、ccRoles、name、timeout）取自 DB。
 * DB 无覆盖时回退到代码默认值。
 */
export function mergeWorkflowDef(codeDef: WorkflowDef, dbOverride: WorkflowDef | null): WorkflowDef {
  if (!dbOverride?.nodes?.length) return codeDef;

  const dbByOrder = new Map(dbOverride.nodes.map(n => [n.order, n]));

  const mergedNodes = codeDef.nodes.map(codeNode => {
    const dbNode = dbByOrder.get(codeNode.order);
    if (!dbNode) return codeNode;

    return {
      ...codeNode,
      // 配置字段：DB 覆盖优先，未配置时回退代码默认
      name: dbNode.name ?? codeNode.name,
      handler: dbNode.handler ?? codeNode.handler,
      signMode: dbNode.signMode ?? codeNode.signMode,
      condition: dbNode.condition ?? codeNode.condition,
      ccRoles: dbNode.ccRoles ?? codeNode.ccRoles,
      timeout: dbNode.timeout ?? codeNode.timeout,
    };
  });

  return { nodes: mergedNodes };
}

/**
 * 将数据库行映射为表单类型对象
 */
export function mapFormTypeRow(row: OaFormTypeRow): FormTypeDefinition {
  const codeDefinition = getCodeFormTypeByCode(row.code);

  return {
    code: row.code,
    name: row.name,
    icon: row.icon || 'FileTextOutlined',
    category: row.category,
    sortOrder: row.sort_order,
    description: row.description || '',
    version: row.version,
    // formSchema: 代码为唯一来源，DB 列已废弃
    formSchema: resolveFormSchema(row.code, row.form_schema),
    // workflowDef: 代码提供骨架（节点顺序/类型），DB 提供可编辑配置（处理人/条件/签署模式）
    workflowDef: resolveWorkflowDef(row.code, row.workflow_def),
    ...(row.allowed_roles && { allowedRoles: row.allowed_roles }),
    ...(row.data_read_roles && { dataReadRoles: row.data_read_roles }),
    ...(row.data_export_roles && { dataExportRoles: row.data_export_roles }),
    ...(codeDefinition?.beforeSubmit && { beforeSubmit: codeDefinition.beforeSubmit }),
    ...(codeDefinition?.onNodeCompleted && { onNodeCompleted: codeDefinition.onNodeCompleted }),
    ...(codeDefinition?.onApproved && { onApproved: codeDefinition.onApproved }),
    ...(codeDefinition?.resolvePreviewContext && {
      resolvePreviewContext: codeDefinition.resolvePreviewContext,
    }),
    // fieldPermissions: DB 为唯一来源，不再合并代码默认值
    ...(row.field_permissions
      ? { fieldPermissions: row.field_permissions }
      : {}),
  };
}

// =====================================================
// 状态标签
// =====================================================

/** 获取审批状态显示文本 */
export function getStatusLabel(status: ApprovalStatus): string {
  const labels: Record<ApprovalStatus, string> = {
    pending: '处理中',
    processing: '系统处理中',
    approved: '已通过',
    rejected: '已拒绝',
    erp_failed: 'ERP处理失败',
    cancelled: '已取消',
    withdrawn: '已撤回',
  };
  return labels[status];
}

/** 获取节点状态显示文本 */
export function getNodeStatusLabel(status: ApprovalNodeStatus): string {
  const labels: Record<ApprovalNodeStatus, string> = {
    pending: '待处理',
    processing: '处理中',
    approved: '已通过',
    rejected: '已拒绝',
    transferred: '已转交',
    failed: '处理失败',
    cancelled: '已取消',
    send_back: '已退回',
  };
  return labels[status];
}

// =====================================================
// 权限检查
// =====================================================

/**
 * 获取当前审批节点
 */
export async function getCurrentApproverNode(
  client: PoolClient | null,
  instanceId: number,
  userId: number
): Promise<OaNodeRow | null> {
  const sql = `SELECT n.* FROM oa_approval_nodes n
     JOIN oa_approval_instances i ON i.id = n.instance_id
     WHERE n.instance_id = $1
       AND $2 = ANY(n.assigned_user_ids)
       AND n.status = 'pending'
       AND n.node_type IN ('approval', 'handle')
       AND n.node_order = i.current_node_order
     ORDER BY n.round DESC
     LIMIT 1`;
  const result = client
    ? await client.query<OaNodeRow>(sql, [instanceId, userId])
    : await query<OaNodeRow>(sql, [instanceId, userId]);
  return result.rows[0] || null;
}

/** 检查用户是否为当前审批人 */
export async function isCurrentApprover(instanceId: number, userId: number): Promise<boolean> {
  const node = await getCurrentApproverNode(null, instanceId, userId);
  return node !== null;
}

/** 检查用户是否为申请人 */
export async function isApplicant(instanceId: number, userId: number): Promise<boolean> {
  const result = await query(
    `SELECT 1 FROM oa_approval_instances WHERE id = $1 AND applicant_id = $2`,
    [instanceId, userId]
  );
  return result.rows.length > 0;
}

/**
 * 检查用户是否为审批流程参与者（申请人 / 任意节点分配人 / 抄送人）
 * 用于评论权限校验，不影响审批/拒绝/转交等操作权限
 */
export async function isApprovalParticipant(
  instanceId: number, userId: number
): Promise<boolean> {
  const result = await query<{ is_participant: boolean }>(
    `SELECT (
       EXISTS(SELECT 1 FROM oa_approval_instances WHERE id = $1 AND applicant_id = $2)
       OR EXISTS(SELECT 1 FROM oa_approval_nodes WHERE instance_id = $1 AND $2 = ANY(assigned_user_ids))
       OR EXISTS(SELECT 1 FROM oa_approval_cc WHERE instance_id = $1 AND user_id = $2)
     ) AS is_participant`,
    [instanceId, userId]
  );
  return result.rows[0].is_participant;
}
