/**
 * 测量应收看板在无缓存场景下的真实耗时
 */
import { cache } from '../utils/cache';
import { buildDashboardContext } from '../services/ar-dashboard/ar-dashboard-data';
import { getArDashboardOverview } from '../services/ar-dashboard/ar-dashboard.service';

async function main() {
  console.log('=== 应收看板无缓存性能测试 ===\n');

  // 步骤1：清除所有相关缓存
  console.log('[步骤1] 清除所有缓存...');
  cache.invalidate('ar:');
  cache.invalidate('erp:');
  cache.invalidate('overview:');
  cache.invalidate('strategic:');
  console.log('  缓存已清除\n');

  // 步骤2：测量 buildDashboardContext（数据获取层）
  console.log('[步骤2] 测量 buildDashboardContext（ERP数据获取）...');
  const t1 = Date.now();
  const ctx = await buildDashboardContext();
  const t1End = Date.now();
  console.log(`  耗时: ${t1End - t1}ms`);
  console.log(`  欠款记录数: ${ctx.enrichedDebts.length}`);
  console.log(`  OA催收实例数: ${ctx.oaInstances.length}`);
  console.log(`  即将逾期预警数: ${ctx.upcomingWarnings.length}`);
  console.log(`  DSO: ${ctx.dsoValue}\n`);

  // 步骤3：再次清除缓存，测量完整 getArDashboardOverview
  console.log('[步骤3] 再次清除缓存，测量完整 overview...');
  cache.invalidate('ar:');
  cache.invalidate('erp:');
  const t2 = Date.now();
  const overview = await getArDashboardOverview();
  const t2End = Date.now();
  console.log(`  耗时: ${t2End - t2}ms`);
  console.log(`  KPI卡片数: ${overview.kpiCards.length}`);
  console.log(`  营销师数: ${overview.marketers.length}`);
  console.log(`  明细行数: ${overview.details.length}`);
  const jsonStr = JSON.stringify(overview);
  console.log(`  响应数据大小: ${Math.round(jsonStr.length / 1024)}KB\n`);

  // 步骤4：测量有缓存时的耗时
  console.log('[步骤4] 测量有缓存时的耗时（第二次调用）...');
  const t3 = Date.now();
  await getArDashboardOverview();
  const t3End = Date.now();
  console.log(`  耗时: ${t3End - t3}ms\n`);

  console.log('=== 总结 ===');
  console.log(`  无缓存（ERP数据获取）: ${t1End - t1}ms`);
  console.log(`  无缓存（完整overview）: ${t2End - t2}ms`);
  console.log(`  有缓存（命中缓存）: ${t3End - t3}ms`);
  console.log(`  缓存加速比: ${((t2End - t2) / Math.max(t3End - t3, 1)).toFixed(1)}x`);
  process.exit(0);
}

main().catch(err => { console.error('测试失败:', err); process.exit(1); });
