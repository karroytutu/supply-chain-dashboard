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
    formSchema: codeDefinition?.formSchema || row.form_schema,
    // 版本比对：代码版本高于 DB 时用代码定义（新开发安全优先），否则 DB 优先（支持流程交接等运行时修改）
    workflowDef: (() => {
      const codeVersion = codeDefinition?.version || 0;
      const dbVersion = row.version || 0;
      if (codeDefinition && codeVersion > dbVersion) return codeDefinition.workflowDef;
      return row.workflow_def || codeDefinition?.workflowDef;
    })(),
    ...(codeDefinition?.beforeSubmit && { beforeSubmit: codeDefinition.beforeSubmit }),
    ...(codeDefinition?.onNodeCompleted && { onNodeCompleted: codeDefinition.onNodeCompleted }),
    ...(codeDefinition?.onApproved && { onApproved: codeDefinition.onApproved }),
    ...(codeDefinition?.getCCRoles && { getCCRoles: codeDefinition.getCCRoles }),
    ...(codeDefinition?.resolvePreviewContext && {
      resolvePreviewContext: codeDefinition.resolvePreviewContext,
    }),
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
    skipped: '已跳过',
    cancelled: '已取消',
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
       AND n.assigned_user_id = $2
       AND n.status = 'pending'
       AND n.node_order = i.current_node_order
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
