/**
 * SSOT 迁移脚本：将 searchApi/table_select 表格字段的主字段从 ID 数组迁移为完整记录数组
 *
 * 背景：SSOT 重构要求主字段作为唯一数据源，废弃 _details 双副本机制。
 * 本脚本将历史 ID 数组格式迁移为完整记录对象数组，然后删除 _details 键。
 *
 * 覆盖字段（13 个）：
 * - customer_credit: holdSettlementOrders
 * - customer_reconciliation: receivableOrderIds, unreconciledOrderIds, differenceOrderIds
 * - purchase_payment: debtIds（含 paymentAmount 合并）, prepaymentIds（含 useAmount 合并）
 * - logistics_fee: settlementIds
 * - promotion_special_offline/fullgift_offline/combined_offline: clientIdList + clientAreaIds（tree_select）
 *
 * 迁移策略：
 * - 所有状态实例均处理（含 pending/processing）
 * - ERP 调用复用 backfill-modal-select-details.ts 的缓存 + 200ms 间隔模式
 * - 对 purchase_payment：用户编辑的 paymentAmount 从 _details 合并到主字段记录
 * - ERP API 失败时跳过该实例并记录到失败列表
 * - 迁移完成后删除每个实例的 _details 键
 * - 脚本支持幂等运行（检测主字段已是对象数组则跳过）
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

// =====================================================
// customer_credit: holdSettlementOrders
// =====================================================

async function migrateCustomerCredit(stats: Stats) {
  log('=== customer_credit: holdSettlementOrders ===');

  const result = await appQuery<{ id: number; instance_no: string; form_data: Record<string, unknown> }>(
    `SELECT i.id, i.instance_no, i.form_data
     FROM oa_approval_instances i
     JOIN oa_form_types ft ON i.form_type_id = ft.id
     WHERE ft.code = 'customer_credit'
       AND i.form_data ? 'holdSettlementOrders'
       AND jsonb_array_length(COALESCE(i.form_data->'holdSettlementOrders', '[]'::jsonb)) > 0`
  );

  stats.total = result.rows.length;
  log(`找到 ${stats.total} 个 customer_credit 实例`);

  const erpCache = new Map<string, Record<string, unknown>[]>();

  for (const row of result.rows) {
    const { id, instance_no, form_data } = row;
    const holdIds = form_data.holdSettlementOrders;

    // 幂等：已是对象数组则跳过
    if (isObjectArray(holdIds)) {
      stats.skipped++;
      continue;
    }

    if (!isIdArray(holdIds)) {
      stats.skipped++;
      continue;
    }

    const customerId = form_data.customer as string | number;
    if (!customerId) {
      log(`  [跳过] ${instance_no}: 缺少 customer`);
      stats.skipped++;
      continue;
    }

    try {
      const cacheKey = String(customerId);
      let allOrders = erpCache.get(cacheKey);
      if (!allOrders) {
        allOrders = (await searchErpSettlementOrders({ traderId: customerId, maxRecords: 500 })) as unknown as Record<string, unknown>[];
        erpCache.set(cacheKey, allOrders);
        await sleep(DELAY_MS);
      }

      const selectedSet = new Set(holdIds.map(String));
      const matched = allOrders.filter(o => selectedSet.has(String(o.bizId)));

      if (matched.length === 0) {
        log(`  [跳过] ${instance_no}: ERP 中未找到匹配 (选中 ${holdIds.length} 个)`);
        stats.skipped++;
        continue;
      }

      if (!DRY_RUN) {
        // 写入主字段 + 删除 _details
        const newData = { ...form_data, holdSettlementOrders: matched };
        delete newData._details;
        await appQuery(
          `UPDATE oa_approval_instances SET form_data = $1 WHERE id = $2`,
          [JSON.stringify(newData), id]
        );
      }

      if (matched.length < holdIds.length) {
        log(`  [部分] ${instance_no}: 匹配 ${matched.length}/${holdIds.length}`);
        stats.partial++;
      } else {
        log(`  [成功] ${instance_no}: 迁移 ${matched.length} 条`);
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
// purchase_payment: debtIds / prepaymentIds
// =====================================================

async function migratePurchasePayment(stats: Stats) {
  log('=== purchase_payment: debtIds / prepaymentIds ===');

  const result = await appQuery<{ id: number; instance_no: string; form_data: Record<string, unknown> }>(
    `SELECT i.id, i.instance_no, i.form_data
     FROM oa_approval_instances i
     JOIN oa_form_types ft ON i.form_type_id = ft.id
     WHERE ft.code = 'purchase_payment'
       AND (
         (i.form_data ? 'debtIds' AND jsonb_array_length(COALESCE(i.form_data->'debtIds', '[]'::jsonb)) > 0)
         OR (i.form_data ? 'prepaymentIds' AND jsonb_array_length(COALESCE(i.form_data->'prepaymentIds', '[]'::jsonb)) > 0)
       )`
  );

  stats.total = result.rows.length;
  log(`找到 ${stats.total} 个 purchase_payment 实例`);

  const erpCache = new Map<string, Record<string, unknown>[]>();

  for (const row of result.rows) {
    const { id, instance_no, form_data } = row;
    const debtIds = form_data.debtIds;
    const prepaymentIds = form_data.prepaymentIds;
    const existingDetails = (form_data._details as Record<string, unknown>) || {};

    let migrated = false;

    // 迁移 debtIds
    if (isIdArray(debtIds) && debtIds.length > 0) {
      const supplierId = form_data.supplierId as string;
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

        const selectedSet = new Set(debtIds.map(String));
        const matched = allDebts.filter(d => selectedSet.has(String(d.bizId)));

        // 合并 _details 中的 paymentAmount/discountAmount
        const detailRecords = (existingDetails.debtIds as Record<string, unknown>[]) || [];
        const detailMap = new Map(detailRecords.map(d => [String(d.bizId), d]));

        const merged = matched.map(m => {
          const detail = detailMap.get(String(m.bizId));
          if (detail) {
            return {
              ...m,
              paymentAmount: detail.paymentAmount || '0',
              discountAmount: detail.discountAmount || '0',
            };
          }
          return { ...m, paymentAmount: '0', discountAmount: '0' };
        });

        form_data.debtIds = merged;
        migrated = true;
        log(`  [debtIds] ${instance_no}: 迁移 ${merged.length}/${debtIds.length}`);
      } catch (err) {
        log(`  [失败] ${instance_no} debtIds: ${err instanceof Error ? err.message : err}`);
        stats.failed++;
        // 不 continue：让 prepaymentIds 有机会独立迁移
      }
    }

    // 迁移 prepaymentIds
    if (isIdArray(prepaymentIds) && prepaymentIds.length > 0) {
      const supplierId = form_data.supplierId as string;
      if (!supplierId) {
        log(`  [跳过] ${instance_no}: 缺少 supplierId`);
        stats.skipped++;
        continue;
      }

      try {
        // 预付款使用 listTraderPrepayments API
        const cacheKey = `prepay:${supplierId}`;
        let allPrepays = erpCache.get(cacheKey);
        if (!allPrepays) {
          allPrepays = (await listTraderPrepayments(parseInt(supplierId, 10))) as unknown as Record<string, unknown>[];
          erpCache.set(cacheKey, allPrepays);
          await sleep(DELAY_MS);
        }

        const selectedSet = new Set(prepaymentIds.map(String));
        const matched = allPrepays.filter(d => selectedSet.has(String(d.id || d.bizId)));

        // 合并 _details 中的 useAmount
        const detailRecords = (existingDetails.prepaymentIds as Record<string, unknown>[]) || [];
        const detailMap = new Map(detailRecords.map(d => [String(d.id || d.bizId), d]));

        const merged = matched.map(m => {
          const detail = detailMap.get(String(m.id || m.bizId));
          if (detail) {
            return { ...m, useAmount: detail.useAmount || '0' };
          }
          return { ...m, useAmount: '0' };
        });

        form_data.prepaymentIds = merged;
        migrated = true;
        log(`  [prepaymentIds] ${instance_no}: 迁移 ${merged.length}/${prepaymentIds.length}`);
      } catch (err) {
        log(`  [失败] ${instance_no} prepaymentIds: ${err instanceof Error ? err.message : err}`);
        stats.failed++;
        continue;
      }
    }

    if (!migrated) {
      stats.skipped++;
      continue;
    }

    if (!DRY_RUN) {
      // 仅删除已成功迁移字段的 _details 子键，避免部分失败时丢失未迁移数据
      const details = form_data._details as Record<string, unknown> | undefined;
      if (details && typeof details === 'object') {
        if (isObjectArray(form_data.debtIds)) delete details.debtIds;
        if (isObjectArray(form_data.prepaymentIds)) delete details.prepaymentIds;
        // _details 为空则整体删除
        if (Object.keys(details).length === 0) delete form_data._details;
      }
      await appQuery(
        `UPDATE oa_approval_instances SET form_data = $1 WHERE id = $2`,
        [JSON.stringify(form_data), id]
      );
    }

    log(`  [成功] ${instance_no}`);
    stats.success++;
  }

  printStats('purchase_payment', stats);
}

// =====================================================
// logistics_fee: settlementIds
// =====================================================

async function migrateLogisticsFee(stats: Stats) {
  log('=== logistics_fee: settlementIds ===');

  const result = await appQuery<{ id: number; instance_no: string; form_data: Record<string, unknown> }>(
    `SELECT i.id, i.instance_no, i.form_data
     FROM oa_approval_instances i
     JOIN oa_form_types ft ON i.form_type_id = ft.id
     WHERE ft.code = 'logistics_fee'
       AND i.form_data ? 'settlementIds'
       AND jsonb_array_length(COALESCE(i.form_data->'settlementIds', '[]'::jsonb)) > 0`
  );

  stats.total = result.rows.length;
  log(`找到 ${stats.total} 个 logistics_fee 实例`);

  for (const row of result.rows) {
    const { id, instance_no, form_data } = row;
    const settlementIds = form_data.settlementIds;

    if (isObjectArray(settlementIds)) {
      stats.skipped++;
      continue;
    }

    if (!isIdArray(settlementIds)) {
      stats.skipped++;
      continue;
    }

    try {
      const allRecords: Record<string, unknown>[] = [];
      let current = 1;
      const pageSize = 100;
      let hasMore = true;

      while (hasMore) {
        const pageResult = await searchPurchaseSettlements({
          current,
          size: pageSize,
          billState: undefined as unknown as string,
        });
        allRecords.push(...(pageResult.records as unknown as Record<string, unknown>[]));
        hasMore = pageResult.records.length >= pageSize;
        current++;
        if (current > 50) break;
        await sleep(DELAY_MS);
      }

      const selectedSet = new Set(settlementIds.map(String));
      const matched = allRecords.filter(r => selectedSet.has(String(r.billStr)));

      if (matched.length === 0) {
        log(`  [跳过] ${instance_no}: ERP 中未找到匹配 (选中 ${settlementIds.length} 个)`);
        stats.skipped++;
        continue;
      }

      if (!DRY_RUN) {
        const newData = { ...form_data, settlementIds: matched };
        delete newData._details;
        await appQuery(
          `UPDATE oa_approval_instances SET form_data = $1 WHERE id = $2`,
          [JSON.stringify(newData), id]
        );
      }

      if (matched.length < settlementIds.length) {
        log(`  [部分] ${instance_no}: 匹配 ${matched.length}/${settlementIds.length}`);
        stats.partial++;
      } else {
        log(`  [成功] ${instance_no}: 迁移 ${matched.length} 条`);
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

async function migrateCustomerReconciliation(stats: Stats) {
  log('=== customer_reconciliation: receivableOrderIds / unreconciledOrderIds / differenceOrderIds ===');

  const result = await appQuery<{ id: number; instance_no: string; form_data: Record<string, unknown> }>(
    `SELECT i.id, i.instance_no, i.form_data
     FROM oa_approval_instances i
     JOIN oa_form_types ft ON i.form_type_id = ft.id
     WHERE ft.code = 'customer_reconciliation'
       AND (
         (i.form_data ? 'receivableOrderIds' AND jsonb_array_length(COALESCE(i.form_data->'receivableOrderIds', '[]'::jsonb)) > 0)
         OR (i.form_data ? 'unreconciledOrderIds' AND jsonb_array_length(COALESCE(i.form_data->'unreconciledOrderIds', '[]'::jsonb)) > 0)
         OR (i.form_data ? 'differenceOrderIds' AND jsonb_array_length(COALESCE(i.form_data->'differenceOrderIds', '[]'::jsonb)) > 0)
       )`
  );

  stats.total = result.rows.length;
  log(`找到 ${stats.total} 个 customer_reconciliation 实例`);

  const erpCache = new Map<string, Record<string, unknown>[]>();

  for (const row of result.rows) {
    const { id, instance_no, form_data } = row;
    const customerId = form_data.customerId as string | number;

    if (!customerId) {
      log(`  [跳过] ${instance_no}: 缺少 customerId`);
      stats.skipped++;
      continue;
    }

    const receivableOrderIds = form_data.receivableOrderIds;
    const unreconciledOrderIds = form_data.unreconciledOrderIds;
    const differenceOrderIds = form_data.differenceOrderIds;

    // 幂等：如果所有字段都已是对象数组则跳过
    const allMigrated =
      (!receivableOrderIds || isObjectArray(receivableOrderIds)) &&
      (!unreconciledOrderIds || isObjectArray(unreconciledOrderIds)) &&
      (!differenceOrderIds || isObjectArray(differenceOrderIds));
    if (allMigrated) {
      stats.skipped++;
      continue;
    }

    try {
      const cacheKey = String(customerId);
      let allOrders = erpCache.get(cacheKey);
      if (!allOrders) {
        allOrders = (await fetchReceivableOrders({ traderId: customerId })) as unknown as Record<string, unknown>[];
        erpCache.set(cacheKey, allOrders);
        await sleep(DELAY_MS);
      }

      let migratedCount = 0;

      // 迁移 receivableOrderIds
      if (isIdArray(receivableOrderIds) && receivableOrderIds.length > 0) {
        const selectedSet = new Set(receivableOrderIds.map(String));
        const matched = allOrders.filter(o => selectedSet.has(String(o.id)));
        form_data.receivableOrderIds = matched;
        migratedCount++;
        log(`  [receivableOrderIds] ${instance_no}: 迁移 ${matched.length}/${receivableOrderIds.length}`);
      }

      // 迁移 unreconciledOrderIds
      if (isIdArray(unreconciledOrderIds) && unreconciledOrderIds.length > 0) {
        const selectedSet = new Set(unreconciledOrderIds.map(String));
        const matched = allOrders.filter(o => selectedSet.has(String(o.id)));
        form_data.unreconciledOrderIds = matched;
        migratedCount++;
        log(`  [unreconciledOrderIds] ${instance_no}: 迁移 ${matched.length}/${unreconciledOrderIds.length}`);
      }

      // 迁移 differenceOrderIds
      if (isIdArray(differenceOrderIds) && differenceOrderIds.length > 0) {
        const selectedSet = new Set(differenceOrderIds.map(String));
        const matched = allOrders.filter(o => selectedSet.has(String(o.id)));
        form_data.differenceOrderIds = matched;
        migratedCount++;
        log(`  [differenceOrderIds] ${instance_no}: 迁移 ${matched.length}/${differenceOrderIds.length}`);
      }

      if (migratedCount === 0) {
        stats.skipped++;
        continue;
      }

      if (!DRY_RUN) {
        delete form_data._details;
        await appQuery(
          `UPDATE oa_approval_instances SET form_data = $1 WHERE id = $2`,
          [JSON.stringify(form_data), id]
        );
      }

      log(`  [成功] ${instance_no}: 迁移 ${migratedCount} 个字段`);
      stats.success++;
    } catch (err) {
      log(`  [失败] ${instance_no}: ${err instanceof Error ? err.message : err}`);
      stats.failed++;
    }
  }

  printStats('customer_reconciliation', stats);
}

// =====================================================
// promotion_*_offline: clientIdList + clientAreaIds
// =====================================================

async function migratePromotions(stats: Stats) {
  log('=== promotion_*_offline: clientIdList + clientAreaIds ===');

  const formTypes = ['promotion_special_offline', 'promotion_fullgift_offline', 'promotion_combined_offline'];

  for (const ftCode of formTypes) {
    const result = await appQuery<{ id: number; instance_no: string; form_data: Record<string, unknown> }>(
      `SELECT i.id, i.instance_no, i.form_data
       FROM oa_approval_instances i
       JOIN oa_form_types ft ON i.form_type_id = ft.id
       WHERE ft.code = $1
         AND (
           (i.form_data ? 'clientIdList' AND jsonb_array_length(COALESCE(i.form_data->'clientIdList', '[]'::jsonb)) > 0)
           OR (i.form_data ? 'clientAreaIds' AND jsonb_array_length(COALESCE(i.form_data->'clientAreaIds', '[]'::jsonb)) > 0)
         )`,
      [ftCode]
    );

    log(`[${ftCode}] 找到 ${result.rows.length} 个实例`);

    const customerCache = new Map<string, Record<string, unknown>[]>();

    for (const row of result.rows) {
      const { id, instance_no, form_data } = row;
      stats.total++;
      const clientIdList = form_data.clientIdList;
      const clientAreaIds = form_data.clientAreaIds;

      // 幂等检查
      const clientListMigrated = !clientIdList || isObjectArray(clientIdList);
      const areaIdsMigrated = !clientAreaIds || isObjectArray(clientAreaIds);
      if (clientListMigrated && areaIdsMigrated) {
        stats.skipped++;
        continue;
      }

      try {
        // 迁移 clientIdList
        if (isIdArray(clientIdList) && clientIdList.length > 0) {
          // 从 ERP 拉取客户列表
          let allCustomers = customerCache.get('all');
          if (!allCustomers) {
            allCustomers = (await searchErpCustomers(undefined, { includeAllStates: true })) as unknown as Record<string, unknown>[];
            customerCache.set('all', allCustomers);
            await sleep(DELAY_MS);
          }

          const selectedSet = new Set(clientIdList.map(String));
          const matched = allCustomers.filter(c => selectedSet.has(String(c.id)));

          if (matched.length > 0) {
            form_data.clientIdList = matched;
            log(`  [clientIdList] ${instance_no}: 迁移 ${matched.length}/${clientIdList.length}`);
          } else {
            log(`  [跳过] ${instance_no} clientIdList: ERP 中未找到匹配`);
          }
        }

        // 迁移 clientAreaIds（tree_select）
        if (isIdArray(clientAreaIds) && clientAreaIds.length > 0) {
          // 从本地 erp_areas 表查询片区名称
          const areaIds = clientAreaIds.map(Number).filter(n => !isNaN(n));
          if (areaIds.length > 0) {
            const areaResult = await appQuery<{ id: number; name: string }>(
              `SELECT id, name FROM erp_areas WHERE id = ANY($1)`,
              [areaIds]
            );
            const areaMap = new Map(areaResult.rows.map(a => [a.id, a.name]));
            const matched = clientAreaIds.map(id => {
              const numId = Number(id);
              return { id: numId, name: areaMap.get(numId) || String(id) };
            });
            form_data.clientAreaIds = matched;
            log(`  [clientAreaIds] ${instance_no}: 迁移 ${matched.length} 条`);
          }
        }

        if (!DRY_RUN) {
          delete form_data._details;
          await appQuery(
            `UPDATE oa_approval_instances SET form_data = $1 WHERE id = $2`,
            [JSON.stringify(form_data), id]
          );
        }

        stats.success++;
      } catch (err) {
        log(`  [失败] ${instance_no}: ${err instanceof Error ? err.message : err}`);
        stats.failed++;
      }
    }
  }

  printStats('promotions', stats);
}

// =====================================================
// 主函数
// =====================================================

async function main() {
  log(`=== SSOT 迁移脚本启动 (${DRY_RUN ? 'DRY-RUN 模式' : '写入模式'}) ===`);

  if (DRY_RUN) {
    log('当前为 DRY-RUN 模式，未执行任何写入。');
    log('确认结果后，运行: DRY_RUN=false npx tsx scripts/ssot-migrate-table-fields.ts');
    log('');
  }

  const ccStats = newStats();
  const ppStats = newStats();
  const lfStats = newStats();
  const crStats = newStats();
  const promoStats = newStats();

  await migrateCustomerCredit(ccStats);
  await migratePurchasePayment(ppStats);
  await migrateLogisticsFee(lfStats);
  await migrateCustomerReconciliation(crStats);
  await migratePromotions(promoStats);

  log('');
  log('=== 汇总 ===');
  const total = ccStats.total + ppStats.total + lfStats.total + crStats.total + promoStats.total;
  const success = ccStats.success + ppStats.success + lfStats.success + crStats.success + promoStats.success;
  const partial = ccStats.partial + ppStats.partial + lfStats.partial + crStats.partial + promoStats.partial;
  const skipped = ccStats.skipped + ppStats.skipped + lfStats.skipped + crStats.skipped + promoStats.skipped;
  const failed = ccStats.failed + ppStats.failed + lfStats.failed + crStats.failed + promoStats.failed;
  log(`总计: ${total}, 成功: ${success}, 部分成功: ${partial}, 跳过: ${skipped}, 失败: ${failed}`);

  if (failed > 0) {
    log(`\n注意: ${failed} 个实例迁移失败，请检查上方日志中的 [失败] 条目`);
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
