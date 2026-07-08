/**
 * SSOT 迁移脚本 v2：将 searchApi/table_select 表格字段的主字段从 ID 数组迁移为完整记录数组
 *
 * 背景：SSOT 重构要求主字段作为唯一数据源，彻底废弃 _details 双副本机制。
 *
 * 数据源优先级（治本，防数据丢失）：
 * 1. _details[fieldKey] 完整记录 —— 当时前端选择保存的真实数据（含用户编辑的金额），最权威
 * 2. 本地全量表 —— erp_debts（按 bill_id）/ erp_customers（按 id），可覆盖历史归档
 * 3. ERP API —— 最后兜底（受单据状态过滤限制，历史已核销单据可能查不到）
 *
 * 数据保护原则（绝不丢数据）：
 * - 仅当某字段的【所有】主字段 ID 都还原为完整记录时，才写入该字段并删除对应 _details 子键
 * - 任一 ID 无法还原 → 该字段保持原样（保留 ID 数组 + 保留 _details），整个实例记入「待人工」列表
 * - _details 仅删除已完整迁移的子键；当 _details 变空时才整体删除
 * - 幂等：主字段已是对象数组则跳过
 *
 * 覆盖字段（13 个）：
 * - customer_credit: holdSettlementOrders(bizId)
 * - customer_reconciliation: receivableOrderIds/unreconciledOrderIds/differenceOrderIds(id)
 * - purchase_payment: debtIds(bizId)、prepaymentIds(id)
 * - logistics_fee: settlementIds(billStr)
 * - promotion_*_offline: clientIdList(id)、clientAreaIds(id, tree_select)
 *
 * 运行（默认 dry-run）:  cd dev/backend && npx tsx scripts/ssot-migrate-table-fields.ts
 * 执行实际写入:          cd dev/backend && DRY_RUN=false npx tsx scripts/ssot-migrate-table-fields.ts
 */

import { appQuery, closeAppPool } from '../src/db/appPool';
import { searchErpSettlementOrders } from '../src/services/erp-client/erp-settlement.service';
import { searchSupplierDebts } from '../src/services/erp-client/erp-supplier-debt.service';
import { listTraderPrepayments } from '../src/services/erp-client/erp-prepayment.service';
import { searchPurchaseSettlements } from '../src/services/erp-client/erp-purchase-settlement.service';
import { fetchReceivableOrders } from '../src/services/erp-client/erp-reconciliation.service';
import { searchErpCustomers } from '../src/services/erp-client/erp-customer.service';

// =====================================================
// 配置
// =====================================================

const DRY_RUN = process.env.DRY_RUN !== 'false';
const DELAY_MS = 200;

// =====================================================
// 工具函数
// =====================================================

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

function log(msg: string) {
  const ts = new Date().toISOString().slice(11, 19);
  console.log(`[${ts}] ${msg}`);
}

interface Stats {
  total: number;
  migrated: number;   // 完整迁移（已写入/将写入）
  already: number;    // 已是对象数组，幂等跳过
  pending: number;    // 数据不完整，保护性跳过（待人工）
}

function newStats(): Stats {
  return { total: 0, migrated: 0, already: 0, pending: 0 };
}

function printStats(label: string, stats: Stats) {
  log(`[${label}] 总计: ${stats.total}, 完整迁移: ${stats.migrated}, 已迁移跳过: ${stats.already}, 待人工: ${stats.pending}`);
}

/** 待人工处理清单（数据无法完整还原的实例） */
interface PendingItem {
  formType: string;
  instanceNo: string;
  field: string;
  resolved: number;
  total: number;
  missingSample: string;
}
const pendingList: PendingItem[] = [];

/** 判断数组是否为 ID 数组（首元素非对象） */
function isIdArray(val: unknown): val is (string | number)[] {
  if (!Array.isArray(val) || val.length === 0) return false;
  return typeof val[0] !== 'object' || val[0] === null;
}

/** 判断数组是否已是对象数组 */
function isObjectArray(val: unknown): val is Record<string, unknown>[] {
  if (!Array.isArray(val) || val.length === 0) return false;
  return typeof val[0] === 'object' && val[0] !== null;
}

/** 从 _details[fieldKey] 构建 ID→完整记录 的映射（idField 为记录中与主字段 ID 对齐的字段） */
function buildDetailMap(
  formData: Record<string, unknown>,
  fieldKey: string,
  idField: string
): Map<string, Record<string, unknown>> {
  const map = new Map<string, Record<string, unknown>>();
  const details = (formData._details as Record<string, unknown> | undefined)?.[fieldKey];
  if (isObjectArray(details)) {
    for (const d of details) {
      const key = String(d[idField] ?? d.id ?? d.bizId ?? '');
      if (key) map.set(key, d);
    }
  }
  return map;
}

