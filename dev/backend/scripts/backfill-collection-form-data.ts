/**
 * 一次性数据补齐脚本：为历史催收OA实例补充新增字段
 *
 * 背景：催收表单新增了订单编号、业务日期、已结金额、单据备注（账单明细）
 * 以及最大欠款天数、最大欠款单数（客户授信账期）。
 * 历史实例的 form_data 中缺少这些字段，详情页显示灰色"-"。
 *
 * 本脚本从 ERP 当前欠款数据中匹配回填：
 * - 账单明细：通过 billNo（ERP billId）匹配，补充 orderNo/workTime/writeOffAmount/billNote
 * - 客户授信：通过 consumerName 匹配，补充 maxDebtDays/maxDebtOrderNum
 *
 * 运行（默认 dry-run）:  cd dev/backend && npx ts-node scripts/backfill-collection-form-data.ts
 * 执行实际写入:          cd dev/backend && DRY_RUN=false npx ts-node scripts/backfill-collection-form-data.ts
 */

import { appQuery, getAppClient, closeAppPool } from '../src/db/appPool';
import { fetchAllErpDebts } from '../src/services/erp-client/erp-debt.service';
import { searchErpCustomers } from '../src/services/erp-client/erp-customer.service';
import type { ErpCustomer } from '../src/services/erp-client/erp-customer.service';
import type { ERPDebtRecord } from '../src/services/erp-debt/erp-debt.types';

/** ERP 客户搜索结果的扩展字段（搜索 API 返回但 ErpCustomer 接口未显式声明） */
interface ErpCustomerWithLimits extends ErpCustomer {
  maxDebtDays?: string | number;
  maxDebtOrderNum?: string | number;
}

// =====================================================
// 配置
// =====================================================

const DRY_RUN = process.env.DRY_RUN !== 'false';

/** 安全解析整数，避免 0 被 falsy 转为 null */
function parseIntOrNull(val: string | number | null | undefined): number | null {
  if (val === null || val === undefined || val === '') return null;
  const parsed = parseInt(String(val), 10);
  return Number.isNaN(parsed) ? null : parsed;
}

// =====================================================
// 主流程
// =====================================================

