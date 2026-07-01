/**
 * 单月深度诊断脚本
 * 对比本地 DB 和 ERP API 的 2024-01 数据
 * 用法: npx ts-node scripts/diagnose-month.ts
 */
import 'dotenv/config';
import { Pool } from 'pg';
import { fetchSalesDetails } from '../src/services/erp-client/erp-sales-detail.service';

const pool = new Pool({
  host: process.env.APP_DB_HOST,
  port: 5432,
  database: process.env.APP_DB_NAME,
  user: process.env.APP_DB_USER,
  password: process.env.APP_DB_PASSWORD,
});

async function diagnose() {
  const from = '2024-01-01';
  const to = '2024-02-01';

  console.log('=== 2024-01 深度诊断 ===\n');

  // 1. 从 ERP 重新拉取
  const records = await fetchSalesDetails(from, to, true);
  console.log('ERP records.length:', records.length);

  // 2. 本地 DB 查询
  const localResult = await pool.query(
    "SELECT COUNT(*) FROM erp_sales_details WHERE settle_time >= $1 AND settle_time < $2",
    [from, to]
  );
  const localCount = parseInt(localResult.rows[0].count);
  console.log('本地 DB 行数:', localCount);
  console.log('差异 (本地 - ERP):', localCount - records.length);

  // 3. 提取 settle_time 日期分布
  const erpDays = new Map<string, number>();
  for (const r of records as any[]) {
    const day = r.settleTime?.substring(0, 10) || 'null';
    erpDays.set(day, (erpDays.get(day) || 0) + 1);
  }
  console.log('\nERP settle_time 日分布:');
  [...erpDays.entries()].sort().forEach(([day, cnt]) => {
    console.log(`  ${day}: ${cnt}`);
  });

  // 4. 本地日分布
  const localDayDist = await pool.query(
    "SELECT SUBSTRING(settle_time, 1, 10) as day, COUNT(*) as cnt FROM erp_sales_details WHERE settle_time >= $1 AND settle_time < $2 GROUP BY 1 ORDER BY 1",
    [from, to]
  );
  console.log('\n本地 settle_time 日分布:');
  localDayDist.rows.forEach((r: any) => console.log(`  ${r.day}: ${r.cnt}`));

  // 5. 检查 ERP settle_time 是否全在 2024-01 范围内
  let outsideRange = 0;
  for (const r of records as any[]) {
    const st = r.settleTime || '';
    if (st < from || st >= to) outsideRange++;
  }
  console.log(`\nERP 中 settle_time 超出 [${from}, ${to}) 范围的记录: ${outsideRange}`);

  // 6. 检查本地 settle_time 是否有超出范围的
  const localOutside = await pool.query(
    "SELECT COUNT(*) FROM erp_sales_details WHERE settle_time >= $1 AND settle_time < $2 AND (settle_time < $1 OR settle_time >= $2)",
    [from, to]
  );
  console.log(`本地中 settle_time 超出范围的记录: ${localOutside.rows[0].count}`);

  await pool.end();
}

diagnose().catch(async (err) => {
  console.error('Fatal:', err.message);
  await pool.end();
});
