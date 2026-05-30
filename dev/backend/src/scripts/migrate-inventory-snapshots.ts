/**
 * 历史库存快照数据迁移脚本
 * 从 xinshutong 数据库的 "实时库存表_每天" 迁移到 xly_dashboard 的 erp_inventory_snapshots
 *
 * 使用方式：
 *   cd dev/backend && npx ts-node src/scripts/migrate-inventory-snapshots.ts
 *
 * 前提条件：
 *   1. 070_erp_inventory_snapshots.sql 迁移已执行
 *   2. xinshutong 数据库可访问
 */

import { Pool } from 'pg';
import dotenv from 'dotenv';
import path from 'path';
import { formatDateOnly } from '../utils/dateFormat';

dotenv.config({ path: path.resolve(__dirname, '../../.env.development') });

const BATCH_SIZE = 2000;

async function main() {
  // 源数据库（xinshutong，只读）
  const sourcePool = new Pool({
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5432'),
    database: process.env.DB_NAME || 'xinshutong',
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || 'postgres',
  });

  // 目标数据库（xly_dashboard，读写）
  const targetPool = new Pool({
    host: process.env.APP_DB_HOST || 'localhost',
    port: parseInt(process.env.APP_DB_PORT || '5432'),
    database: process.env.APP_DB_NAME || 'xly_dashboard',
    user: process.env.APP_DB_USER || 'postgres',
    password: process.env.APP_DB_PASSWORD || 'postgres',
  });

  try {
    // 测试连接
    await sourcePool.query('SELECT 1');
    console.log('源数据库 (xinshutong) 连接成功');

    await targetPool.query('SELECT 1');
    console.log('目标数据库 (xly_dashboard) 连接成功');

    // 检查目标表是否存在
    const tableCheck = await targetPool.query(
      `SELECT EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'erp_inventory_snapshots')`
    );
    if (!tableCheck.rows[0].exists) {
      console.error('错误: erp_inventory_snapshots 表不存在，请先执行 070_erp_inventory_snapshots.sql 迁移');
      process.exit(1);
    }

    // 检查已有数据，避免重复迁移
    const existingResult = await targetPool.query(
      'SELECT COUNT(*) as cnt, MIN(snapshot_date) as earliest, MAX(snapshot_date) as latest FROM erp_inventory_snapshots'
    );
    const existingCount = parseInt(existingResult.rows[0].cnt);
    console.log(`目标表已有 ${existingCount} 条记录 (${existingResult.rows[0].earliest || 'N/A'} ~ ${existingResult.rows[0].latest || 'N/A'})`);

    // 查询源数据概况
    const sourceInfo = await sourcePool.query(`
      SELECT 
        MIN("数据日期"::date) as earliest,
        MAX("数据日期"::date) as latest,
        COUNT(*) as total,
        COUNT(DISTINCT "数据日期"::date) as days
      FROM "实时库存表_每天"
    `);
    console.log(`源数据: ${sourceInfo.rows[0].total} 条, ${sourceInfo.rows[0].days} 天 (${sourceInfo.rows[0].earliest} ~ ${sourceInfo.rows[0].latest})`);

    // 查询源数据库所有日期
    const sourceDatesResult = await sourcePool.query(`
      SELECT DISTINCT "数据日期"::date as snap_date
      FROM "实时库存表_每天"
      ORDER BY snap_date
    `);

    // 查询目标数据库已有日期
    const targetDatesResult = await targetPool.query(
      'SELECT DISTINCT snapshot_date FROM erp_inventory_snapshots ORDER BY snapshot_date'
    );
    const existingDates = new Set(
      targetDatesResult.rows.map((r: any) => formatDateOnly(r.snapshot_date))
    );

    const pendingDates = sourceDatesResult.rows
      .map((r: any) => formatDateOnly(r.snap_date))
      .filter((d: string) => !existingDates.has(d));

    if (pendingDates.length === 0) {
      console.log('所有日期数据已迁移，无需操作');
      return;
    }

    console.log(`待迁移日期: ${pendingDates.length} 天 (${pendingDates[0]} ~ ${pendingDates[pendingDates.length - 1]})`);

    let totalInserted = 0;
    let totalSkipped = 0;

    for (const date of pendingDates) {
      // 从源数据库读取该日期的数据
      const sourceResult = await sourcePool.query(`
        SELECT
          "goodsId",
          "goodsName",
          "availableBaseQuantity",
          "baseCostPrice"
        FROM "实时库存表_每天"
        WHERE "数据日期"::date = $1
      `, [date]);

      const rows = sourceResult.rows;
      if (rows.length === 0) {
        console.log(`  ${date}: 无数据，跳过`);
        continue;
      }

      // 按 goods_id 去重（同一天同一商品可能有多条仓库记录，聚合求和）
      const aggregated = new Map<number, {
        goods_id: number;
        goods_name: string;
        available_base_quantity: number;
        total_cost: number;
        total_qty: number;
      }>();

      for (const row of rows) {
        const goodsId = Math.round(parseFloat(row.goodsId) || 0);
        const qty = row.availableBaseQuantity || 0;
        const costPrice = parseFloat(row.baseCostPrice) || 0;

        const existing = aggregated.get(goodsId);
        if (existing) {
          existing.available_base_quantity += qty;
          existing.total_cost += costPrice * qty;
          existing.total_qty += qty;
        } else {
          aggregated.set(goodsId, {
            goods_id: goodsId,
            goods_name: row.goodsName,
            available_base_quantity: qty,
            total_cost: costPrice * qty,
            total_qty: qty,
          });
        }
      }

      const records = Array.from(aggregated.values());

      // 批量插入（使用 ON CONFLICT 保证幂等）
      for (let i = 0; i < records.length; i += BATCH_SIZE) {
        const batch = records.slice(i, i + BATCH_SIZE);
        const values: string[] = [];
        const params: any[] = [];
        let paramIdx = 1;

        for (const rec of batch) {
          values.push(`($${paramIdx}, $${paramIdx + 1}, $${paramIdx + 2}, $${paramIdx + 3}, $${paramIdx + 4})`);
          params.push(
            date,
            rec.goods_id,
            rec.goods_name,
            rec.available_base_quantity,
            rec.total_qty > 0 ? rec.total_cost / rec.total_qty : 0
          );
          paramIdx += 5;
        }

        const insertResult = await targetPool.query(
          `INSERT INTO erp_inventory_snapshots (snapshot_date, goods_id, goods_name, available_base_quantity, base_cost_price)
           VALUES ${values.join(', ')}
           ON CONFLICT (snapshot_date, goods_id) DO NOTHING`,
          params
        );

        const inserted = insertResult.rowCount || 0;
        totalInserted += inserted;
        totalSkipped += batch.length - inserted;
      }

      console.log(`  ${date}: ${records.length} 条商品 (插入 ${records.length}, 跳过 ${0})`);
    }

    console.log(`\n迁移完成: 共插入 ${totalInserted} 条, 跳过 ${totalSkipped} 条`);

    // 验证迁移结果
    const verifyResult = await targetPool.query(`
      SELECT 
        COUNT(*) as total,
        COUNT(DISTINCT snapshot_date) as days,
        MIN(snapshot_date) as earliest,
        MAX(snapshot_date) as latest
      FROM erp_inventory_snapshots
    `);
    console.log(`目标表验证: ${verifyResult.rows[0].total} 条, ${verifyResult.rows[0].days} 天 (${verifyResult.rows[0].earliest} ~ ${verifyResult.rows[0].latest})`);

  } catch (error: any) {
    console.error('迁移失败:', error.message);
    process.exit(1);
  } finally {
    await sourcePool.end();
    await targetPool.end();
  }
}

main();
