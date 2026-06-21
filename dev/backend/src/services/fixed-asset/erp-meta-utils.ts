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

/** 定时恢复任务并发控制标志 */
let _recoverProcessingRunning = false;
let _recoverAutoNodesRunning = false;

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
 * 合并数据到 form_data（供 auto 节点回调回写自动生成字段）
 * 使用 jsonb || 运算符一次合并多个键，保留 form_data 中已有字段
 */
export async function mergeFormData(
  instanceId: number,
  data: Record<string, unknown>
): Promise<void> {
  await appQuery(
    `UPDATE oa_approval_instances
     SET form_data = COALESCE(form_data, '{}'::jsonb) || $1::jsonb,
         updated_at = NOW()
     WHERE id = $2`,
    [JSON.stringify(data), instanceId]
  );
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

  const result = await appQuery<{ erp_meta: ErpMeta | null }>(
    `SELECT erp_meta FROM oa_approval_instances WHERE id = $1`,
    [instanceId]
  );

  if (!result.rows[0]?.erp_meta) {
    throw new Error('审批实例不存在或无 erp_meta');
  }

  // 重置 erp_meta 状态为 pending（retryAutoNode 会重新设置为 processing）
  const erpMeta = result.rows[0].erp_meta;
  erpMeta.status = 'pending';
  erpMeta.requestLog = null;
  erpMeta.responseData = {}; // 清理前次 ERP 响应，避免重试时数据冲突
  await setErpMeta(instanceId, erpMeta);

  // 委托给 retryAutoNode 统一执行，获得幂等保护、节点链式处理、通知发送等完整功能
  const { retryAutoNode } = await import('../oa/oa.mutation');
  await retryAutoNode(instanceId);
}

/**
 * 恢复卡住的 processing 实例
 * 处理场景：服务器在回调执行中重启，实例永远停在 processing
 * @returns 恢复的实例数量
 */
export async function recoverStuckProcessing(): Promise<number> {
  if (_recoverProcessingRunning) {
    log.warn('recoverStuckProcessing 上一轮尚未完成，跳过本次执行');
    return 0;
  }
  _recoverProcessingRunning = true;
  try {
  const stuck = await appQuery<{ id: number; erp_meta: ErpMeta }>(
    `SELECT id, erp_meta FROM oa_approval_instances
     WHERE status = 'processing'
       AND updated_at < NOW() - ($1 || ' milliseconds')::interval`,
    [String(OA_AUTO_NODE_STUCK_TIMEOUT_MS)]
  );

  let recovered = 0;
  for (const row of stuck.rows) {
    try {
      const meta = row.erp_meta;
      if (meta?.status === 'completed' || meta?.status === 'erp_completed') {
        // 【安全检查】确认 auto 节点之前没有未完成的人工环节，防止误将提前执行的 auto 节点标记为审批通过
        // 先查 auto 节点的 node_order，再做位置感知过滤（auto 节点之后的人工节点属于正常 pending）
        const autoNodeOrder = await appQuery<{ node_order: number }>(
          `SELECT MIN(node_order) AS node_order FROM oa_approval_nodes
           WHERE instance_id = $1 AND node_type = 'auto'`,
          [row.id]
        );
        const humanCheck = await appQuery<{ blocked: boolean }>(
          `SELECT EXISTS (
            SELECT 1 FROM oa_approval_nodes n
            WHERE n.instance_id = $1 AND n.node_type != 'auto'
              AND n.node_order < $2
              AND n.status IN ('pending', 'processing')
          ) AS blocked`,
          [row.id, autoNodeOrder.rows[0]?.node_order ?? 0]
        );
        if (humanCheck.rows[0]?.blocked) {
          log.warn(
            `[recoverStuckProcessing] 跳过：instanceId=${row.id} 仍有未完成人工环节，` +
            `erp_meta=${meta?.status} 可能是提前执行导致，标记为 erp_failed 等待人工介入`
          );
          await markErpFailed(row.id, {
            error: 'erp_meta 为终态但人工环节未完成，疑似提前执行',
            source: 'stuck_recovery_safety_check',
          });
          await appQuery(
            `UPDATE oa_approval_instances SET status = 'erp_failed', updated_at = NOW()
             WHERE id = $1 AND status = 'processing'`,
            [row.id]
          );
          recovered++;
          continue;
        }

        // erp_meta 已经是终态且 auto 节点之前的人工环节都已完成 → 直接完成
        await appQuery(
          `UPDATE oa_approval_instances
           SET status = 'approved', completed_at = NOW(), updated_at = NOW(),
               erp_meta = jsonb_set(COALESCE(erp_meta, '{}'), '{status}', '"completed"')
           WHERE id = $1 AND status = 'processing'`,
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
          `UPDATE oa_approval_instances SET status = 'erp_failed', updated_at = NOW()
           WHERE id = $1 AND status = 'processing'`,
          [row.id]
        );
        await appQuery(
          `UPDATE oa_approval_nodes SET status = 'failed', comment = '执行超时' WHERE instance_id = $1 AND node_type = 'auto'`,
          [row.id]
        );
      }
      recovered++;
    } catch (error) {
      log.error(`[recoverStuckProcessing] 实例恢复失败 [instanceId=${row.id}]:`, error);
    }
  }
  return recovered;
  } finally {
    _recoverProcessingRunning = false;
  }
}

