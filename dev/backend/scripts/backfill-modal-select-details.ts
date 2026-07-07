/**
 * 一次性回填脚本：为缺少 _details 的历史 modal_select 实例补全展示数据
 *
 * 背景：新架构要求 modal_select 控件自动将选中记录持久化到 formData._details[field.key]，
 * 详情页从 _details 读取完整记录（单号+金额）渲染小表格。
 * 但部分历史实例提交时旧架构的 ERP 快照失败或尚未实现，导致缺少展示数据。
 *
 * 本脚本从 ERP 实时拉取完整记录，按 ID 匹配后回填 _details：
 * - customer_credit.holdSettlementOrders → searchErpSettlementOrders(customer)
 * - purchase_payment.debtIds → searchSupplierDebts(supplierId)
 * - logistics_fee.settlementIds → searchPurchaseSettlements(supplierId)
 * - customer_reconciliation.receivableOrderIds/unreconciledOrderIds/differenceOrderIds → fetchReceivableOrders(customerId)
 *
 * 运行（默认 dry-run）:  cd dev/backend && npx ts-node scripts/backfill-modal-select-details.ts
 * 执行实际写入:          cd dev/backend && DRY_RUN=false npx ts-node scripts/backfill-modal-select-details.ts
 */

import { appQuery, closeAppPool } from '../src/db/appPool';
import { searchErpSettlementOrders } from '../src/services/erp-client/erp-settlement.service';
import { searchSupplierDebts } from '../src/services/erp-client/erp-supplier-debt.service';
import { searchPurchaseSettlements } from '../src/services/erp-client/erp-purchase-settlement.service';
import { fetchReceivableOrders } from '../src/services/erp-client/erp-reconciliation.service';

// =====================================================
// 配置
// =====================================================

const DRY_RUN = process.env.DRY_RUN !== 'false';
const DELAY_MS = 200; // ERP 调用间隔，避免限流

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
  success: number;
  partial: number;
  skipped: number;
  failed: number;
}

function newStats(): Stats {
  return { total: 0, success: 0, partial: 0, skipped: 0, failed: 0 };
}

function printStats(label: string, stats: Stats) {
  log(`[${label}] 总计: ${stats.total}, 成功: ${stats.success}, 部分成功: ${stats.partial}, 跳过: ${stats.skipped}, 失败: ${stats.failed}`);
}

// =====================================================
// customer_credit: holdSettlementOrders
// =====================================================

async function backfillCustomerCredit(stats: Stats) {
  log('=== customer_credit: holdSettlementOrders ===');

  const result = await appQuery<{ id: number; instance_no: string; form_data: Record<string, unknown> }>(
    `SELECT i.id, i.instance_no, i.form_data
     FROM oa_approval_instances i
     JOIN oa_form_types ft ON i.form_type_id = ft.id
     WHERE ft.code = 'customer_credit'
       AND i.form_data ? 'holdSettlementOrders'
       AND jsonb_array_length(COALESCE(i.form_data->'holdSettlementOrders', '[]'::jsonb)) > 0
       AND NOT (i.form_data ? '_details')`
  );

  stats.total = result.rows.length;
  log(`找到 ${stats.total} 个需要回填的 customer_credit 实例`);

  // 缓存：同一客户的 ERP 数据只拉一次
  const erpCache = new Map<string, Record<string, unknown>[]>();

  for (const row of result.rows) {
    const { id, instance_no, form_data } = row;
    const customerId = form_data.customer as string | number;
    const holdIds = (form_data.holdSettlementOrders as number[]) || [];

    if (!customerId) {
      log(`  [跳过] ${instance_no}: 缺少 customer`);
      stats.skipped++;
      continue;
    }

    try {
      // 从缓存或 ERP 获取
      const cacheKey = String(customerId);
      let allOrders = erpCache.get(cacheKey);
      if (!allOrders) {
        allOrders = (await searchErpSettlementOrders({ traderId: customerId, maxRecords: 500 })) as unknown as Record<string, unknown>[];
        erpCache.set(cacheKey, allOrders);
        await sleep(DELAY_MS);
      }

      // 按 bizId 匹配选中的结算单
      const selectedSet = new Set(holdIds.map(String));
      const matched = allOrders.filter(o => selectedSet.has(String(o.bizId)));

      if (matched.length === 0) {
        log(`  [跳过] ${instance_no}: ERP 中未找到匹配的结算单 (选中 ${holdIds.length} 个 ID)`);
        stats.skipped++;
        continue;
      }

      const details = { holdSettlementOrders: matched };

      if (!DRY_RUN) {
        await appQuery(
          `UPDATE oa_approval_instances
           SET form_data = jsonb_set(form_data, '{_details}', $1::jsonb)
           WHERE id = $2`,
          [JSON.stringify(details), id]
        );
      }

      if (matched.length < holdIds.length) {
        log(`  [部分] ${instance_no}: 匹配 ${matched.length}/${holdIds.length}`);
        stats.partial++;
      } else {
        log(`  [成功] ${instance_no}: 回填 ${matched.length} 条结算单记录`);
        stats.success++;
      }
    } catch (err) {
      log(`  [失败] ${instance_no}: ${err instanceof Error ? err.message : err}`);
      stats.failed++;
    }
  }

  printStats('customer_credit', stats);
}

