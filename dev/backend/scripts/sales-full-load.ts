/**
 * 销售明细全量加载脚本
 * 月份并行 + 页内串行：多个月同时处理，每个月内逐页串行拉取（保证数据完整性）
 * 用法: npx ts-node scripts/sales-full-load.ts
 */
import 'dotenv/config';
import { Pool } from 'pg';
import { createHash } from 'crypto';
import { erpPost } from '../src/services/erp-client/erp-client';
import { getErpDefaults } from '../src/services/erp-client/erp-config';
import { SALES_BUSINESS_ATTR_IDS } from '../src/utils/constants';
import { fetchAllPagesSequential } from '../src/services/erp-client/erp-pagination';

const pool = new Pool({
  host: process.env.APP_DB_HOST,
  port: 5432,
  database: process.env.APP_DB_NAME,
  user: process.env.APP_DB_USER,
  password: process.env.APP_DB_PASSWORD,
});

const BATCH_SIZE = 200;
const PAGE_SIZE = 1000;
const MONTH_PARALLEL = 10; // 同时并行处理的月份数

/** 拉取一个月的销售明细（页内串行） */
async function fetchMonth(dateFrom: string, dateTo: string): Promise<any[]> {
  const { cid, uid } = getErpDefaults();

  const fetchPage = async (current: number) => {
    const result = await erpPost<any>(
      '/funds-sale/list-sale-detail',
      {
        dimList: [], submitTimeFrom: dateFrom, submitTimeTo: dateTo,
        goodsIds: [], consumerIds: [], salesmanIds: [], subTypes: [],
        billTypes: [], businessAttrIds: [...SALES_BUSINESS_ATTR_IDS],
        tagIds: [], orderStateIds: ['APPROVED'], settlementStateIds: [],
        brandIds: [], categoryIds: [], costPriceType: 'MOVE_COST_PRICE',
        areaIds: [], groupIds: [], gradeIds: [], deliverIds: [],
        orderNote: '', originStr: '', warehouseIds: [],
        submitTimeType: 'settle_time', unitDisplayType: 'BASE_UNIT',
        mixPriceUnit: 'PKG_UNIT', exportType: 'mergeexport',
        orderBy: '', orderType: '', signStateIds: [], deptIds: [],
        settleConsumerIds: [], supplierIds: [], defaultSelectedIndex: 0,
        qualityType: '', current, size: PAGE_SIZE,
        fundsSaleTotalAmountFrom: '', fundsSaleTotalAmountTo: '',
        bizCollectorIds: [], fuzzySearchGoodsStr: '', cid, uid,
      },
      { pathPrefix: '/toliman/', businessType: 'sales_full_load' }
    );
    return {
      records: result?.data?.records || [],
      total: result?.data?.total || 0,
    };
  };

  return fetchAllPagesSequential(fetchPage, PAGE_SIZE);
}

/** INSERT 一批记录 */
async function insertBatch(records: any[]): Promise<number> {
  if (records.length === 0) return 0;

  const rows = records.map((r: any) => ({
    biz_str: r.bizStr || null,
    goods_id: r.goodsId || null,
    goods_name: r.goodsName || null,
    base_quantity: r.baseQuantity || 0,
    settle_time: r.settleTime || null,
    consumer_name: r.consumerName || null,
    raw_data: JSON.stringify(r),
    content_hash: createHash('md5').update(JSON.stringify({ biz_str: r.bizStr, goods_id: r.goodsId })).digest('hex'),
    synced_at: new Date().toISOString(),
  }));

  const cols = Object.keys(rows[0]).filter(c => c !== 'id');
  const placeholders: string[] = [];
  const values: unknown[] = [];
  let paramIdx = 1;
  for (const row of rows) {
    const rp: string[] = [];
    for (const col of cols) {
      rp.push(`$${paramIdx}`);
      values.push((row as any)[col] ?? null);
      paramIdx++;
    }
    placeholders.push(`(${rp.join(', ')})`);
  }
  const result = await pool.query(
    `INSERT INTO erp_sales_details (${cols.join(', ')}) VALUES ${placeholders.join(', ')}`,
    values
  );
  return result.rowCount ?? 0;
}

async function run() {
  console.log('=== 销售明细全量加载（月份并行 + 页内串行） ===');
  console.log(`并行度: ${MONTH_PARALLEL} 个月同时处理`);

  // 重置 checkpoint
  await pool.query("UPDATE erp_sync_status SET full_load_complete = FALSE, full_load_checkpoint = NULL WHERE source_id = 'sales'");
  console.log('Checkpoint 已重置');

  // 清空表
  await pool.query('DELETE FROM erp_sales_details');
  console.log('表已清空');

  // 生成月份范围
  const now = new Date();
  const beijing = new Date(now.getTime() + (now.getTimezoneOffset() + 480) * 60000);
  const endYear = beijing.getFullYear();
  const endMon = beijing.getMonth() + 1;

  const months: { from: string; to: string; label: string }[] = [];
  let year = 2020, month = 1;
  while (year < endYear || (year === endYear && month <= endMon)) {
    const label = `${year}-${String(month).padStart(2, '0')}`;
    const from = `${label}-01`;
    const lastDay = new Date(year, month, 0).getDate();
    const to = `${label}-${String(lastDay).padStart(2, '0')}`;
    months.push({ from, to, label });
    month = month === 12 ? 1 : month + 1;
    year = month === 1 ? year + 1 : year;
  }

  console.log(`共 ${months.length} 个月需要加载 (2020-01 ~ ${endYear}-${String(endMon).padStart(2, '0')})`);

  let totalInserted = 0;
  const startTime = Date.now();
  const results: { label: string; count: number }[] = [];

  // 按月分批并行处理
  for (let batchStart = 0; batchStart < months.length; batchStart += MONTH_PARALLEL) {
    const batch = months.slice(batchStart, batchStart + MONTH_PARALLEL);

    const batchResults = await Promise.all(
      batch.map(async ({ from, to, label }) => {
        try {
          const records = await fetchMonth(from, to);
          let inserted = 0;
          for (let j = 0; j < records.length; j += BATCH_SIZE) {
            const chunk = records.slice(j, j + BATCH_SIZE);
            inserted += await insertBatch(chunk);
          }
          return { label, count: inserted };
        } catch (err: any) {
          console.error(`${label} 失败:`, err.message);
          return { label, count: 0 };
        }
      })
    );

    for (const r of batchResults) {
      results.push(r);
      totalInserted += r.count;
    }

    const elapsed = Math.round((Date.now() - startTime) / 1000);
    const done = Math.min(batchStart + MONTH_PARALLEL, months.length);
    console.log(`进度: ${done}/${months.length} 月, 累计 ${totalInserted} 条 (${elapsed}s)`);
  }

  // 标记完成
  await pool.query("UPDATE erp_sync_status SET full_load_complete = TRUE, full_load_checkpoint = NULL WHERE source_id = $1", ['sales']);
  const totalElapsed = Math.round((Date.now() - startTime) / 1000);
  console.log(`\n全量加载完成! 共 ${totalInserted} 条, 耗时 ${totalElapsed}s`);

  const total = await pool.query('SELECT COUNT(*) FROM erp_sales_details');
  console.log(`数据库总行数: ${total.rows[0].count}`);

  await pool.end();
}

run().catch(async (err) => {
  console.error('Fatal:', err.message);
  await pool.end();
});
