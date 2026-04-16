/**
 * 检查已逾期但未创建催收任务的数据
 * 
 * 逾期判断规则：
 * - 挂账客户 (settleMethod = 2): 最大欠款天数 = consumerExpireDay
 * - 现款客户 (settleMethod ≠ 2): 最大欠款天数 = 7 天
 * - 逾期条件: 账龄(当前时间 - workTime) > 最大欠款天数
 * 
 * 催收任务幂等检查：
 * - 已存在 erp_bill_id 对应的催收明细(ar_collection_details)则跳过
 */

import { query } from '../src/db/pool';
import { appQuery } from '../src/db/appPool';

interface ERPDebtRecord {
  billId: string;
  bizOrderStr: string;  // 订单号
  consumerName: string;
  managerUsers: string;
  totalAmount: number;
  leftAmount: number;
  settleMethod: number;
  consumerExpireDay: number;
  billTypeName: string;
  workTime: string;
}

interface MissingTask {
  billId: string;
  bizOrderStr: string;
  consumerName: string;
  managerUsers: string;
  totalAmount: number;
  leftAmount: number;
  settleMethod: number;
  consumerExpireDay: number;
  billTypeName: string;
  workTime: string;
  ageDays: number;
  maxDays: number;
  overdueDays: number;
  settleMethodName: string;
  reason: string;
}