type EnrichFn = (missingIds: string[]) => Promise<Map<string, Record<string, unknown>>>;

interface FieldResult {
  status: 'migrated' | 'already' | 'empty' | 'incomplete';
  records?: Record<string, unknown>[];
  missing?: string[];
  total?: number;
}

/**
 * 迁移单个字段：_details 优先 + enrich 兜底 + 数据保护
 * 不修改 formData，仅返回结果（由调用方决定是否写入）
 */
async function resolveField(
  formData: Record<string, unknown>,
  fieldKey: string,
  idField: string,
  enrich?: EnrichFn
): Promise<FieldResult> {
  const mainVal = formData[fieldKey];
  if (isObjectArray(mainVal)) return { status: 'already' };
  if (!isIdArray(mainVal)) return { status: 'empty' };

  const ids = (mainVal as unknown[]).map(String);
  const detailMap = buildDetailMap(formData, fieldKey, idField);
  const missingForEnrich = ids.filter(id => !detailMap.has(id));

  let enrichMap = new Map<string, Record<string, unknown>>();
  if (missingForEnrich.length > 0 && enrich) {
    try {
      enrichMap = await enrich(missingForEnrich);
    } catch (err) {
      log(`    [enrich失败] ${fieldKey}: ${err instanceof Error ? err.message : err}`);
    }
  }

  const records: Record<string, unknown>[] = [];
  const missing: string[] = [];
  for (const id of ids) {
    const rec = detailMap.get(id) || enrichMap.get(id);
    if (rec) records.push(rec);
    else missing.push(id);
  }

  if (missing.length === 0) return { status: 'migrated', records };
  return { status: 'incomplete', records, missing, total: ids.length };
}

/** 从本地 erp_debts 表按 bill_id 富化（raw_data 为完整 ERP 记录），覆盖历史归档单据 */
async function enrichFromErpDebts(billIds: string[]): Promise<Map<string, Record<string, unknown>>> {
  const map = new Map<string, Record<string, unknown>>();
  if (billIds.length === 0) return map;
  const result = await appQuery<{ bill_id: string; raw_data: Record<string, unknown> | null }>(
    `SELECT bill_id, raw_data FROM erp_debts WHERE bill_id = ANY($1::text[])`,
    [billIds]
  );
  for (const row of result.rows) {
    if (row.raw_data && typeof row.raw_data === 'object') {
      map.set(String(row.bill_id), row.raw_data);
    }
  }
  return map;
}

/**
 * 通用实例处理：对实例的每个目标字段执行 resolveField，
 * 全部字段可完整迁移时写入主字段 + 清理已迁移的 _details 子键；
 * 任一字段 incomplete 则整实例保护跳过并记入待人工。
 */
async function processInstance(
  formType: string,
  id: number,
  instanceNo: string,
  formData: Record<string, unknown>,
  fields: { key: string; idField: string; enrich?: EnrichFn }[],
  stats: Stats
): Promise<void> {
  const migratedFields: string[] = [];
  let anyIdArray = false;
  let hasIncomplete = false;

  for (const f of fields) {
    const res = await resolveField(formData, f.key, f.idField, f.enrich);
    if (res.status === 'incomplete') {
      hasIncomplete = true;
      pendingList.push({
        formType,
        instanceNo,
        field: f.key,
        resolved: res.records?.length ?? 0,
        total: res.total ?? 0,
        missingSample: (res.missing ?? []).slice(0, 5).join(','),
      });
      log(`  [待人工] ${instanceNo} ${f.key}: 还原 ${res.records?.length}/${res.total}，缺失 ${(res.missing ?? []).slice(0, 5).join(',')}`);
    } else if (res.status === 'migrated') {
      anyIdArray = true;
      formData[f.key] = res.records; // 暂存到内存对象，稍后统一写库
      migratedFields.push(f.key);
    }
  }

  if (hasIncomplete) {
    // 数据保护：整实例不写入，保留原 form_data（含 _details）
    stats.pending++;
    return;
  }

  if (!anyIdArray) {
    // 无 ID 数组字段（全部 already/empty）
    stats.already++;
    return;
  }

  // 清理已迁移字段的 _details 子键
  const details = formData._details as Record<string, unknown> | undefined;
  if (details && typeof details === 'object') {
    for (const key of migratedFields) delete details[key];
    if (Object.keys(details).length === 0) delete formData._details;
  }

  if (!DRY_RUN) {
    await appQuery(`UPDATE oa_approval_instances SET form_data = $1 WHERE id = $2`, [
      JSON.stringify(formData),
      id,
    ]);
  }
  log(`  [迁移] ${instanceNo}: ${migratedFields.join(',')}`);
  stats.migrated++;
}

