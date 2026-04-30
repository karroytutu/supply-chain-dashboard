/** @deprecated 已迁移到统一考核模块 services/assessment/，请勿继续使用此文件 */
/**
 * 退货考核计算服务
 * 入口函数，协调各规则检查
 */

import { RETURN_EXPIRE_INSUFFICIENT_DAYS } from '../../utils/constants';
import { PENALTY_RULES } from './return-penalty.types';
import { findUserByName, upsertPenaltyRecord, getPurchasePrice, getUsersByRole } from './return-penalty-calculate.utils';
import {
  checkProcurementConfirmTimeout,
  checkMarketingSaleTimeout,
  checkReturnExpireInsufficient,
  checkErpFillTimeout,
  checkWarehouseExecuteTimeout,
  type CalculationResult,
} from './return-penalty-rules';

/**
 * 规则3实时触发: 退货时保质期不足考核
 * 退货时剩余保质期低于15天，按商品进价考核营销师
 * 在批量确认时调用此函数
 */
export async function createReturnExpireInsufficientPenalty(order: {
  id: number;
  returnNo: string;
  goodsName: string;
  marketingManager: string | null;
  purchasePrice: number;
  daysToExpireAtReturn: number | null;
}): Promise<void> {
  if (!order.daysToExpireAtReturn || order.daysToExpireAtReturn >= RETURN_EXPIRE_INSUFFICIENT_DAYS) {
    return;
  }

  console.log(`[ReturnPenalty] 创建退货保质期不足考核: ${order.returnNo}, 剩余 ${order.daysToExpireAtReturn} 天`);

  if (!order.marketingManager) {
    console.warn(`[ReturnPenalty] 退货单 ${order.returnNo} 无营销师信息，跳过规则3考核`);
    return;
  }

  const user = await findUserByName(order.marketingManager);
  if (!user) {
    console.warn(`[ReturnPenalty] 未找到营销师: ${order.marketingManager}`);
    return;
  }

  const rule = PENALTY_RULES.return_expire_insufficient;
  const penaltyAmount = order.purchasePrice;

  await upsertPenaltyRecord({
    returnOrderId: order.id,
    penaltyType: 'return_expire_insufficient',
    penaltyUserId: user.id,
    penaltyUserName: user.name,
    penaltyRole: 'marketing_manager',
    baseAmount: order.purchasePrice,
    penaltyRate: 0,
    overdueDays: 0,
    penaltyAmount,
    penaltyRuleSnapshot: {
      ruleName: rule.name,
      description: rule.description,
      daysToExpireAtReturn: order.daysToExpireAtReturn,
      threshold: RETURN_EXPIRE_INSUFFICIENT_DAYS,
      purchasePrice: order.purchasePrice,
    },
  });

  console.log(`[ReturnPenalty] 规则3考核记录已创建: 退货单 ${order.returnNo}, 营销师 ${user.name}, 金额 ${penaltyAmount}`);
}

/**
 * 执行所有考核计算
 * 定时任务入口函数
 */
export async function calculateReturnPenalties(): Promise<CalculationResult[]> {
  console.log('[ReturnPenalty] 开始执行退货考核计算...');

  const results: CalculationResult[] = [];

  try {
    results.push(await checkProcurementConfirmTimeout());   // 规则1
    results.push(await checkMarketingSaleTimeout());        // 规则2
    results.push(await checkReturnExpireInsufficient());    // 规则3 (定时补偿)
    results.push(await checkErpFillTimeout());              // 规则4
    results.push(await checkWarehouseExecuteTimeout());     // 规则5

    const totalCreated = results.reduce((sum, r) => sum + r.createdCount, 0);
    console.log(`[ReturnPenalty] 考核计算完成，共创建 ${totalCreated} 条考核记录`);
  } catch (error) {
    console.error('[ReturnPenalty] 考核计算失败:', error);
    throw error;
  }

  return results;
}

// 导出辅助函数供其他模块使用
export { getPurchasePrice, findUserByName, getUsersByRole };
