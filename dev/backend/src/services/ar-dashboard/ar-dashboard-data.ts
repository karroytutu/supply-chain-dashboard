/**
 * 应收看板 - 共享数据获取层
 * 一次获取所有数据源，避免各板块重复调用 ERP API
 * 使用 Promise.allSettled 各数据源独立容错
 */
import { createLogger } from '../../utils/logger';
const log = createLogger('ArDashboard');

import { appQuery } from '../../db/appPool';
import { getEnrichedNonHoardDebts } from '../erp-debt/erp-debt-enrichment.service';
import { getUpcomingWarnings } from '../ar-collection/ar-warning.query';
import { fetchSalesDetails } from '../erp-client/erp-sales-detail.service';
import type { DashboardContext, OaCollectionInstanceRow } from './ar-dashboard.types';
import type { EnrichedDebtRecord } from '../erp-debt/erp-debt.types';
import type { UpcomingWarningDetail } from '../ar-collection/ar-warning.query';

// ============================================
// 主入口
// ============================================

/**
 * 构建看板共享数据上下文
 * 并行获取数据源，任一失败不影响其他
 * DSO 复用已获取的 enrichedDebts，避免重复 ERP 调用
 */
export async function buildDashboardContext(): Promise<DashboardContext> {
  const now = new Date();
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 86400000);

  const [debtsResult, oaResult, warningsResult, salesResult] = await Promise.allSettled([
    getEnrichedNonHoardDebts(now),
    fetchCollectionOaInstances(),
    getUpcomingWarnings({ pageSize: 9999 }).then(r => r.details),
    fetchSalesDetails(thirtyDaysAgo.toISOString().slice(0, 10), now.toISOString().slice(0, 10)),
  ]);

  const enrichedDebts = settleOrEmpty<EnrichedDebtRecord[]>(debtsResult, 'ERP欠款数据');
  const oaInstances = settleOrEmpty<OaCollectionInstanceRow[]>(oaResult, 'OA催收实例');
  const upcomingWarnings = settleOrEmpty<UpcomingWarningDetail[]>(warningsResult, '即将逾期预警');

  // DSO 复用已获取的 enrichedDebts，不再重复调用 getEnrichedNonHoardDebts
  const dsoValue = (debtsResult.status === 'fulfilled' && salesResult.status === 'fulfilled')
    ? computeDso(enrichedDebts, salesResult.value)
    : null;

  return { enrichedDebts, oaInstances, upcomingWarnings, dsoValue };
}

// ============================================
// OA 催收实例查询
// ============================================

/**
 * 查询所有活跃催收 OA 实例 + 当前节点信息
 * 管道节点分组的核心数据源
 */
export async function fetchCollectionOaInstances(): Promise<OaCollectionInstanceRow[]> {
  const result = await appQuery<OaCollectionInstanceRow>(
    `SELECT i.id, i.status, i.form_data, i.current_node_order,
            n.role_code, n.node_name, n.status as node_status
     FROM oa_approval_instances i
     JOIN oa_form_types ft ON i.form_type_id = ft.id
     LEFT JOIN oa_approval_nodes n ON n.instance_id = i.id
       AND n.node_order = i.current_node_order
     WHERE ft.code = 'ar_collection'
       AND i.status IN ('pending', 'processing')`
  );
  return result.rows;
}

// ============================================
// DSO 计算
// ============================================

/**
 * 计算 DSO（应收周转天数）
 * DSO = 应收总额 / 日均销售额（近30天）
 * 复用已获取的 enrichedDebts，避免重复 ERP 调用
 */
function computeDso(
  enrichedDebts: EnrichedDebtRecord[],
  sales: Awaited<ReturnType<typeof fetchSalesDetails>>
): number | null {
  if (sales.length === 0) return null;

  const totalSales = sales.reduce((sum, s) => {
    const amount = parseFloat(s.financeSalesAmount) || 0;
    return sum + amount;
  }, 0);

  if (totalSales <= 0) return null;

  const totalReceivable = enrichedDebts.reduce((sum, d) => sum + Number(d.leftAmount), 0);
  const dailyAvgSales = totalSales / 30;
  return Math.round(totalReceivable / dailyAvgSales);
}

// ============================================
// 工具函数
// ============================================

/** Promise.allSettled 结果解包，失败时记录日志并返回空数组 */
function settleOrEmpty<T extends unknown[]>(
  result: PromiseSettledResult<T>,
  label: string
): T extends (infer U)[] ? U[] : never {
  if (result.status === 'fulfilled') return result.value as any;
  log.warn(`获取${label}失败，降级为空: ${result.reason}`);
  return [] as any;
}