// =====================================================
// customer_credit: holdSettlementOrders(bizId)
// =====================================================

async function migrateCustomerCredit(stats: Stats) {
  log('=== customer_credit: holdSettlementOrders ===');
  const result = await appQuery<{ id: number; instance_no: string; form_data: Record<string, unknown> }>(
    `SELECT i.id, i.instance_no, i.form_data
     FROM oa_approval_instances i
     JOIN oa_form_types ft ON i.form_type_id = ft.id
     WHERE ft.code = 'customer_credit'
       AND jsonb_array_length(COALESCE(i.form_data->'holdSettlementOrders', '[]'::jsonb)) > 0`
  );
  stats.total = result.rows.length;
  log(`找到 ${stats.total} 个 customer_credit 实例`);

  const erpCache = new Map<string, Record<string, unknown>[]>();
  for (const row of result.rows) {
    const { id, instance_no, form_data } = row;
    const customerId = form_data.customer as string | number | undefined;

    const enrich: EnrichFn = async (missing) => {
      const map = new Map<string, Record<string, unknown>>();
      if (!customerId) return map;
      const cacheKey = String(customerId);
      let all = erpCache.get(cacheKey);
      if (!all) {
        all = (await searchErpSettlementOrders({ traderId: customerId, maxRecords: 500 })) as unknown as Record<string, unknown>[];
        erpCache.set(cacheKey, all);
        await sleep(DELAY_MS);
      }
      const set = new Set(missing);
      for (const o of all) if (set.has(String(o.bizId))) map.set(String(o.bizId), o);
      return map;
    };

    await processInstance('customer_credit', id, instance_no, form_data,
      [{ key: 'holdSettlementOrders', idField: 'bizId', enrich }], stats);
  }
  printStats('customer_credit', stats);
}

// =====================================================
// customer_reconciliation: receivableOrderIds / unreconciledOrderIds / differenceOrderIds (id)
// =====================================================

async function migrateCustomerReconciliation(stats: Stats) {
  log('=== customer_reconciliation: receivable/unreconciled/difference OrderIds ===');
  const result = await appQuery<{ id: number; instance_no: string; form_data: Record<string, unknown> }>(
    `SELECT i.id, i.instance_no, i.form_data
     FROM oa_approval_instances i
     JOIN oa_form_types ft ON i.form_type_id = ft.id
     WHERE ft.code = 'customer_reconciliation'
       AND (
         jsonb_array_length(COALESCE(i.form_data->'receivableOrderIds', '[]'::jsonb)) > 0
         OR jsonb_array_length(COALESCE(i.form_data->'unreconciledOrderIds', '[]'::jsonb)) > 0
         OR jsonb_array_length(COALESCE(i.form_data->'differenceOrderIds', '[]'::jsonb)) > 0
       )`
  );
  stats.total = result.rows.length;
  log(`找到 ${stats.total} 个 customer_reconciliation 实例`);

  const erpCache = new Map<string, Record<string, unknown>[]>();
  for (const row of result.rows) {
    const { id, instance_no, form_data } = row;
    const customerId = form_data.customerId as string | number | undefined;

    // enrich：先本地 erp_debts（按 id=bill_id，覆盖历史归档），再 ERP fetchReceivableOrders 兜底
    const enrich: EnrichFn = async (missing) => {
      const map = await enrichFromErpDebts(missing);
      const stillMissing = missing.filter(m => !map.has(m));
      if (stillMissing.length > 0 && customerId) {
        const cacheKey = String(customerId);
        let all = erpCache.get(cacheKey);
        if (!all) {
          all = (await fetchReceivableOrders({ traderId: customerId })) as unknown as Record<string, unknown>[];
          erpCache.set(cacheKey, all);
          await sleep(DELAY_MS);
        }
        const set = new Set(stillMissing);
        for (const o of all) if (set.has(String(o.id))) map.set(String(o.id), o);
      }
      return map;
    };

    await processInstance('customer_reconciliation', id, instance_no, form_data, [
      { key: 'receivableOrderIds', idField: 'id', enrich },
      { key: 'unreconciledOrderIds', idField: 'id', enrich },
      { key: 'differenceOrderIds', idField: 'id', enrich },
    ], stats);
  }
  printStats('customer_reconciliation', stats);
}

