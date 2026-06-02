/**
 * OA变更操作 - 共享工具函数
 * @module services/oa/mutations/shared-utils
 */

import { appQuery as query, getAppClient } from '../../../db/appPool';
import { PoolClient } from 'pg';
import { OaInstanceRow } from '../oa.types';
import { getFormTypeByCode } from '../form-types';

/**
 * 合并 inputData 到 form_data
 * data_input 类型节点完成后，将录入数据合并到实例的表单数据中
 */
export function mergeFormData(
  formData: Record<string, unknown>,
  inputData: Record<string, unknown>
): Record<string, unknown> {
  const merged = { ...formData };
  for (const [key, value] of Object.entries(inputData)) {
    if (value !== null && value !== undefined) {
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
