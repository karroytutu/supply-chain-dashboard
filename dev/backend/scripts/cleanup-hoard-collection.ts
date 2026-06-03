/**
 * 一次性清理脚本：修复压单字段名 bug 后，清理历史脏数据
 *
 * 背景：ERP API 返回的压单标记字段名为 isHoard，但代码中错误使用了 hoardTag，
 * 导致压单结算单未被排除催收，产生了错误的催收任务和考核记录。
 *
 * 本脚本在字段名修复（Tasks 1-3）后运行，一次性完成：
 * 1. 调用 detectAllHoardChanges 修复催收明细和任务
 * 2. 取消因压单 bug 错误产生的 pending 考核记录
 *
 * 运行: cd dev/backend && npx ts-node scripts/cleanup-hoard-collection.ts
 */

import { detectAllHoardChanges } from '../src/services/ar-collection/ar-hoard-detect';
import { cancelPendingBySource } from '../src/services/assessment/assessment.repository';
import { appQuery, closeAppPool } from '../src/db/appPool';

async function main() {
  const startTime = new Date();
  console.log('========== 开始一次性压单清理 ==========');
  console.log(`开始时间: ${startTime.toISOString()}`);

  try {
    // 步骤一：修复催收明细和任务
    console.log('\n--- 步骤一：压单检测（修复催收明细 + 重算任务 + 关闭任务）---');
    await detectAllHoardChanges();

    // 步骤二：取消被关闭任务的考核记录
    console.log('\n--- 步骤二：清理关联考核记录 ---');
    const closedTasks = await appQuery<{ id: number; task_no: string; consumer_name: string }>(
      `SELECT id, task_no, consumer_name
       FROM ar_collection_tasks
       WHERE status = 'closed'
         AND updated_at >= $1`,
      [startTime]
    );

    if (closedTasks.rows.length === 0) {
      console.log('本次检测未关闭任何任务，无需清理考核');
    } else {
      console.log(`本次检测关闭了 ${closedTasks.rows.length} 个任务:`);
      let totalCancelled = 0;

      for (const task of closedTasks.rows) {
        const cancelled = await cancelPendingBySource(task.id, 'ar_collection_task');
        if (cancelled > 0) {
          console.log(`  任务 ${task.task_no}(${task.consumer_name}): 取消 ${cancelled} 条考核记录`);
          totalCancelled += cancelled;
        }
      }

      console.log(`\n共取消 ${totalCancelled} 条考核记录`);
    }

    console.log('\n========== 清理完成 ==========');
  } catch (error) {
    console.error('清理失败:', error);
    process.exit(1);
  } finally {
    await closeAppPool();
  }

  process.exit(0);
}

main();
