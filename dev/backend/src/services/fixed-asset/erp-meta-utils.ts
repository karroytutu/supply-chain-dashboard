/**
 * ERP Meta 工具函数
 * 管理 oa_approval_instances.erp_meta 的读写操作
 * @module services/fixed-asset/erp-meta-utils
 */

import { appQuery } from '../../db/appPool';
import type { ErpMeta, OaApprovalInstanceRow } from '../oa-approval/oa-approval.types';

/** ERP处理状态类型 */
export type ErpMetaStatus = ErpMeta['status'];

/**
 * 从审批实例中解析 erp_meta
 */
export function getErpMeta(instance: OaApprovalInstanceRow): ErpMeta | null {
  return instance.erp_meta;
}

/**
 * 设置审批实例的完整 erp_meta
 */
export async function setErpMeta(instanceId: number, erpMeta: ErpMeta): Promise<void> {
  await appQuery(
    `UPDATE oa_approval_instances SET erp_meta = $1, updated_at = NOW() WHERE id = $2`,
    [JSON.stringify(erpMeta), instanceId]
  );
}

/**
 * 读取并更新 erp_meta（合并 SELECT + UPDATE 为一次操作，避免冗余查询）
 */
async function getAndUpdateErpMeta(
  instanceId: number,
  updater: (meta: ErpMeta) => void
): Promise<void> {
  const result = await appQuery<{ erp_meta: ErpMeta | null }>(
    `SELECT erp_meta FROM oa_approval_instances WHERE id = $1`,
    [instanceId]
  );

  const current = result.rows[0]?.erp_meta || createInitialErpMeta();
  updater(current);

  await setErpMeta(instanceId, current);
}

/**
 * 更新 ERP 处理状态
 */
export async function updateErpMetaStatus(instanceId: number, status: ErpMetaStatus): Promise<void> {
  await getAndUpdateErpMeta(instanceId, (meta) => {
    meta.status = status;
  });
}

/**
 * 合并 ERP 响应数据到 erp_meta
 */
export async function mergeErpResponseData(
  instanceId: number,
  responseData: Record<string, unknown>
): Promise<void> {
  await getAndUpdateErpMeta(instanceId, (meta) => {
    meta.responseData = { ...meta.responseData, ...responseData };
  });
}

/**
 * 记录 ERP 请求错误并标记状态为 erp_failed
 */
export async function markErpFailed(
  instanceId: number,
  errorLog: Record<string, unknown>
): Promise<void> {
  await getAndUpdateErpMeta(instanceId, (meta) => {
    meta.status = 'erp_failed';
    meta.requestLog = errorLog;
    meta.retries += 1;
  });
}

/**
 * 创建初始 ErpMeta 结构
 */
function createInitialErpMeta(applicationNo?: string): ErpMeta {
  return {
    status: 'pending',
    responseData: {},
    requestLog: null,
    applicationNo: applicationNo || '',
    retries: 0,
  };
}

/**
 * 初始化审批实例的 erp_meta（含 APA 编号）
 * 在 beforeSubmit 回调中调用
 */
export async function initErpMeta(instanceId: number, applicationNo: string): Promise<void> {
  await setErpMeta(instanceId, createInitialErpMeta(applicationNo));
}

/**
 * 生成申请编号
 * 格式：APA + YYYYMMDD + 4位序号
 * 使用序列 asset_application_no_seq 保证唯一性
 */
export async function generateApplicationNo(): Promise<string> {
  const datePrefix = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const result = await appQuery<{ nextval: number }>(
    `SELECT nextval('asset_application_no_seq') as nextval`
  );
  const seqNum = result.rows[0].nextval;
  return `APA${datePrefix}${String(seqNum).padStart(4, '0')}`;
}

/**
 * 重试 ERP 操作
 * 将 erp_failed 状态重置，重新触发回调
 */
export async function retryErpOperation(instanceId: number): Promise<void> {
  const result = await appQuery<{ erp_meta: ErpMeta | null; form_type_id: number }>(
    `SELECT erp_meta, form_type_id FROM oa_approval_instances WHERE id = $1`,
    [instanceId]
  );

  if (!result.rows[0]?.erp_meta || result.rows[0].erp_meta.status !== 'erp_failed') {
    throw new Error('审批实例不存在或ERP状态不是 erp_failed');
  }

  // 重置状态为 pending（表示重新等待 ERP 处理）
  const erpMeta = result.rows[0].erp_meta;
  erpMeta.status = 'pending';
  erpMeta.requestLog = null;

  await setErpMeta(instanceId, erpMeta);

  // 获取表单类型并重新触发回调
  const formTypeResult = await appQuery<{ code: string }>(
    `SELECT code FROM oa_form_types WHERE id = $1`,
    [result.rows[0].form_type_id]
  );

  if (formTypeResult.rows[0]) {
    const { getFormTypeByCode } = await import('../oa-approval/form-types');
    const formType = getFormTypeByCode(formTypeResult.rows[0].code);

    if (formType?.onApproved) {
      const instanceResult = await appQuery<OaApprovalInstanceRow>(
        `SELECT * FROM oa_approval_instances WHERE id = $1`,
        [instanceId]
      );
      const instance = instanceResult.rows[0];
      if (instance) {
        const formData = instance.form_data as Record<string, unknown>;
        // 异步触发回调
        formType.onApproved(instance, formData).catch(err => {
          console.error(`[ERP Retry] 回调执行失败 [${formType.code}]:`, err);
        });
      }
    }
  }
}
