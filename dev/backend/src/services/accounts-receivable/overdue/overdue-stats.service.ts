/**
 * 逾期统计服务
 * 负责逾期数据的统计和快照保存
 */

import { appQuery } from '../../../db/appPool';
import { config } from '../../../config';
import type {
  OverdueStatsResponse,
  OverdueLevel,
  FlowNodeType,
} from '../ar.types';

/**
 * 获取催收日期筛选 SQL 片段
 * 当配置了 AR_COLLECTION_START_DATE 时，筛选 work_time >= 配置日期的记录
 * work_time 为 NULL 的记录默认包含（兼容历史数据）
 */
function getCollectionDateFilter(): { clause: string; params: string[] } {
  const startDate = config.arCollection?.startDate;
  if (!startDate) {
    return { clause: '', params: [] };
  }
  return {
    clause: `AND (work_time IS NULL OR work_time >= $1)`,
    params: [startDate],
  };
}

/**
 * 获取逾期统计概览
 * 查询逾期数据并按客户维度聚合统计
 * @returns 逾期统计响应数据
 */
export async function getOverdueStats(): Promise<OverdueStatsResponse> {
  try {
    const dateFilter = getCollectionDateFilter();

    // 1. 获取逾期客户基础数据（按客户维度聚合）
    const overdueCustomersSql = `
      SELECT
        consumer_name,
        overdue_level,
        COUNT(*) as bill_count,
        SUM(left_amount) as total_amount,
        MAX(CURRENT_DATE - due_date::date) as max_overdue_days,
        AVG(CURRENT_DATE - due_date::date) as avg_overdue_days
      FROM ar_receivables
      WHERE due_date IS NOT NULL
        AND due_date < CURRENT_DATE
        AND left_amount > 0
        ${dateFilter.clause}
      GROUP BY consumer_name, overdue_level
    `;

    const overdueCustomersResult = await appQuery<{
      consumer_name: string;
      overdue_level: OverdueLevel;
      bill_count: string;
      total_amount: string;
      max_overdue_days: string;
      avg_overdue_days: string;
    }>(overdueCustomersSql, dateFilter.params);

    // 2. 统计各等级分布
    const levelDistribution = {
      light: { customerCount: 0, amount: 0, billCount: 0 },
      medium: { customerCount: 0, amount: 0, billCount: 0 },
      severe: { customerCount: 0, amount: 0, billCount: 0 },
    };

    const customerSet = new Set<string>();
    let totalOverdueAmount = 0;
    let totalBillCount = 0;
    let totalOverdueDays = 0;
    let customerCount = 0;

    overdueCustomersResult.rows.forEach((row) => {
      const level = row.overdue_level as OverdueLevel;
      const amount = parseFloat(row.total_amount) || 0;
      const billCount = parseInt(row.bill_count, 10) || 0;
      const avgDays = parseFloat(row.avg_overdue_days) || 0;

      // 累加到对应等级
      if (levelDistribution[level]) {
        levelDistribution[level].customerCount++;
        levelDistribution[level].amount += amount;
        levelDistribution[level].billCount += billCount;
      }

      // 去重统计客户数
      if (!customerSet.has(row.consumer_name)) {
        customerSet.add(row.consumer_name);
        customerCount++;
      }

      totalOverdueAmount += amount;
      totalBillCount += billCount;
      totalOverdueDays += avgDays * billCount;
    });

    // 3. 获取流程状态统计
    const flowStatusSql = `
      SELECT
        flow_status,
        COUNT(*) as count
      FROM ar_customer_collection_tasks
      WHERE flow_status IS NOT NULL
      GROUP BY flow_status
    `;

    const flowStatusResult = await appQuery<{ flow_status: string; count: string }>(flowStatusSql);

    const flowStatus = {
      preprocessingPending: 0,
      assignmentPending: 0,
      collecting: 0,
      reviewPending: 0,
    };

    flowStatusResult.rows.forEach((row) => {
      switch (row.flow_status) {
        case 'preprocessing':
          flowStatus.preprocessingPending = parseInt(row.count, 10) || 0;
          break;
        case 'assigned':
          flowStatus.assignmentPending = parseInt(row.count, 10) || 0;
          break;
        case 'collecting':
          flowStatus.collecting = parseInt(row.count, 10) || 0;
          break;
        case 'completed':
          flowStatus.reviewPending = parseInt(row.count, 10) || 0;
          break;
      }
    });

    // 4. 获取超时预警数量
    const timeoutWarningSql = `
      SELECT COUNT(*) as count
      FROM ar_flow_nodes
      WHERE is_timeout = true
        AND node_status NOT IN ('completed', 'skipped')
    `;

    const timeoutWarningResult = await appQuery<{ count: string }>(timeoutWarningSql);
    const timeoutWarningCount = parseInt(timeoutWarningResult.rows[0]?.count || '0', 10);

    // 计算平均逾期天数
    const avgOverdueDays = totalBillCount > 0
      ? parseFloat((totalOverdueDays / totalBillCount).toFixed(2))
      : 0;

    return {
      totalCustomerCount: customerCount,
      totalOverdueAmount: parseFloat(totalOverdueAmount.toFixed(2)),
      totalBillCount,
      avgOverdueDays,
      timeoutWarningCount,
      levelDistribution: {
        light: {
          customerCount: levelDistribution.light.customerCount,
          amount: parseFloat(levelDistribution.light.amount.toFixed(2)),
          billCount: levelDistribution.light.billCount,
        },
        medium: {
          customerCount: levelDistribution.medium.customerCount,
          amount: parseFloat(levelDistribution.medium.amount.toFixed(2)),
          billCount: levelDistribution.medium.billCount,
        },
        severe: {
          customerCount: levelDistribution.severe.customerCount,
          amount: parseFloat(levelDistribution.severe.amount.toFixed(2)),
          billCount: levelDistribution.severe.billCount,
        },
      },
      flowStatus,
    };
  } catch (error) {
    console.error('[OverdueStats] 获取逾期统计失败:', error);
    throw new Error('获取逾期统计失败');
  }
}