async function main() {
  console.log(`\n=== 催收OA历史实例数据补齐 ===`);
  console.log(`模式: ${DRY_RUN ? 'DRY-RUN（不写入数据库）' : '实际写入'}\n`);

  // 1. 从 ERP 拉取全部当前欠款明细
  console.log('步骤 1: 拉取 ERP 当前欠款明细...');
  const allDebts = await fetchAllErpDebts(true); // skipCache
  console.log(`  获取到 ${allDebts.length} 条 ERP 欠款记录`);

  // 建立 billId → ERP 数据映射
  const debtMap = new Map<string, ERPDebtRecord>();
  for (const d of allDebts) {
    debtMap.set(d.billId, d);
  }
  console.log(`  建立了 ${debtMap.size} 个 billId 映射`);

  // 2. 获取客户档案数据（用于 maxDebtDays / maxDebtOrderNum）
  console.log('\n步骤 2: 获取 ERP 客户档案...');
  const customers = await searchErpCustomers();
  const customerByName = new Map<string, { maxDebtDays: number | null; maxDebtOrderNum: number | null }>();
  for (const c of customers) {
    const cl = c as ErpCustomerWithLimits;
    customerByName.set(c.name, {
      maxDebtDays: parseIntOrNull(cl.maxDebtDays),
      maxDebtOrderNum: parseIntOrNull(cl.maxDebtOrderNum),
    });
  }
  console.log(`  获取到 ${customerByName.size} 个客户档案`);

  // 3. 查询数据库中所有催收实例
  console.log('\n步骤 3: 查询历史催收实例...');
  const instances = await appQuery<{ id: number; form_data: any; consumer_name: string }>(
    `SELECT i.id, i.form_data, i.form_data->>'consumerName' as consumer_name
     FROM oa_approval_instances i
     JOIN oa_form_types ft ON i.form_type_id = ft.id
     WHERE ft.code = 'ar_collection'
       AND i.form_data->>'consumerName' NOT LIKE 'E2E%'
     ORDER BY i.id`
  );
  console.log(`  找到 ${instances.rows.length} 个实例`);

  // 4. 遍历并补齐数据
  console.log('\n步骤 4: 匹配并补齐数据...');
  let updatedCount = 0;
  let billMatched = 0;
  let billUnmatched = 0;
  let customerMatched = 0;
  let customerUnmatched = 0;
  const updates: Array<{ id: number; form_data: any }> = [];

  for (const row of instances.rows) {
    const formData = row.form_data;
    let changed = false;

    // 4a. 补齐账单明细
    const billDetails: any[] = formData.billDetails || [];
    for (const bill of billDetails) {
      if (!bill.billNo) continue;
      const erpDebt = debtMap.get(bill.billNo);
      if (erpDebt) {
        // 仅在字段不存在时补充（幂等）
        if (bill.orderNo === undefined) { bill.orderNo = erpDebt.bizOrderStr || ''; changed = true; }
        if (bill.workTime === undefined) { bill.workTime = erpDebt.workTime || ''; changed = true; }
        if (bill.writeOffAmount === undefined) { bill.writeOffAmount = erpDebt.writeOffAmount || 0; changed = true; }
        if (bill.billNote === undefined) { bill.billNote = erpDebt.billNote || ''; changed = true; }
        billMatched++;
      } else {
        // ERP 中已无此账单（可能已结清），补充空值占位
        if (bill.orderNo === undefined) { bill.orderNo = ''; changed = true; }
        if (bill.workTime === undefined) { bill.workTime = ''; changed = true; }
        if (bill.writeOffAmount === undefined) { bill.writeOffAmount = 0; changed = true; }
        if (bill.billNote === undefined) { bill.billNote = ''; changed = true; }
        billUnmatched++;
      }
    }

    // 4b. 补齐客户授信账期
    const consumerName = row.consumer_name;
    if (consumerName) {
      const customer = customerByName.get(consumerName);
      if (customer) {
        if (formData.maxDebtDays === undefined) { formData.maxDebtDays = customer.maxDebtDays; changed = true; }
        if (formData.maxDebtOrderNum === undefined) { formData.maxDebtOrderNum = customer.maxDebtOrderNum; changed = true; }
        customerMatched++;
      } else {
        if (formData.maxDebtDays === undefined) { formData.maxDebtDays = null; changed = true; }
        if (formData.maxDebtOrderNum === undefined) { formData.maxDebtOrderNum = null; changed = true; }
        customerUnmatched++;
      }
    }

    if (changed) {
      updates.push({ id: row.id, form_data: formData });
      updatedCount++;
    }
  }

  console.log(`\n  统计:`);
  console.log(`    需更新的实例: ${updatedCount} / ${instances.rows.length}`);
  console.log(`    账单匹配成功: ${billMatched}，未匹配: ${billUnmatched}`);
  console.log(`    客户匹配成功: ${customerMatched}，未匹配: ${customerUnmatched}`);

  // 5. 批量写入数据库
  if (updates.length === 0) {
    console.log('\n无需更新，退出。');
    return;
  }

  if (DRY_RUN) {
    console.log(`\nDRY-RUN 模式，跳过写入 ${updates.length} 条更新。`);
    console.log('设置 DRY_RUN=false 环境变量以执行实际写入。');
    return;
  }

  console.log(`\n步骤 5: 写入数据库（${updates.length} 条更新）...`);
  const client = await getAppClient();
  try {
    await client.query('BEGIN');
    for (const update of updates) {
      await client.query(
        `UPDATE oa_approval_instances SET form_data = $1::jsonb WHERE id = $2`,
        [JSON.stringify(update.form_data), update.id]
      );
    }
    await client.query('COMMIT');
    console.log(`  ✅ 成功更新 ${updates.length} 个实例`);
  } catch (err) {
    await client.query('ROLLBACK');
    console.error(`  ❌ 写入失败，已回滚:`, err);
  } finally {
    client.release();
  }
}

// =====================================================
// 执行
// =====================================================

main()
  .catch(err => {
    console.error('脚本执行失败:', err);
    process.exit(1);
  })
  .finally(() => {
    closeAppPool().then(() => process.exit(0));
  });
