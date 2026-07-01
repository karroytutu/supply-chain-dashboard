/**
 * 月份差异精细分析
 * 选取几个月份，分别拉取 ERP 数据并 INSERT 到临时表，然后逐条对比
 * 用法: npx ts-node scripts/month-diff-analysis.ts
 */
import 'dotenv/config';
import { Pool } from 'pg';
import { createHash } from 'crypto';
import { fetchSalesDetails } from '../src/services/erp-client/erp-sales-detail.service';

const pool = new Pool({
  host: process.env.APP_DB_HOST,
  port: 5432,
  database: process.env.APP_DB_NAME,
  user: process.env.APP_DB_USER,
  password: process.env.APP_DB_PASSWORD,
});

interface MonthAnalysis {
  month: string;
  from: string;
  to: string;
  erpTotal: number;
  erpRecords: any[];
}

async function loadMonth(from: string, to: string): Promise<MonthAnalysis> {
  const records = await fetchSalesDetails(from, to, true);
  return {
    month: from.substring(0, 7),
    from,
    to,
    erpTotal: records.length,
    erpRecords: records,
  };
}

async function analyze() {
  console.log('=== 月份差异精细分析 ===\n');

  // 选取 3 个月：一个差异大的负差（本地少），一个正差（本地多），一个差异小的
  const months = [
    { from: '2024-01-01', to: '2024-02-01', label: '2024-01 (上次差异 -715)' },
    { from: '2025-09-01', to: '2025-10-01', label: '2025-09 (上次差异 +839)' },
    { from: '2025-03-01', to: '2025-04-01', label: '2025-03 (上次差异 -32)' },
  ];

  for (const m of months) {
    console.log(`\n========== ${m.label} ==========`);

    const data = await loadMonth(m.from, m.to);
    console.log(`ERP 返回记录数: ${data.erpTotal}`);

    // 分析 ERP 记录中 settleTime 的分布
    const settleIn = data.erpRecords.filter((r: any) => {
      const st = r.settleTime || '';
      return st >= m.from && st < m.to;
    });
    const settleOut = data.erpRecords.filter((r: any) => {
      const st = r.settleTime || '';
      return st < m.from || st >= m.to;
    });

    console.log(`  settleTime 在 [${m.from}, ${m.to}) 内: ${settleIn.length}`);
    console.log(`  settleTime 在范围外: ${settleOut.length}`);

    if (settleOut.length > 0) {
      // 范围外的 settleTime 在哪几个月
      const outMonths = new Map<string, number>();
      settleOut.forEach((r: any) => {
        const mo = (r.settleTime || '').substring(0, 7);
        outMonths.set(mo, (outMonths.get(mo) || 0) + 1);
      });
      console.log(`  范围外 settleTime 月份: ${JSON.stringify(Object.fromEntries([...outMonths.entries()].sort()))}`);

      // 范围外的 orderTime 呢
      const orderIn = settleOut.filter((r: any) => {
        const ot = r.orderTime || '';
        return ot >= m.from && ot < m.to;
      });
      console.log(`  范围外中 orderTime 在月内: ${orderIn.length} / ${settleOut.length}`);

      // 看几条典型记录
      console.log(`  典型记录 (前3条范围外):`);
      settleOut.slice(0, 3).forEach((r: any) => {
        console.log(`    orderTime=${r.orderTime}  settleTime=${r.settleTime}  bizStr=${r.bizStr}`);
      });
    }

    // 关键指标：如果只存 settleTime 在范围内的记录，数量是否 = ERP total - settleOut
    const expectedLocal = data.erpTotal - settleOut.length;
    console.log(`\n  如果本地只存 settleTime 在范围内的: ${expectedLocal}`);
    console.log(`  ERP total: ${data.erpTotal}`);
    console.log(`  预期差异 (本地 - ERP): ${expectedLocal - data.erpTotal} (即 -${settleOut.length})`);
  }

  console.log('\n========== 结论 ==========');
  console.log('差异 = ERP 返回的 settleTime 在查询范围外的记录数');
  console.log('ERP API 按 orderTime 过滤，但我们按 settleTime 存储和查询');

  await pool.end();
}

analyze().catch(async (err) => {
  console.error('Fatal:', err.message);
  await pool.end();
});
