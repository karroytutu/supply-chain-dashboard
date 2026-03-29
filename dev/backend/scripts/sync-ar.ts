/**
 * 手动同步应收账款数据脚本
 * 运行: npx ts-node scripts/sync-ar.ts
 */
import { syncArReceivables } from '../src/services/accounts-receivable/ar-sync.service';
import { closePool } from '../src/db/pool';
import { closeAppPool } from '../src/db/appPool';

async function main() {
  console.log('开始手动同步应收账款数据...\n');
  
  try {
    const result = await syncArReceivables();
    console.log('\n========== 同步完成 ==========');
    console.log('总记录数:', result.total);
    console.log('新增:', result.synced);
    console.log('更新:', result.updated);
    console.log('错误:', result.errors);
  } catch (error) {
    console.error('同步失败:', error);
    process.exit(1);
  } finally {
    await closePool();
    await closeAppPool();
  }
  
  process.exit(0);
}

main();