// =====================================================
// purchase_payment: debtIds(bizId) / prepaymentIds(id)
// =====================================================

async function migratePurchasePayment(stats: Stats) {
  log('=== purchase_payment: debtIds / prepaymentIds ===');
  const result = await appQuery<{ id: number; instance_no: string; form_data: Record<string, unknown> }>(
    `SELECT i.id, i.instance_no, i.form_data
     FROM oa_approval_instances i
     JOIN oa_form_types ft ON i.form_type_id = ft.id
     WHERE ft.code = 'purchase_payment'
       AND (
         jsonb_array_length(COALESCE(i.form_data->'debtIds', '[]'::jsonb)) > 0
         OR jsonb_array_length(COALESCE(i.form_data->'prepaymentIds', '[]'::jsonb)) > 0
       )`
  );
  stats.total = result.rows.length;
  log(`找到 ${stats.total} 个 purchase_payment 实例`);

  const debtCache = new Map<string, Record<string, unknown>[]>();
  const prepayCache = new Map<string, Record<string, unknown>[]>();
  for (const row of result.rows) {
    const { id, instance_no, form_data } = row;
    const supplierId = form_data.supplierId as string | undefined;

    const debtEnrich: EnrichFn = async (missing) => {
      const map = new Map<string, Record<string, unknown>>();
      if (!supplierId) return map;
      let all = debtCache.get(supplierId);
      if (!all) {
        all = (await searchSupplierDebts(parseInt(supplierId, 10))) as unknown as Record<string, unknown>[];
        debtCache.set(supplierId, all);
        await sleep(DELAY_MS);
      }
      const set = new Set(missing);
      for (const d of all) if (set.has(String(d.bizId))) map.set(String(d.bizId), d);
      return map;
    };

    const prepayEnrich: EnrichFn = async (missing) => {
      const map = new Map<string, Record<string, unknown>>();
      if (!supplierId) return map;
      const cacheKey = `prepay:${supplierId}`;
      let all = prepayCache.get(cacheKey);
      if (!all) {
        all = (await listTraderPrepayments(parseInt(supplierId, 10))) as unknown as Record<string, unknown>[];
        prepayCache.set(cacheKey, all);
        await sleep(DELAY_MS);
      }
      const set = new Set(missing);
      for (const p of all) {
        const key = String(p.id ?? p.bizId);
        if (set.has(key)) map.set(key, p);
      }
      return map;
    };

    await processInstance('purchase_payment', id, instance_no, form_data, [
      { key: 'debtIds', idField: 'bizId', enrich: debtEnrich },
      { key: 'prepaymentIds', idField: 'id', enrich: prepayEnrich },
    ], stats);
  }
  printStats('purchase_payment', stats);
}

// =====================================================
// logistics_fee: settlementIds(billStr)
// =====================================================

async function migrateLogisticsFee(stats: Stats) {
  log('=== logistics_fee: settlementIds ===');
  const result = await appQuery<{ id: number; instance_no: string; form_data: Record<string, unknown> }>(
    `SELECT i.id, i.instance_no, i.form_data
     FROM oa_approval_instances i
     JOIN oa_form_types ft ON i.form_type_id = ft.id
     WHERE ft.code = 'logistics_fee'
       AND jsonb_array_length(COALESCE(i.form_data->'settlementIds', '[]'::jsonb)) > 0`
  );
  stats.total = result.rows.length;
  log(`找到 ${stats.total} 个 logistics_fee 实例`);

  let allSettlements: Record<string, unknown>[] | null = null;
  const loadSettlements = async () => {
    if (allSettlements) return allSettlements;
    const acc: Record<string, unknown>[] = [];
    let current = 1;
    const pageSize = 100;
    let hasMore = true;
    while (hasMore) {
      const page = await searchPurchaseSettlements({ current, size: pageSize, billState: undefined as unknown as string });
      acc.push(...(page.records as unknown as Record<string, unknown>[]));
      hasMore = page.records.length >= pageSize;
      current++;
      if (current > 50) break;
      await sleep(DELAY_MS);
    }
    allSettlements = acc;
    return acc;
  };

  for (const row of result.rows) {
    const { id, instance_no, form_data } = row;
    const enrich: EnrichFn = async (missing) => {
      const map = new Map<string, Record<string, unknown>>();
      const all = await loadSettlements();
      const set = new Set(missing);
      for (const r of all) if (set.has(String(r.billStr))) map.set(String(r.billStr), r);
      return map;
    };
    await processInstance('logistics_fee', id, instance_no, form_data,
      [{ key: 'settlementIds', idField: 'billStr', enrich }], stats);
  }
  printStats('logistics_fee', stats);
}

