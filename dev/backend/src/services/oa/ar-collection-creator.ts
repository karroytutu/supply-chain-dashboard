/**
 * 逾期催收 - OA实例创建定时任务
 * @module services/oa/ar-collection-creator
 *
 * 直接检测 ERP 逾期欠款并创建 OA 催收实例，替代旧的 ar-collection-task-generator。
 * 流程：拉取ERP欠款 → 富化 → 压单排除 → 准入规则 → 按客户+逾期日聚合 → 创建OA实例
 */

import { createLogger } from '../../utils/logger';
const log = createLogger('ArCollectionCreator');

import { appQuery as query, getAppClient } from '../../db/appPool';
import { fetchAllErpDebts } from '../erp-client/erp-debt.service';
import { enrichDebtRecords, filterHoardDebts } from '../ar-collection/ar-debt-enrichment.service';
import { evaluateEntryRules, extractEntryMetadata, COLLECTION_ENTRY_RULES } from '../ar-collection/ar-collection-entry-rules';
import type { EnrichedDebtRecord } from '../ar-collection/ar-debt.types';
import { submitApproval } from './mutations/submit-approval';
import { getFormTypeByCode } from './form-types';
import { generateInstanceNo } from './oa-utils';
import { AR_DEFAULT_EXPIRE_DAYS, AR_SETTLE_METHOD_CONSUMER_EXPIRE } from '../../utils/constants';

/** Advisory Lock 标识（与旧生成器共用同一个锁，防止并发） */
const ADVISORY_LOCK_ID = 20260421;

// =====================================================
// 导出函数
// =====================================================

/** 生成催收OA实例（入口函数，含 Advisory Lock 防并发） */
export async function generateCollectionOaInstances(): Promise<void> {
  log.info('开始生成催收OA实例...');

  const client = await getAppClient();
  try {
    const lockResult = await client.query(`SELECT pg_try_advisory_lock($1) AS locked`, [ADVISORY_LOCK_ID]);
    if (!lockResult.rows[0].locked) {
      log.warn('另一个催收任务生成进程正在运行，跳过本次执行');
      return;
    }
    try {
      await generateCollectionOaInstancesInner();
    } finally {
      await client.query(`SELECT pg_advisory_unlock($1)`, [ADVISORY_LOCK_ID]);
    }
  } finally {
    client.release();
  }
}

// =====================================================
// 内部实现
// =====================================================

async function generateCollectionOaInstancesInner(): Promise<void> {
  const now = new Date();

  // 1. 从ERP获取所有欠款
  const rawDebts = await fetchAllErpDebts();
  if (rawDebts.length === 0) {
    log.info('ERP无欠款记录，跳过');
    return;
  }

  // 2. 富化欠款记录（添加 hoardTag、maxAllowedDays、overdueDays 等）
  const enrichedDebts = await enrichDebtRecords(rawDebts, now);

  // 3. 排除压单
  const eligibleDebts = filterHoardDebts(enrichedDebts);
  if (eligibleDebts.length === 0) {
    log.info('排除压单后无 eligible 欠款，跳过');
    return;
  }

  // 4. 按客户分组
  const debtsByConsumer = groupByConsumer(eligibleDebts);

  // 5. 准入规则评估
  const verdicts = evaluateEntryRules(debtsByConsumer, { now, ruleConfigs: COLLECTION_ENTRY_RULES });
  const { enteringDebts, entryReasons } = extractEntryMetadata(verdicts);

  if (enteringDebts.length === 0) {
    log.info('准入规则评估后无需要入催的欠款，跳过');
    return;
  }
  log.info(`准入规则评估: ${enteringDebts.length} 笔欠款需要入催, 原因: ${entryReasons.join(', ')}`);

  // 6. 按客户聚合（同一客户仅允许一个活跃催收实例）
  const groups = groupByConsumer(enteringDebts);

  // 7. 查询已有未完成的OA催收实例（防重复）
  const existingInstances = await queryExistingOaInstances();

  // 8. 获取系统用户（用于 submitApproval 的提交人）
  const systemUser = await getSystemUser();
  if (!systemUser) {
    log.error('未找到系统用户，无法创建OA实例');
    return;
  }

  // 9. 获取表单类型定义
  const formType = getFormTypeByCode('ar_collection');
  if (!formType) {
    log.error('未找到 ar_collection 表单类型定义');
    return;
  }

  // 10. 为每组创建OA实例（支持批量优化）
  const groupsArray = Array.from(groups.entries());
  const batchSize = 20; // 每批处理20个实例
  let createdCount = 0;

  for (let i = 0; i < groupsArray.length; i += batchSize) {
    const batch = groupsArray.slice(i, i + batchSize);
    const batchResults = await createBatchOaInstances(batch, formType, systemUser, existingInstances);
    createdCount += batchResults;

    if (groupsArray.length > batchSize) {
      log.info(`批量创建进度: ${Math.min(i + batchSize, groupsArray.length)}/${groupsArray.length}, 已创建 ${createdCount} 个`);
    }
  }

  log.info(`催收OA实例生成完成: 创建 ${createdCount} 个实例`);
}

// =====================================================
// 批量创建辅助函数
// =====================================================

/**
 * 批量创建OA实例（使用单个事务处理多个实例，提升性能）
 * @param batch 批次的 [key, debts] 数组
 * @param formType 表单类型定义
 * @param systemUser 系统用户
 * @param existingInstances 已有实例的 key 集合
 * @returns 成功创建的实例数
 */