// =====================================================
// purchase_payment: debtIds
// =====================================================

async function backfillPurchasePayment(stats: Stats) {
  log('=== purchase_payment: debtIds ===');

  const result = await appQuery<{ id: number; instance_no: string; form_data: Record<string, unknown> }>(
    `SELECT i.id, i.instance_no, i.form_data
     FROM oa_approval_instances i
     JOIN oa_form_types ft ON i.form_type_id = ft.id
     WHERE ft.code = 'purchase_payment'
       AND i.form_data->>'paymentType' = 'postpay'
       AND i.form_data ? 'debtIds'
       AND jsonb_array_length(COALESCE(i.form_data->'debtIds', '[]'::jsonb)) > 0
       AND NOT (i.form_data ? '_details')`
  );

  stats.total = result.rows.length;
  log(`找到 ${stats.total} 个需要回填的 purchase_payment 实例`);

  // 缓存：同一供应商的 ERP 数据只拉一次
  const erpCache = new Map<string, Record<string, unknown>[]>();

  for (const row of result.rows) {
    const { id, instance_no, form_data } = row;
    const supplierId = form_data.supplierId as string;
    const debtIds = (form_data.debtIds as (string | number)[]) || [];

    if (!supplierId) {
      log(`  [跳过] ${instance_no}: 缺少 supplierId`);
      stats.skipped++;
      continue;
    }

    try {
      const cacheKey = supplierId;
      let allDebts = erpCache.get(cacheKey);
      if (!allDebts) {
        allDebts = (await searchSupplierDebts(parseInt(supplierId, 10))) as unknown as Record<string, unknown>[];
        erpCache.set(cacheKey, allDebts);
        await sleep(DELAY_MS);
      }

      // 按 bizId 匹配选中的欠款
      const selectedSet = new Set(debtIds.map(String));
      const matched = allDebts.filter(d => selectedSet.has(String(d.bizId)));

      if (matched.length === 0) {
        log(`  [跳过] ${instance_no}: ERP 中未找到匹配的欠款 (选中 ${debtIds.length} 个 ID)`);
        stats.skipped++;
        continue;
      }

      const details = { debtIds: matched };

      if (!DRY_RUN) {
        await appQuery(
          `UPDATE oa_approval_instances
           SET form_data = jsonb_set(form_data, '{_details}', $1::jsonb)
           WHERE id = $2`,
          [JSON.stringify(details), id]
        );
      }

      if (matched.length < debtIds.length) {
        log(`  [部分] ${instance_no}: 匹配 ${matched.length}/${debtIds.length}`);
        stats.partial++;
      } else {
        log(`  [成功] ${instance_no}: 回填 ${matched.length} 条欠款记录`);
        stats.success++;
      }
    } catch (err) {
      log(`  [失败] ${instance_no}: ${err instanceof Error ? err.message : err}`);
      stats.failed++;
    }
  }

  printStats('purchase_payment', stats);
}

// =====================================================
// logistics_fee: settlementIds
// =====================================================