/**
 * 恢复卡住的 pending + auto 节点实例
 * 处理场景：审批通过后 auto 节点回调因进程重启丢失，实例停在 pending 状态
 * 与 recoverStuckProcessing() 互补：后者处理 processing 状态，此函数处理 pending 状态
 * @returns 恢复的实例数量
 */
export async function recoverStuckAutoNodes(): Promise<number> {
  if (_recoverAutoNodesRunning) {
    log.warn('recoverStuckAutoNodes 上一轮尚未完成，跳过本次执行');
    return 0;
  }
  _recoverAutoNodesRunning = true;
  try {
  // 检测：实例 status='pending' + 存在 pending 的 auto/cc 节点 + 超过 5 分钟无更新
  // 关键：排除 auto/cc 节点前仍有未完成人工节点的实例（它们正在正常等待人工审批，不属于“卡住”）
  // 例如催收审批：节点1=营销师催收(pending) + 节点2=更新催收状态(auto,pending)
  //   此时 auto 节点尚未轮到执行，不应触发恢复
  const stuck = await appQuery<{ id: number }>(
    `SELECT i.id FROM oa_approval_instances i
     WHERE i.status = 'pending'
       AND i.updated_at < NOW() - interval '5 minutes'
       AND EXISTS (
         SELECT 1 FROM oa_approval_nodes n
         WHERE n.instance_id = i.id
           AND n.node_type IN ('auto', 'cc')
           AND n.status = 'pending'
       )
       -- 排除 auto/cc 节点前仍有 pending/processing 人工节点的实例
       AND NOT EXISTS (
         SELECT 1 FROM oa_approval_nodes hn
         WHERE hn.instance_id = i.id
           AND hn.node_type NOT IN ('auto', 'cc')
           AND hn.status IN ('pending', 'processing')
           AND hn.node_order < (
             SELECT MIN(an.node_order) FROM oa_approval_nodes an
             WHERE an.instance_id = i.id AND an.node_type IN ('auto', 'cc') AND an.status = 'pending'
           )
       )`
  );

  if (stuck.rows.length === 0) return 0;

  // 异常告警：正常情况下不应同时出现大量卡住的审批单
  if (stuck.rows.length > 10) {
    log.warn(`[recoverStuckAutoNodes] 异常：检测到 ${stuck.rows.length} 个卡住审批单（阈值 10），请检查`);
  }

  // 动态导入避免循环依赖
  const { retryAutoNode } = await import('../oa/oa.mutation');

  let recovered = 0;
  for (const row of stuck.rows) {
    try {
      // 应用层双重验证：SQL 排除可能因时序问题失效，再次确认 auto/cc 节点之前没有未完成的人工环节
      // 与 SQL 主查询保持一致：仅检查 node_order < MIN(auto/cc.node_order) 的人工节点
      const verify = await appQuery<{ blocked: boolean }>(
        `SELECT EXISTS (
          SELECT 1 FROM oa_approval_nodes hn
          WHERE hn.instance_id = $1 AND hn.node_type NOT IN ('auto', 'cc')
            AND hn.status IN ('pending', 'processing')
            AND hn.node_order < (
              SELECT MIN(an.node_order) FROM oa_approval_nodes an
              WHERE an.instance_id = $1 AND an.node_type IN ('auto', 'cc') AND an.status = 'pending'
            )
        ) AS blocked`,
        [row.id]
      );
      if (verify.rows[0]?.blocked) {
        log.warn(`[recoverStuckAutoNodes] 跳过：instanceId=${row.id} 仍有未完成人工环节`);
        continue;
      }

      await retryAutoNode(row.id);
      log.info(`auto节点pending恢复成功 [instanceId=${row.id}]`);
      recovered++;
    } catch (error) {
      log.error(`auto节点pending恢复失败 [instanceId=${row.id}]:`, error);
    }
  }
  return recovered;
  } finally {
    _recoverAutoNodesRunning = false;
  }
}