async function createBatchOaInstances(
  batch: [string, EnrichedDebtRecord[]][],
  formType: ReturnType<typeof getFormTypeByCode>,
  systemUser: { id: number; name: string; dept: string | null },
  existingInstances: Set<string>
): Promise<number> {
  if (!formType) return 0;

  const client = await getAppClient();
  let createdCount = 0;

  try {
    await client.query('BEGIN');

    for (const [consumerName, debts] of batch) {
      // 检查是否已有未完成的OA实例（按客户名去重，同一客户仅允许一个活跃催收实例）
      if (existingInstances.has(consumerName)) {
        log.debug(`跳过已有实例: ${consumerName}`);
        continue;
      }

      try {
        const overdueDateStr = getOverdueDateStr(debts[0]);
        const formData = buildFormData(consumerName, overdueDateStr, debts);
        const title = `逾期催收 - ${consumerName}（欠款¥${formData.totalAmount}）`;
        const instanceNo = await generateInstanceNo();

        // 插入实例（使用 form_type_id 子查询，参照 submit-approval.ts）
        const instanceResult = await client.query(
          `INSERT INTO oa_approval_instances
            (instance_no, form_type_id, title, status, applicant_id, applicant_name, applicant_dept, form_data)
           VALUES ($1, (SELECT id FROM oa_form_types WHERE code = $2), $3, 'pending', $4, $5, $6, $7)
           RETURNING id`,
          [instanceNo, 'ar_collection', title, systemUser.id, systemUser.name, systemUser.dept, JSON.stringify(formData)]
        );
        const instanceId = instanceResult.rows[0].id;

        // 插入初始节点（营销师催收 + 自动更新状态）
        await client.query(
          `INSERT INTO oa_approval_nodes
            (instance_id, node_order, node_name, node_type, role_code, status)
           VALUES
            ($1, 1, '营销师催收', 'role', 'marketer', 'pending'),
            ($1, 2, '更新催收状态', 'auto', NULL, 'pending')`,
          [instanceId]
        );

        // 插入操作记录
        await client.query(
          `INSERT INTO oa_approval_actions
            (instance_id, action_type, operator_id, operator_name, node_order, comment)
           VALUES ($1, 'submit', $2, $3, 1, '系统自动创建催收实例')`,
          [instanceId, systemUser.id, systemUser.name]
        );

        createdCount++;
        existingInstances.add(consumerName); // 防止同批次重复
        log.info(`创建催收OA实例: ${title}`);
      } catch (err) {
        log.error(`创建催收OA实例失败 [${consumerName}]:`, err);
        // 继续处理其他组，不阻断
      }
    }

    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    log.error('批量创建OA实例事务失败:', err);
  } finally {
    client.release();
  }

  return createdCount;
}

// =====================================================
// 辅助函数
// =====================================================

function groupByConsumer(debts: EnrichedDebtRecord[]): Map<string, EnrichedDebtRecord[]> {
  const groups = new Map<string, EnrichedDebtRecord[]>();
  for (const debt of debts) {
    const name = debt.consumerName || '未知客户';
    if (!groups.has(name)) groups.set(name, []);
    groups.get(name)!.push(debt);
  }
  return groups;
}

/** 计算单笔欠款的最大逾期日期字符串 */
function getOverdueDateStr(debt: EnrichedDebtRecord): string {
  const maxDays = debt.settleMethod === AR_SETTLE_METHOD_CONSUMER_EXPIRE
    ? (debt.consumerExpireDay || AR_DEFAULT_EXPIRE_DAYS)
    : AR_DEFAULT_EXPIRE_DAYS;
  const overdueDate = new Date(debt.workTime);
  overdueDate.setDate(overdueDate.getDate() + maxDays);
  return overdueDate.toISOString().split('T')[0];
}

async function queryExistingOaInstances(): Promise<Set<string>> {
  const result = await query<{ form_data: Record<string, unknown> }>(
    `SELECT form_data FROM oa_approval_instances i
     JOIN oa_form_types ft ON i.form_type_id = ft.id
     WHERE ft.code = 'ar_collection' AND i.status IN ('pending', 'processing')`
  );
  // 从 form_data 中提取 consumerName 作为去重 key（同一客户仅允许一个活跃催收实例）
  const keys = new Set<string>();
  for (const row of result.rows) {
    const fd = row.form_data;
    if (fd?.consumerName) keys.add(fd.consumerName as string);
  }
  return keys;
}

async function getSystemUser(): Promise<{ id: number; name: string; dept: string | null } | null> {
  const result = await query<{ id: number; name: string; department_name: string | null }>(
    `SELECT u.id, u.name, d.name as department_name
     FROM users u
     LEFT JOIN departments d ON u.department_id = d.id
     WHERE u.status = 1
     ORDER BY CASE WHEN u.name = '系统' THEN 0 ELSE 1 END, u.id
     LIMIT 1`
  );
  if (result.rows.length === 0) return null;
  return { id: result.rows[0].id, name: result.rows[0].name, dept: result.rows[0].department_name };
}

function buildFormData(
  consumerName: string,
  overdueDateStr: string,
  debts: EnrichedDebtRecord[]
): Record<string, unknown> {
  const totalAmount = debts.reduce((sum, d) => sum + (d.leftAmount || 0), 0);
  const maxOverdueDays = Math.max(...debts.map(d => d.overdueDays || 0));
  const managerName = debts[0].managerUsers || null;

  const billDetails = debts.map(d => ({
    billNo: d.billId,
    billType: d.billTypeName || '销售单',
    totalAmount: d.totalAmount,
    leftAmount: d.leftAmount,
    overdueDays: d.overdueDays || 0,
  }));

  return {
    consumerName,
    totalAmount: Math.round(totalAmount * 100) / 100,
    billCount: debts.length,
    maxOverdueDays,
    managerName,
    billDetails,
    _extensionCount: 0,
  };
}
