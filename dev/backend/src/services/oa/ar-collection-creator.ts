/**
 * 逾期催收 - OA实例创建定时任务
 * @module services/oa/ar-collection-creator
 *
 * 直接检测 ERP 逾期欠款并创建 OA 催收实例，替代旧的 ar-collection-task-generator。
 * 流程：拉取ERP欠款 → 富化 → 压单排除 → 准入规则 → 按客户+逾期日聚合 → 创建OA实例
 */

import { createLogger } from '../../utils/logger';
const log = createLogger('ArCollectionCreator');

import type { PoolClient } from 'pg';
import { appQuery as query, getAppClient } from '../../db/appPool';
import { fetchAllErpDebts } from '../erp-client/erp-debt.service';
import { enrichDebtRecords, filterHoardDebts } from '../erp-debt/erp-debt-enrichment.service';
import { evaluateEntryRules, extractEntryMetadata, COLLECTION_ENTRY_RULES } from '../ar-collection/ar-collection-entry-rules';
import type { EnrichedDebtRecord } from '../erp-debt/erp-debt.types';
import { getFormTypeByCode } from './form-types';
import { generateInstanceNo } from './oa-utils';
import { createProcessInstance } from './oa-process-centre';
import { notifyPendingApproval } from './oa-notify';
import { initErpMeta } from '../fixed-asset/erp-meta-utils';
import { AR_DEFAULT_EXPIRE_DAYS, AR_SETTLE_METHOD_CONSUMER_EXPIRE } from '../../utils/constants';

/** Advisory Lock 标识（开发/生产使用不同 ID，避免共用数据库时互相阻塞） */
const ADVISORY_LOCK_ID = process.env.NODE_ENV === 'production' ? 20260421 : 20260422;

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

  // 8. 获取系统用户（鑫小财 AI员工，用于 submitApproval 的提交人）
  const systemUser = await getSystemApplicant();
  if (!systemUser) {
    log.error('未找到系统用户「鑫小财」，无法创建OA实例');
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
  const allCreatedInstances: CreatedInstance[] = [];

  for (let i = 0; i < groupsArray.length; i += batchSize) {
    const batch = groupsArray.slice(i, i + batchSize);
    const batchInstances = await createBatchOaInstances(batch, formType, systemUser, existingInstances);
    allCreatedInstances.push(...batchInstances);

    if (groupsArray.length > batchSize) {
      log.info(`批量创建进度: ${Math.min(i + batchSize, groupsArray.length)}/${groupsArray.length}, 已创建 ${allCreatedInstances.length} 个`);
    }
  }

  // 11. 事务提交后，为每个实例调用钉钉集成（壳实例 + 待办 + erp_meta）
  for (const instance of allCreatedInstances) {
    // 11a. 初始化 erp_meta（参照 submit-approval.ts hasAutoNode 逻辑）
    await initErpMeta(instance.instanceId, '').catch(err => {
      log.error(`erp_meta 初始化失败 [instanceId=${instance.instanceId}]:`, err);
    });

    // 11b. 创建钉钉壳实例（必须先于待办，因为 createApprovalTodo 内部检查壳实例存在）
    await createProcessInstance(
      instance.instanceId,
      'ar_collection',
      formType.name,
      systemUser.id,
      instance.title,
      formType.formSchema,
      instance.formData
    ).catch(err => {
      log.error(`创建壳实例失败 [instanceId=${instance.instanceId}]:`, err);
    });

    // 11c. 为营销师创建钉钉待办
    if (instance.marketerUserId) {
      await notifyPendingApproval(
        {
          instanceId: instance.instanceId,
          instanceNo: instance.instanceNo,
          title: instance.title,
          formTypeName: formType.name,
          applicantName: systemUser.name,
          nodeName: '营销师催收',
          nodeOrder: 1,
          formSchema: formType.formSchema,
          formData: instance.formData,
        },
        [instance.marketerUserId]
      ).catch(err => {
        log.error(`创建钉钉待办失败 [instanceId=${instance.instanceId}]:`, err);
      });
    }

    // 限流：避免批量场景触发钉钉 API 限流（参照 fix-ar-collection-dingtalk.ts）
    if (allCreatedInstances.length > 1) {
      await new Promise(resolve => setTimeout(resolve, 200));
    }
  }

  log.info(`催收OA实例生成完成: 创建 ${allCreatedInstances.length} 个实例`);
}

// =====================================================
// 批量创建辅助函数
// =====================================================

/** 成功创建的实例信息，用于事务后调用钉钉集成 */
interface CreatedInstance {
  instanceId: number;
  instanceNo: string;
  title: string;
  formData: Record<string, unknown>;
  marketerUserId: number | null;
}

/**
 * 批量创建OA实例（使用单个事务处理多个实例，提升性能）
 * @param batch 批次的 [key, debts] 数组
 * @param formType 表单类型定义
 * @param systemUser 系统用户（鑫小财）
 * @param existingInstances 已有实例的 key 集合
 * @returns 成功创建的实例详情数组
 */
