/**
 * 同步引擎验证脚本
 * 测试欠款数据集的完整同步流程
 */
import { syncDataset } from '../src/services/erp-sync/sync-engine';
import { debtsConfig } from '../src/services/erp-sync/datasets/debts.dataset';
import { Pool } from 'pg';

const pool = new Pool({ host: 'localhost', port: 5432, database: 'xly_dashboard', user: 'postgres', password: 'postgres' });

async function runVerify() {
  console.log('=== Task 8.2: 引擎运行验证 ===');
  console.log('数据集:', debtsConfig.name, '(' + debtsConfig.id + ')');

  // 执行同步
  const result = await syncDataset(debtsConfig);
  console.log('同步结果:');
  console.log('  success:', result.success);
  console.log('  recordsFetched:', result.recordsFetched);
  console.log('  recordsUpserted:', result.recordsUpserted);
  console.log('  recordsChanged:', result.recordsChanged);
  console.log('  durationMs:', result.durationMs);
  if (result.error) console.log('  error:', result.error);

  // 验证 erp_sync_status
  const s = await pool.query('SELECT last_success_at, total_records, total_syncs, circuit_state FROM erp_sync_status WHERE source_id = $1', ['debts']);
  if (s.rows.length) {
    console.log('erp_sync_status:', JSON.stringify(s.rows[0]));
  }

  // 验证 erp_sync_log
  const l = await pool.query('SELECT status, records_fetched, records_upserted, duration_ms FROM erp_sync_log WHERE source_id = $1 ORDER BY id DESC LIMIT 1', ['debts']);
  if (l.rows.length) {
    console.log('erp_sync_log:', JSON.stringify(l.rows[0]));
  }

  // 验证本地表数据
  const c = await pool.query('SELECT COUNT(*) as cnt FROM erp_debts');
  console.log('erp_debts 行数:', c.rows[0].cnt);

  // 抽样验证数据完整性
  const sample = await pool.query('SELECT bill_id, consumer_name, left_amount, content_hash IS NOT NULL as has_hash, synced_at IS NOT NULL as has_synced FROM erp_debts LIMIT 3');
  console.log('抽样数据:');
  sample.rows.forEach((r: any) => console.log('  ', r.bill_id, r.consumer_name, 'left=' + r.left_amount, 'hash=' + r.has_hash, 'synced=' + r.has_synced));

  pool.end();
  console.log('=== 验证完成 ===');
}

runVerify().catch(e => { console.error('FAIL:', e.message); pool.end(); process.exit(1); });
