/**
 * ERP Meta 工具函数
 * 管理 oa_approval_instances.erp_meta 的读写操作
 * @module services/fixed-asset/erp-meta-utils
 */
import { createLogger } from '../../utils/logger';
const log = createLogger('FixedAsset');

import { appQuery } from '../../db/appPool';
import type { ErpMeta, OaInstanceRow } from '../oa/oa.types';
import { OA_AUTO_NODE_STUCK_TIMEOUT_MS } from '../../utils/constants';

/** ERP处理状态类型 */
export type ErpMetaStatus = ErpMeta['status'];

/**
 * 从审批实例中解析 erp_meta
 */
export function getErpMeta(instance: OaInstanceRow): ErpMeta | null {
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
export async function updateErpMetaStatus(
  instanceId: number,
  status: ErpMetaStatus
): Promise<void> {
  await getAndUpdateErpMeta(instanceId, meta => {
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
  await getAndUpdateErpMeta(instanceId, meta => {
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
  await getAndUpdateErpMeta(instanceId, meta => {
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
 * 支持新的实例级 erp_failed 状态：重置实例为 processing，auto 节点为 pending
 */
export async function retryErpOperation(instanceId: number): Promise<void> {
  // 校验实例状态：必须为 erp_failed 才能重试，processing 时拒绝
  const statusResult = await appQuery<{ status: string }>(
    `SELECT status FROM oa_approval_instances WHERE id = $1`,
    [instanceId]
  );
  if (statusResult.rows[0]?.status === 'processing') {
    throw new Error('审批正在处理中，请稍后重试');
  }
  if (statusResult.rows[0]?.status !== 'erp_failed') {
    throw new Error('审批实例状态不是 erp_failed，无法重试');
  }

  const result = await appQuery<{ erp_meta: ErpMeta | null; form_type_id: number }>(
    `SELECT erp_meta, form_type_id FROM oa_approval_instances WHERE id = $1`,
    [instanceId]
  );

  if (!result.rows[0]?.erp_meta) {
    throw new Error('审批实例不存在或无 erp_meta');
  }

  // 重置 erp_meta 状态为 pending
  const erpMeta = result.rows[0].erp_meta;
  erpMeta.status = 'pending';
  erpMeta.requestLog = null;

  await setErpMeta(instanceId, erpMeta);

  // 重置实例 → processing
  await appQuery(
    `UPDATE oa_approval_instances SET status = 'processing', updated_at = NOW() WHERE id = $1`,
    [instanceId]
  );

  // 重置 auto 节点 → pending（清除失败信息）
  await appQuery(
    `UPDATE oa_approval_nodes SET status = 'pending', comment = NULL
     WHERE instance_id = $1 AND node_type = 'auto'`,
    [instanceId]
  );

  // 获取表单类型并重新触发回调
  const formTypeResult = await appQuery<{ code: string }>(
    `SELECT code FROM oa_form_types WHERE id = $1`,
    [result.rows[0].form_type_id]
  );

  if (formTypeResult.rows[0]) {
    const { getFormTypeByCode } = await import('../oa/form-types');
    const formType = getFormTypeByCode(formTypeResult.rows[0].code);

    if (formType?.onApproved) {
      const instanceResult = await appQuery<OaInstanceRow>(
        `SELECT * FROM oa_approval_instances WHERE id = $1`,
        [instanceId]
      );
      const instance = instanceResult.rows[0];
      if (instance) {
        const formData = instance.form_data as Record<string, unknown>;

        // 标记 auto 节点为 processing
        await appQuery(
          `UPDATE oa_approval_nodes SET status = 'processing', acted_at = NOW()
           WHERE instance_id = $1 AND node_type = 'auto'`,
          [instanceId]
        );

        // 异步触发回调（与 executeAutoNodeCallback 契约一致）
        formType
          .onApproved(instance, formData)
          .then(async () => {
            await appQuery(
              `UPDATE oa_approval_nodes SET status = 'approved' WHERE instance_id = $1 AND node_type = 'auto'`,
              [instanceId]
            );
            await appQuery(
              `UPDATE oa_approval_instances SET status = 'approved', completed_at = NOW(), updated_at = NOW() WHERE id = $1`,
              [instanceId]
            );
          })
          .catch(async err => {
            const errMsg = err instanceof Error ? err.message : String(err);
            log.error(`ERP重试回调执行失败 [${formType.code}]:`, err);
            await markErpFailed(instanceId, { error: errMsg, source: 'erp_retry' });
            await appQuery(
              `UPDATE oa_approval_nodes SET status = 'failed', comment = $1 WHERE instance_id = $2 AND node_type = 'auto'`,
              [errMsg, instanceId]
            );
            await appQuery(
              `UPDATE oa_approval_instances SET status = 'erp_failed', updated_at = NOW() WHERE id = $1`,
              [instanceId]
            );
          });
      }
    }
  }
}

/**
 * 恢复卡住的 processing 实例
 * 处理场景：服务器在回调执行中重启，实例永远停在 processing
 * @returns 恢复的实例数量
 */
export async function recoverStuckProcessing(): Promise<number> {
  const stuck = await appQuery<{ id: number; erp_meta: ErpMeta }>(
    `SELECT id, erp_meta FROM oa_approval_instances
     WHERE status = 'processing'
       AND updated_at < NOW() - ($1 || ' milliseconds')::interval`,
    [String(OA_AUTO_NODE_STUCK_TIMEOUT_MS)]
  );

  let recovered = 0;
  for (const row of stuck.rows) {
    const meta = row.erp_meta;
    if (meta?.status === 'completed' || meta?.status === 'erp_completed') {
      // erp_meta 已经是终态但实例仍 processing → 直接完成
      await appQuery(
        `UPDATE oa_approval_instances SET status = 'approved', completed_at = NOW(), updated_at = NOW() WHERE id = $1`,
        [row.id]
      );
      await appQuery(
        `UPDATE oa_approval_nodes SET status = 'approved' WHERE instance_id = $1 AND node_type = 'auto'`,
        [row.id]
      );
    } else {
      // erp_meta 仍在中间态 → 标记失败
      await markErpFailed(row.id, { error: 'Auto node stuck timeout', source: 'stuck_recovery' });
      await appQuery(
        `UPDATE oa_approval_instances SET status = 'erp_failed', updated_at = NOW() WHERE id = $1`,
        [row.id]
      );
      await appQuery(
        `UPDATE oa_approval_nodes SET status = 'failed', comment = '执行超时' WHERE instance_id = $1 AND node_type = 'auto'`,
        [row.id]
      );
    }
    recovered++;
  }
  return recovered;
}

/**
 * 恢复卡住的 pending + auto 节点实例
 * 处理场景：审批通过后 auto 节点回调因进程重启丢失，实例停在 pending 状态
 * 与 recoverStuckProcessing() 互补：后者处理 processing 状态，此函数处理 pending 状态
 * @returns 恢复的实例数量
 */
export async function recoverStuckAutoNodes(): Promise<number> {
  // 检测：实例 status='pending' + 存在 pending 的 auto 节点 + 超过 5 分钟无更新
  // 注意：不再依赖 current_node_order JOIN，因为 insertCollectionNode 会 shift auto 节点的 node_order
  const stuck = await appQuery<{ id: number }>(
    `SELECT i.id FROM oa_approval_instances i
     WHERE i.status = 'pending'
       AND i.updated_at < NOW() - interval '5 minutes'
       AND EXISTS (
         SELECT 1 FROM oa_approval_nodes n
         WHERE n.instance_id = i.id
           AND n.node_type = 'auto'
           AND n.status = 'pending'
       )`
  );

  if (stuck.rows.length === 0) return 0;

  // 动态导入避免循环依赖
  const { retryAutoNode } = await import('../oa/oa.mutation');

  let recovered = 0;
  for (const row of stuck.rows) {
    try {
      await retryAutoNode(row.id);
      log.info(`auto节点pending恢复成功 [instanceId=${row.id}]`);
      recovered++;
    } catch (error) {
      log.error(`auto节点pending恢复失败 [instanceId=${row.id}]:`, error);
    }
  }
  return recovered;
}