async function checkMissingCollectionTasks() {
  console.log('========================================');
  console.log('检查已逾期但未创建催收任务的数据');
  console.log('========================================\n');

  try {
    // 1. 从ERP查询所有客户欠款明细
    console.log('[1] 从ERP查询客户欠款明细...');
    const erpSql = `SELECT "billId", "bizOrderStr", "consumerName", "managerUsers",
      "totalAmount", "leftAmount", "settleMethod",
      "consumerExpireDay", "billTypeName", "workTime"
      FROM "客户欠款明细" WHERE "leftAmount"::numeric > 0`;
    const erpResult = await query<ERPDebtRecord>(erpSql, []);
    console.log(`    查询到 ${erpResult.rows.length} 条欠款记录\n`);

    // 2. 检查逾期但未创建任务的记录
    console.log('[2] 检查逾期但未创建催收任务的记录...');
    const now = new Date();
    const missingTasks: MissingTask[] = [];
    let overdueCount = 0;
    let hasTaskCount = 0;

    for (const debt of erpResult.rows) {
      const workDate = new Date(debt.workTime);
      const ageDays = Math.floor((now.getTime() - workDate.getTime()) / 86400000);
      const maxDays = Number(debt.settleMethod) === 2 
        ? (Number(debt.consumerExpireDay) || 0) 
        : 7;
      
      // 未逾期，跳过
      if (ageDays <= maxDays) continue;
      
      overdueCount++;
      const overdueDays = ageDays - maxDays;

      // 幂等检查: 是否已存在该billId的催收明细
      const existsResult = await appQuery(
        `SELECT 1 FROM ar_collection_details WHERE erp_bill_id = $1 LIMIT 1`,
        [debt.billId]
      );
      
      if (existsResult.rows.length > 0) {
        hasTaskCount++;
        continue;
      }

      // 已逾期但未创建任务
      missingTasks.push({
        ...debt,
        ageDays,
        maxDays,
        overdueDays,
        settleMethodName: Number(debt.settleMethod) === 2 ? '挂账' : '现款',
        reason: `账龄${ageDays}天 > 最大欠款${maxDays}天，逾期${overdueDays}天`
      });
    }

    // 3. 输出结果
    console.log(`    已逾期欠款: ${overdueCount} 条`);
    console.log(`    已有催收任务: ${hasTaskCount} 条`);
    console.log(`    未创建催收任务: ${missingTasks.length} 条\n`);

    if (missingTasks.length === 0) {
      console.log('✅ 所有逾期欠款都已创建催收任务，无遗漏！\n');
      return;
    }

    // 4. 按客户分组统计
    console.log('[3] 按客户分组统计未创建任务的逾期欠款:');
    const byCustomer = new Map<string, MissingTask[]>();
    for (const task of missingTasks) {
      if (!byCustomer.has(task.consumerName)) {
        byCustomer.set(task.consumerName, []);
      }
      byCustomer.get(task.consumerName)!.push(task);
    }

    // 按金额排序
    const customerStats = Array.from(byCustomer.entries())
      .map(([name, tasks]) => ({
        customer: name,
        count: tasks.length,
        totalAmount: tasks.reduce((s, t) => s + Number(t.leftAmount), 0),
        maxOverdue: Math.max(...tasks.map(t => t.overdueDays)),
        tasks
      }))
      .sort((a, b) => b.totalAmount - a.totalAmount);

    console.log('    +----------------------+--------+------------+----------+');
    console.log('    | 客户名称             | 单据数 | 欠款总额   | 最大逾期 |');
    console.log('    +----------------------+--------+------------+----------+');
    for (const stat of customerStats) {
      const customer = stat.customer.length > 18 
        ? stat.customer.slice(0, 16) + '..' 
        : stat.customer.padEnd(18);
      console.log(`    | ${customer} | ${String(stat.count).padStart(6)} | ${String((stat.totalAmount / 10000).toFixed(2) + '万').padStart(10)} | ${String(stat.maxOverdue + '天').padStart(8)} |`);
    }
    console.log('    +----------------------+--------+------------+----------+\n');

    // 5. 按逾期天数分布统计
    console.log('[4] 按逾期天数分布:');
    const overdueBuckets = {
      '1-7天': 0,
      '8-14天': 0,
      '15-30天': 0,
      '30天以上': 0
    };
    const overdueAmounts = {
      '1-7天': 0,
      '8-14天': 0,
      '15-30天': 0,
      '30天以上': 0
    };
    for (const task of missingTasks) {
      const amount = Number(task.leftAmount);
      if (task.overdueDays <= 7) {
        overdueBuckets['1-7天']++;
        overdueAmounts['1-7天'] += amount;
      } else if (task.overdueDays <= 14) {
        overdueBuckets['8-14天']++;
        overdueAmounts['8-14天'] += amount;
      } else if (task.overdueDays <= 30) {
        overdueBuckets['15-30天']++;
        overdueAmounts['15-30天'] += amount;
      } else {
        overdueBuckets['30天以上']++;
        overdueAmounts['30天以上'] += amount;
      }
    }
    for (const [range, count] of Object.entries(overdueBuckets)) {
      console.log(`    ${range}: ${count} 条，金额 ${(overdueAmounts[range as keyof typeof overdueAmounts] / 10000).toFixed(2)} 万`);
    }
    console.log('');

    // 6. 输出明细（前20条）
    console.log('[5] 缺失任务的明细记录（前20条）:');
    console.log('    +------------------+------------------+------------+----------+----------+----------------------+');
    console.log('    | 订单号           | 客户             | 剩余金额   | 逾期天数 | 结算方式 | 责任人               |');
    console.log('    +------------------+------------------+------------+----------+----------+----------------------+');
    for (const task of missingTasks.slice(0, 20)) {
      const billNo = (task.bizOrderStr || task.billId).slice(0, 16).padEnd(16);
      const customer = task.consumerName.length > 14 
        ? task.consumerName.slice(0, 12) + '..' 
        : task.consumerName.padEnd(14);
      const amount = String((Number(task.leftAmount) / 10000).toFixed(2) + '万').padStart(10);
      const overdue = String(task.overdueDays + '天').padStart(8);
      const settleType = task.settleMethodName.padEnd(8);
      const manager = (task.managerUsers || '-').slice(0, 18).padEnd(18);
      console.log(`    | ${billNo} | ${customer} | ${amount} | ${overdue} | ${settleType} | ${manager} |`);
    }
    console.log('    +------------------+------------------+------------+----------+----------+----------------------+');
    if (missingTasks.length > 20) {
      console.log(`    ... 还有 ${missingTasks.length - 20} 条记录未显示\n`);
    } else {
      console.log('');
    }

    // 7. 汇总
    const totalMissingAmount = missingTasks.reduce((s, t) => s + Number(t.leftAmount), 0);
    console.log('========================================');
    console.log('检查结果汇总:');
    console.log(`  - 发现 ${missingTasks.length} 条已逾期但未创建催收任务的欠款`);
    console.log(`  - 涉及 ${byCustomer.size} 个客户`);
    console.log(`  - 总金额 ${(totalMissingAmount / 10000).toFixed(2)} 万元`);
    console.log('========================================\n');

    // 8. 输出可能的原因分析
    console.log('可能的原因分析:');
    console.log('  1. 定时任务未执行或执行失败');
    console.log('  2. 数据同步延迟（ERP数据刚更新）');
    console.log('  3. 历史数据遗漏（首次同步时未处理）');
    console.log('  4. managerUsers 未匹配到系统用户');
    console.log('\n建议操作:');
    console.log('  手动执行 generateCollectionTasks() 任务生成催收任务\n');

  } catch (error) {
    console.error('检查失败:', error);
    throw error;
  }
}

// 执行检查
checkMissingCollectionTasks()
  .then(() => {
    console.log('检查完成');
    process.exit(0);
  })
  .catch((err) => {
    console.error('检查出错:', err);
    process.exit(1);
  });