// =====================================================
// promotion_*_offline: clientIdList(id) / clientAreaIds(id)
// =====================================================

async function migratePromotions(stats: Stats) {
  log('=== promotion_*_offline: clientIdList / clientAreaIds ===');
  const formTypes = ['promotion_special_offline', 'promotion_fullgift_offline', 'promotion_combined_offline'];
  const customerCache = new Map<string, Record<string, unknown>[]>();

  for (const ftCode of formTypes) {
    const result = await appQuery<{ id: number; instance_no: string; form_data: Record<string, unknown> }>(
      `SELECT i.id, i.instance_no, i.form_data
       FROM oa_approval_instances i
       JOIN oa_form_types ft ON i.form_type_id = ft.id
       WHERE ft.code = $1
         AND (
           jsonb_array_length(COALESCE(i.form_data->'clientIdList', '[]'::jsonb)) > 0
           OR jsonb_array_length(COALESCE(i.form_data->'clientAreaIds', '[]'::jsonb)) > 0
         )`,
      [ftCode]
    );
    log(`[${ftCode}] 找到 ${result.rows.length} 个实例`);
    stats.total += result.rows.length;

    for (const row of result.rows) {
      const { id, instance_no, form_data } = row;

      const clientEnrich: EnrichFn = async (missing) => {
        const map = new Map<string, Record<string, unknown>>();
        let all = customerCache.get('all');
        if (!all) {
          all = (await searchErpCustomers(undefined, { includeAllStates: true })) as unknown as Record<string, unknown>[];
          customerCache.set('all', all);
          await sleep(DELAY_MS);
        }
        const set = new Set(missing);
        for (const c of all) if (set.has(String(c.id))) map.set(String(c.id), c);
        return map;
      };

      // clientAreaIds：生产无 erp_areas 表，_details 缺失时用 ID 兜底 name（保证结构完整、不丢 ID）
      const areaEnrich: EnrichFn = async (missing) => {
        const map = new Map<string, Record<string, unknown>>();
        for (const aid of missing) map.set(aid, { id: Number(aid), name: String(aid) });
        return map;
      };

      await processInstance(ftCode, id, instance_no, form_data, [
        { key: 'clientIdList', idField: 'id', enrich: clientEnrich },
        { key: 'clientAreaIds', idField: 'id', enrich: areaEnrich },
      ], stats);
    }
  }
  printStats('promotions', stats);
}

// =====================================================
// 主函数
// =====================================================

async function main() {
  log(`=== SSOT 迁移脚本 v2 启动 (${DRY_RUN ? 'DRY-RUN 模式' : '写入模式'}) ===`);
  if (DRY_RUN) {
    log('当前为 DRY-RUN 模式，未执行任何写入。');
    log('确认结果后运行: DRY_RUN=false npx tsx scripts/ssot-migrate-table-fields.ts');
    log('');
  }

  const cc = newStats();
  const cr = newStats();
  const pp = newStats();
  const lf = newStats();
  const pr = newStats();

  await migrateCustomerCredit(cc);
  await migrateCustomerReconciliation(cr);
  await migratePurchasePayment(pp);
  await migrateLogisticsFee(lf);
  await migratePromotions(pr);

  const sum = (k: keyof Stats) => cc[k] + cr[k] + pp[k] + lf[k] + pr[k];
  log('');
  log('=== 汇总 ===');
  log(`总计: ${sum('total')}, 完整迁移: ${sum('migrated')}, 已迁移跳过: ${sum('already')}, 待人工: ${sum('pending')}`);

  if (pendingList.length > 0) {
    log('');
    log(`=== 待人工清单 (${pendingList.length} 条字段无法完整还原，已保护未改动) ===`);
    for (const p of pendingList) {
      log(`  ${p.formType} ${p.instanceNo} ${p.field}: 还原 ${p.resolved}/${p.total} 缺失[${p.missingSample}]`);
    }
  }
}

main()
  .catch(err => {
    console.error('脚本执行失败:', err);
    process.exit(1);
  })
  .finally(() => {
    closeAppPool().then(() => process.exit(0));
  });