async function createBatchOaInstances(
  batch: [string, EnrichedDebtRecord[]][],
  formType: ReturnType<typeof getFormTypeByCode>,
  systemUser: { id: number; name: string; dept: string | null },
  existingInstances: Set<string>
): Promise<CreatedInstance[]> {
  if (!formType) return [];

  const client = await getAppClient();
  const createdInstances: CreatedInstance[] = [];

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
        const title = `逾期催收 - ${consumerName}`;
        const instanceNo = await generateInstanceNo();

        // 插入实例（含 current_node_order）
        const instanceResult = await client.query(
          `INSERT INTO oa_approval_instances
            (instance_no, form_type_id, title, status, applicant_id, applicant_name, applicant_dept, form_data, current_node_order)
           VALUES ($1, (SELECT id FROM oa_form_types WHERE code = $2), $3, 'pending', $4, $5, $6, $7, 1)
           RETURNING id`,
          [instanceNo, 'ar_collection', title, systemUser.id, systemUser.name, systemUser.dept, JSON.stringify(formData)]
        );
        const instanceId = instanceResult.rows[0].id;

        // 解析营销师（精确匹配 + fallback，使用事务连接保持一致性）
        const marketer = await resolveMarketer(formData.managerName as string | null, client);
        if (!marketer) {
          log.warn(`未找到营销师用户且无 fallback: ${formData.managerName}，节点将不分配审批人 [${consumerName}]`);
        }

        // 节点 1：营销师催收（role 类型）
        await client.query(
          `INSERT INTO oa_approval_nodes
            (instance_id, node_order, node_name, node_type, role_code, assigned_user_id, assigned_user_name, comment, status)
           VALUES ($1, 1, '营销师催收', 'role', 'marketer', $2, $3, $4, 'pending')`,
          [instanceId, marketer?.userId ?? null, marketer?.userName ?? null, marketer?.fallback ? (marketer.fallbackReason ?? null) : null]
        );

        // 节点 2：更新催收状态（auto 类型）
        await client.query(
          `INSERT INTO oa_approval_nodes
            (instance_id, node_order, node_name, node_type, role_code, assigned_user_id, assigned_user_name, status)
           VALUES ($1, 2, '更新催收状态', 'auto', NULL, NULL, '系统', 'pending')`,
          [instanceId]
        );

        // 插入操作记录（submit 不关联具体审批节点，node_order 为 NULL）
        await client.query(
          `INSERT INTO oa_approval_actions
            (instance_id, action_type, operator_id, operator_name, comment)
           VALUES ($1, 'submit', $2, $3, '系统自动创建催收实例')`,
          [instanceId, systemUser.id, systemUser.name]
        );

        createdInstances.push({
          instanceId,
          instanceNo,
          title,
          formData,
          marketerUserId: marketer?.userId ?? null,
        });
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

  return createdInstances;
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

async function getSystemApplicant(): Promise<{ id: number; name: string; dept: string | null } | null> {
  // 使用专用财务流程用户「鑫小财(AI员工)」作为发起人，模糊匹配（数据库名称含括号后缀）
  const result = await query<{ id: number; name: string; department_name: string | null }>(
    `SELECT u.id, u.name, d.name as department_name
     FROM users u
     LEFT JOIN dingtalk_departments d ON u.department_id = d.dingtalk_dept_id
     WHERE u.status = 1 AND u.name LIKE '%鑫小财%'
     LIMIT 1`
  );
  if (result.rows.length === 0) return null;
  return { id: result.rows[0].id, name: result.rows[0].name, dept: result.rows[0].department_name };
}

// =====================================================
// 营销师解析（含 fallback 规则）
// =====================================================

interface MarketerResult {
  userId: number;
  userName: string;
  fallback: boolean;       // 是否为 fallback 分配
  fallbackReason?: string; // fallback 原因，记录到节点 comment
}

/**
 * 解析营销师：先按姓名精确匹配系统用户，失败则 fallback 到 marketing_manager 角色用户
 * @param managerName ERP 欠款记录中的营销师姓名
 */
async function resolveMarketer(managerName: string | null, client: PoolClient): Promise<MarketerResult | null> {
  // 1. 精确匹配营销师姓名（使用事务连接，与批量创建保持一致）
  if (managerName) {
    const result = await client.query<{ id: number; name: string }>(
      `SELECT id, name FROM users WHERE name = $1 AND status = 1 LIMIT 1`,
      [managerName]
    );
    if (result.rows[0]) {
      return { userId: result.rows[0].id, userName: result.rows[0].name, fallback: false };
    }
  }

  // 2. fallback: 分配给营销经理角色用户
  const fallbackResult = await client.query<{ id: number; name: string }>(
    `SELECT u.id, u.name FROM user_roles ur
     JOIN roles r ON r.id = ur.role_id
     JOIN users u ON u.id = ur.user_id
     WHERE r.code = 'marketing_manager' AND r.status = 1 AND u.status = 1
     LIMIT 1`
  );
  if (fallbackResult.rows[0]) {
    return {
      userId: fallbackResult.rows[0].id,
      userName: fallbackResult.rows[0].name,
      fallback: true,
      fallbackReason: managerName
        ? `原营销师「${managerName}」未匹配到系统用户，已转交营销经理处理`
        : '欠款记录无营销师信息，已转交营销经理处理',
    };
  }

  return null;
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
    billNo: d.billId,                           // 内部编号，不展示但保留用于核销校验
    orderNo: d.bizOrderStr || '',                // 订单编号（用户可读）
    billType: d.billTypeName || '销售单',
    totalAmount: d.totalAmount,
    leftAmount: d.leftAmount,
    overdueDays: d.overdueDays || 0,
    workTime: d.workTime,                        // 业务日期
    writeOffAmount: d.writeOffAmount || 0,        // 已结金额
    billNote: d.billNote || '',                  // 单据备注
  }));

  return {
    consumerName,
    totalAmount: Math.round(totalAmount * 100) / 100,
    billCount: debts.length,
    maxOverdueDays,
    managerName,
    maxDebtDays: debts[0].customerMaxDebtDays ?? null,
    maxDebtOrderNum: debts[0].customerMaxDebtOrderNum ?? null,
    billDetails,
    _extensionCount: 0,
  };
}