/**
 * 保存每日逾期统计快照
 * 将当前统计数据保存到 ar_overdue_stats 表
 */
export async function saveOverdueSnapshot(): Promise<void> {
  try {
    const stats = await getOverdueStats();
    const today = new Date().toISOString().split('T')[0];

    const sql = `
      INSERT INTO ar_overdue_stats (
        stat_date,
        total_customer_count,
        total_overdue_amount,
        total_bill_count,
        light_customer_count,
        light_amount,
        medium_customer_count,
        medium_amount,
        severe_customer_count,
        severe_amount,
        preprocessing_pending_count,
        assignment_pending_count,
        collection_pending_count
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
      ON CONFLICT (stat_date) DO UPDATE SET
        total_customer_count = EXCLUDED.total_customer_count,
        total_overdue_amount = EXCLUDED.total_overdue_amount,
        total_bill_count = EXCLUDED.total_bill_count,
        light_customer_count = EXCLUDED.light_customer_count,
        light_amount = EXCLUDED.light_amount,
        medium_customer_count = EXCLUDED.medium_customer_count,
        medium_amount = EXCLUDED.medium_amount,
        severe_customer_count = EXCLUDED.severe_customer_count,
        severe_amount = EXCLUDED.severe_amount,
        preprocessing_pending_count = EXCLUDED.preprocessing_pending_count,
        assignment_pending_count = EXCLUDED.assignment_pending_count,
        collection_pending_count = EXCLUDED.collection_pending_count
    `;

    await appQuery(sql, [
      today,
      stats.totalCustomerCount,
      stats.totalOverdueAmount,
      stats.totalBillCount,
      stats.levelDistribution.light.customerCount,
      stats.levelDistribution.light.amount,
      stats.levelDistribution.medium.customerCount,
      stats.levelDistribution.medium.amount,
      stats.levelDistribution.severe.customerCount,
      stats.levelDistribution.severe.amount,
      stats.flowStatus.preprocessingPending,
      stats.flowStatus.assignmentPending,
      stats.flowStatus.collecting,
    ]);

    console.log(`[OverdueStats] 已保存 ${today} 的逾期统计快照:`, {
      totalCustomerCount: stats.totalCustomerCount,
      totalOverdueAmount: stats.totalOverdueAmount,
    });
  } catch (error) {
    console.error('[OverdueStats] 保存逾期统计快照失败:', error);
    throw new Error('保存逾期统计快照失败');
  }
}

/**
 * 获取历史逾期统计快照
 * @param startDate 开始日期
 * @param endDate 结束日期
 * @returns 统计快照列表
 */
export async function getOverdueSnapshots(
  startDate: string,
  endDate: string
): Promise<
  Array<{
    statDate: Date;
    totalCustomerCount: number;
    totalOverdueAmount: number;
    totalBillCount: number;
    lightCustomerCount: number;
    mediumCustomerCount: number;
    severeCustomerCount: number;
  }>
> {
  try {
    const sql = `
      SELECT
        stat_date,
        total_customer_count,
        total_overdue_amount,
        total_bill_count,
        light_customer_count,
        medium_customer_count,
        severe_customer_count
      FROM ar_overdue_stats
      WHERE stat_date >= $1 AND stat_date <= $2
      ORDER BY stat_date ASC
    `;

    const result = await appQuery<{
      stat_date: Date;
      total_customer_count: number;
      total_overdue_amount: string;
      total_bill_count: number;
      light_customer_count: number;
      medium_customer_count: number;
      severe_customer_count: number;
    }>(sql, [startDate, endDate]);

    return result.rows.map((row) => ({
      statDate: row.stat_date,
      totalCustomerCount: row.total_customer_count,
      totalOverdueAmount: parseFloat(row.total_overdue_amount) || 0,
      totalBillCount: row.total_bill_count,
      lightCustomerCount: row.light_customer_count,
      mediumCustomerCount: row.medium_customer_count,
      severeCustomerCount: row.severe_customer_count,
    }));
  } catch (error) {
    console.error('[OverdueStats] 获取历史逾期统计失败:', error);
    throw new Error('获取历史逾期统计失败');
  }
}
