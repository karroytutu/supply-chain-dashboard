/**
 * OA变更操作 - 共享工具函数
 * @module services/oa/mutations/shared-utils
 */

import { appQuery as query, getAppClient } from '../../../db/appPool';
import { PoolClient } from 'pg';
import { OaInstanceRow, OaNodeRow, NodeType, NodeInputSchema, TimeoutConfig, SignMode } from '../oa.types';
import { getFormTypeByCode } from '../form-types';

/**
 * 合并 inputData 到 form_data
 * data_input 类型节点完成后，将录入数据合并到实例的表单数据中
 *
 * 规则：
 * - undefined = 未提交，跳过（不修改原值）
 * - null = 用户显式清空，允许覆盖
 */
export function mergeFormData(
  formData: Record<string, unknown>,
  inputData: Record<string, unknown>
): Record<string, unknown> {
  const merged = { ...formData };
  for (const [key, value] of Object.entries(inputData)) {
    if (value !== undefined) {
      merged[key] = value;
    }
  }
  return merged;
}

/**
 * 事务辅助函数
 */
export async function transaction<T>(callback: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await getAppClient();
  try {
    await client.query('BEGIN');
    const result = await callback(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

/** 构建通知参数的通用数据查询 */
export async function getInstanceNotifyData(instanceId: number) {
  const instResult = await query<OaInstanceRow>(
    `SELECT * FROM oa_approval_instances WHERE id = $1`,
    [instanceId]
  );
  if (instResult.rows.length === 0) return null;
  const instance = instResult.rows[0];

  const ftResult = await query<{ code: string; name: string }>(
    `SELECT code, name FROM oa_form_types WHERE id = $1`,
    [instance.form_type_id]
  );
  const formTypeCode = ftResult.rows[0]?.code;
  const formTypeName = ftResult.rows[0]?.name || '';
  const formType = formTypeCode ? getFormTypeByCode(formTypeCode) : undefined;

  return { instance, formTypeName, formType, formTypeCode };
}

/**
 * 动态插入节点（在指定节点之后）
 * 1. 将 afterOrder 之后的所有节点 node_order +1（单条 SQL）
 * 2. 在 afterOrder + 1 位置插入新节点
 * 3. 返回新插入的节点
 *
 * @param client - 数据库连接（需在事务内）
 * @param instanceId - OA 实例 ID
 * @param afterOrder - 在此节点顺序之后插入
 * @param newNode - 新节点配置
 */
export async function insertNodeAfter(
  client: PoolClient,
  instanceId: number,
  afterOrder: number,
  newNode: {
    name: string;
    type: NodeType;
    /** 处理人规则（可选，转交/加签时由调用方解析后传入） */
    handler?: { roleCode?: string };
    assignedUserId?: number;
    assignedUserName?: string;
    inputSchema?: NodeInputSchema;
    /** 签署模式（可选） */
    signMode?: SignMode;
    /** 时限配置（可选，转交/加签时继承原节点配置） */
    timeout?: TimeoutConfig;
  }
): Promise<OaNodeRow> {
  const newOrder = afterOrder + 1;

  // 1. 将 afterOrder 之后的所有节点 node_order +1（单条 SQL，替代循环逐条更新）
  await client.query(
    `UPDATE oa_approval_nodes
     SET node_order = node_order + 1, updated_at = NOW()
     WHERE instance_id = $1 AND node_order >= $2`,
    [instanceId, newOrder]
  );

  // 计算 deadline_at（转交/加签时重新计算截止时间）
  const deadlineAt = newNode.timeout
    ? new Date(Date.now() + newNode.timeout.durationMinutes * 60000)
    : null;
  const timeoutConfigJson = newNode.timeout
    ? JSON.stringify(newNode.timeout)
    : null;

  // 2. 插入新节点（转交/加签时重置催办状态）
  const insertResult = await client.query<OaNodeRow>(
    `INSERT INTO oa_approval_nodes
       (instance_id, node_order, node_name, node_type, role_code,
        assigned_user_id, assigned_user_name, input_schema, status,
        deadline_at, timeout_config, reminder_count, sign_mode)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'pending', $9, $10, 0, $11)
     RETURNING *`,
    [
      instanceId,
      newOrder,
      newNode.name,
      newNode.type,
      newNode.handler?.roleCode || null,
      newNode.assignedUserId || null,
      newNode.assignedUserName || null,
      newNode.inputSchema ? JSON.stringify(newNode.inputSchema) : null,
      deadlineAt,
      timeoutConfigJson,
      newNode.signMode || null,
    ]
  );

  return insertResult.rows[0];
}