async function backfillLogisticsFee(stats: Stats) {
  log('=== logistics_fee: settlementIds ===');

  const result = await appQuery<{ id: number; instance_no: string; form_data: Record<string, unknown> }>(
    `SELECT i.id, i.instance_no, i.form_data
     FROM oa_approval_instances i
     JOIN oa_form_types ft ON i.form_type_id = ft.id
     WHERE ft.code = 'logistics_fee'
       AND i.form_data ? 'settlementIds'
       AND jsonb_array_length(COALESCE(i.form_data->'settlementIds', '[]'::jsonb)) > 0
       AND NOT (i.form_data ? '_details')`
  );

  stats.total = result.rows.length;
  log(`找到 ${stats.total} 个需要回填的 logistics_fee 实例`);

  for (const row of result.rows) {
    const { id, instance_no, form_data } = row;
    const settlementIds = (form_data.settlementIds as string[]) || [];

    if (settlementIds.length === 0) {
      stats.skipped++;
      continue;
    }

    try {
      // 采购结算单需要分页拉取全量（按供应商筛选可减少数据量）
      const supplierName = form_data.feeSupplierName as string | undefined;
      // 注意：logistics_fee 没有直接的 supplierId 字段，需全量拉取
      const allRecords: Record<string, unknown>[] = [];
      let current = 1;
      const pageSize = 100;
      let hasMore = true;

      while (hasMore) {
        const pageResult = await searchPurchaseSettlements({
          current,
          size: pageSize,
          billState: undefined as unknown as string, // 不限状态
        });
        allRecords.push(...(pageResult.records as unknown as Record<string, unknown>[]));
        hasMore = pageResult.records.length >= pageSize;
        current++;
        if (current > 50) break; // 安全上限，防止无限循环
        await sleep(DELAY_MS);
      }

      log(`  ${instance_no}: 拉取到 ${allRecords.length} 条采购结算单`);

      // 按 billStr 匹配（logistics_fee 的 valueKey 是 billStr）
      const selectedSet = new Set(settlementIds.map(String));
      const matched = allRecords.filter(r => selectedSet.has(String(r.billStr)));

      if (matched.length === 0) {
        log(`  [跳过] ${instance_no}: ERP 中未找到匹配的结算单 (选中 ${settlementIds.length} 个 billStr)`);
        stats.skipped++;
        continue;
      }

      const details = { settlementIds: matched };

      if (!DRY_RUN) {
        await appQuery(
          `UPDATE oa_approval_instances
           SET form_data = jsonb_set(form_data, '{_details}', $1::jsonb)
           WHERE id = $2`,
          [JSON.stringify(details), id]
        );
      }

      if (matched.length < settlementIds.length) {
        log(`  [部分] ${instance_no}: 匹配 ${matched.length}/${settlementIds.length}`);
        stats.partial++;
      } else {
        log(`  [成功] ${instance_no}: 回填 ${matched.length} 条结算单记录`);
        stats.success++;
      }
    } catch (err) {
      log(`  [失败] ${instance_no}: ${err instanceof Error ? err.message : err}`);
      stats.failed++;
    }
  }

  printStats('logistics_fee', stats);
}

// =====================================================
// customer_reconciliation: receivableOrderIds / unreconciledOrderIds / differenceOrderIds
// =====================================================

async function backfillCustomerReconciliation(stats: Stats) {
  log('=== customer_reconciliation: receivableOrderIds / unreconciledOrderIds / differenceOrderIds ===');

  const result = await appQuery<{ id: number; instance_no: string; form_data: Record<string, unknown> }>(
    `SELECT i.id, i.instance_no, i.form_data
     FROM oa_approval_instances i
     JOIN oa_form_types ft ON i.form_type_id = ft.id
     WHERE ft.code = 'customer_reconciliation'
       AND (
         (i.form_data ? 'receivableOrderIds'
          AND jsonb_array_length(COALESCE(i.form_data->'receivableOrderIds', '[]'::jsonb)) > 0)
         OR (i.form_data ? 'unreconciledOrderIds'
          AND jsonb_array_length(COALESCE(i.form_data->'unreconciledOrderIds', '[]'::jsonb)) > 0)
         OR (i.form_data ? 'differenceOrderIds'
          AND jsonb_array_length(COALESCE(i.form_data->'differenceOrderIds', '[]'::jsonb)) > 0)
       )
       AND (
         NOT (i.form_data ? '_details')
         OR NOT (i.form_data->'_details' ? 'receivableOrderIds')
         OR (i.form_data ? 'unreconciledOrderIds'
             AND NOT (i.form_data->'_details' ? 'unreconciledOrderIds'))
         OR (i.form_data ? 'differenceOrderIds'
             AND NOT (i.form_data->'_details' ? 'differenceOrderIds'))
       )`
  );

  stats.total = result.rows.length;
  log(`找到 ${stats.total} 个需要回填的 customer_reconciliation 实例`);

  // 缓存：同一客户的 ERP 数据只拉一次
  const erpCache = new Map<string, Record<string, unknown>[]>();

  for (const row of result.rows) {
    const { id, instance_no, form_data } = row;
    const customerId = form_data.customerId as string | number;
    const receivableOrderIds = (form_data.receivableOrderIds as (string | number)[]) || [];
    const unreconciledOrderIds = (form_data.unreconciledOrderIds as (string | number)[]) || [];
    const differenceOrderIds = (form_data.differenceOrderIds as (string | number)[]) || [];

    if (!customerId) {
      log(`  [跳过] ${instance_no}: 缺少 customerId`);
      stats.skipped++;
      continue;
    }

    try {
      // 从缓存或 ERP 获取（拉取全量应收单据供 3 个字段共用匹配）
      const cacheKey = String(customerId);
      let allOrders = erpCache.get(cacheKey);
      if (!allOrders) {
        allOrders = (await fetchReceivableOrders({ traderId: customerId })) as unknown as Record<string, unknown>[];
        erpCache.set(cacheKey, allOrders);
        await sleep(DELAY_MS);
      }

      // 只回填 _details 中缺失的字段，保留已有的 key（如 unreconciledOrderIds）
      const existingDetails = (form_data._details as Record<string, unknown>) || {};
      const mergedDetails = { ...existingDetails };
      let addedKeys: string[] = [];

      // 匹配 receivableOrderIds（仅当 _details 中缺失时）
      if (receivableOrderIds.length > 0 && !existingDetails.receivableOrderIds) {
        const selectedSet = new Set(receivableOrderIds.map(String));
        const matched = allOrders.filter(o => selectedSet.has(String(o.id)));
        mergedDetails.receivableOrderIds = matched;
        addedKeys.push(`receivableOrderIds(${matched.length})`);
      }

      // 匹配 unreconciledOrderIds（仅当 _details 中缺失时）
      if (unreconciledOrderIds.length > 0 && !existingDetails.unreconciledOrderIds) {
        const selectedSet = new Set(unreconciledOrderIds.map(String));
        const matched = allOrders.filter(o => selectedSet.has(String(o.id)));
        mergedDetails.unreconciledOrderIds = matched;
        addedKeys.push(`unreconciledOrderIds(${matched.length})`);
      }

      // 匹配 differenceOrderIds（仅当 _details 中缺失时）
      if (differenceOrderIds.length > 0 && !existingDetails.differenceOrderIds) {
        const selectedSet = new Set(differenceOrderIds.map(String));
        const matched = allOrders.filter(o => selectedSet.has(String(o.id)));
        mergedDetails.differenceOrderIds = matched;
        addedKeys.push(`differenceOrderIds(${matched.length})`);
      }

      if (addedKeys.length === 0) {
        log(`  [跳过] ${instance_no}: _details 中已有所有字段的记录`);
        stats.skipped++;
        continue;
      }

      if (!DRY_RUN) {
        await appQuery(
          `UPDATE oa_approval_instances
           SET form_data = jsonb_set(form_data, '{_details}', $1::jsonb)
           WHERE id = $2`,
          [JSON.stringify(mergedDetails), id]
        );
      }

      log(`  [成功] ${instance_no}: 补充 ${addedKeys.join(', ')}`);
      stats.success++;
    } catch (err) {
      log(`  [失败] ${instance_no}: ${err instanceof Error ? err.message : err}`);
      stats.failed++;
    }
  }

  printStats('customer_reconciliation', stats);
}

// =====================================================
// 主函数
// =====================================================

async function main() {
  log(`=== 回填 _details 脚本启动 (${DRY_RUN ? 'DRY-RUN 模式' : '写入模式'}) ===`);

  const ccStats = newStats();
  const ppStats = newStats();
  const lfStats = newStats();
  const crStats = newStats();

  await backfillCustomerCredit(ccStats);
  await backfillPurchasePayment(ppStats);
  await backfillLogisticsFee(lfStats);
  await backfillCustomerReconciliation(crStats);

  log('');
  log('=== 汇总 ===');
  const total = ccStats.total + ppStats.total + lfStats.total + crStats.total;
  const success = ccStats.success + ppStats.success + lfStats.success + crStats.success;
  const partial = ccStats.partial + ppStats.partial + lfStats.partial + crStats.partial;
  const skipped = ccStats.skipped + ppStats.skipped + lfStats.skipped + crStats.skipped;
  const failed = ccStats.failed + ppStats.failed + lfStats.failed + crStats.failed;
  log(`总计: ${total}, 成功: ${success}, 部分成功: ${partial}, 跳过: ${skipped}, 失败: ${failed}`);

  if (DRY_RUN) {
    log('');
    log('当前为 DRY-RUN 模式，未执行任何写入。');
    log('确认结果后，运行: DRY_RUN=false npx ts-node scripts/backfill-modal-select-details.ts');
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
