/** @deprecated 已迁移到统一考核模块 services/assessment/，请勿继续使用此文件 */
/**
 * 退货考核 - 规则检查函数
 * 包含5类考核规则的定时检查逻辑
 */

import { appQuery } from '../../db/appPool';
import { RETURN_EXPIRE_INSUFFICIENT_DAYS } from '../../utils/constants';
import {
  PENALTY_RULES,
  type PenaltyType,
  type PenaltyRole,
} from './return-penalty.types';
import { findUserByName, getUsersByRole, upsertPenaltyRecord } from './return-penalty-calculate.utils';

/** 考核计算结果 */
export interface CalculationResult {
  type: PenaltyType;
  processedCount: number;
  createdCount: number;
  updatedCount: number;
}

/**
 * 规则1: 采购确认超时考核
 * 退货单创建后，采购主管未在当天确认规则，每延迟1天考核10元
 * 考核对象：所有 procurement_manager 角色用户
 */
export async function checkProcurementConfirmTimeout(): Promise<CalculationResult> {
  console.log('[ReturnPenalty] 检查采购确认超时考核...');

  const result = await appQuery<{
    id: number;
    return_no: string;
    goods_name: string;
    created_at: Date;
    purchase_price: string;
  }>(
    `SELECT id, return_no, goods_name, created_at, purchase_price
     FROM expiring_return_orders
     WHERE status = 'pending_confirm'
       AND created_at::date < CURRENT_DATE`
  );

  const orders = result.rows;
  if (orders.length === 0) {
    return { type: 'procurement_confirm_timeout', processedCount: 0, createdCount: 0, updatedCount: 0 };
  }

  const managers = await getUsersByRole('procurement_manager');
  if (managers.length === 0) {
    console.warn('[ReturnPenalty] 未找到采购主管角色用户');
    return { type: 'procurement_confirm_timeout', processedCount: orders.length, createdCount: 0, updatedCount: 0 };
  }

  const rule = PENALTY_RULES.procurement_confirm_timeout;
  let createdCount = 0;

  for (const order of orders) {
    const createdAt = new Date(order.created_at);
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const diffTime = today.getTime() - createdAt.getTime();
    const overdueDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));

    if (overdueDays <= 0) continue;

    const penaltyAmount = overdueDays * rule.penaltyPerDay;
    const purchasePrice = parseFloat(order.purchase_price || '0');

    for (const manager of managers) {
      await upsertPenaltyRecord({
        returnOrderId: order.id,
        penaltyType: 'procurement_confirm_timeout',
        penaltyUserId: manager.id,
        penaltyUserName: manager.name,
        penaltyRole: 'procurement_manager',
        baseAmount: purchasePrice,
        penaltyRate: rule.penaltyPerDay,
        overdueDays,
        penaltyAmount,
        penaltyRuleSnapshot: {
          ruleName: rule.name,
          description: rule.description,
          penaltyPerDay: rule.penaltyPerDay,
          createdAt: order.created_at,
        },
      });
      createdCount++;
    }
  }

  console.log(`[ReturnPenalty] 采购确认超时考核: 处理 ${orders.length} 条, 创建 ${createdCount} 条记录`);
  return { type: 'procurement_confirm_timeout', processedCount: orders.length, createdCount, updatedCount: 0 };
}

/**
 * 规则2: 营销未完成销售考核
 * 无法采购退货的商品过期前未清仓，按商品进价考核
 * 考核对象：marketing_manager 字段对应的用户
 */
export async function checkMarketingSaleTimeout(): Promise<CalculationResult> {
  console.log('[ReturnPenalty] 检查营销销售超时考核...');

  const result = await appQuery<{
    id: number;
    return_no: string;
    goods_name: string;
    marketing_manager: string;
    purchase_price: string;
    expire_date: Date;
  }>(
    `SELECT id, return_no, goods_name, marketing_manager, purchase_price, expire_date
     FROM expiring_return_orders
     WHERE status = 'pending_marketing_sale'
       AND expire_date < CURRENT_DATE`
  );

  const orders = result.rows;
  if (orders.length === 0) {
    return { type: 'marketing_sale_timeout', processedCount: 0, createdCount: 0, updatedCount: 0 };
  }

  const rule = PENALTY_RULES.marketing_sale_timeout;
  let createdCount = 0;

  for (const order of orders) {
    if (!order.marketing_manager) {
      console.warn(`[ReturnPenalty] 退货单 ${order.return_no} 无营销师信息，跳过`);
      continue;
    }

    const user = await findUserByName(order.marketing_manager);
    if (!user) {
      console.warn(`[ReturnPenalty] 未找到营销师: ${order.marketing_manager}`);
      continue;
    }

    const purchasePrice = parseFloat(order.purchase_price || '0');
    const penaltyAmount = purchasePrice;

    await upsertPenaltyRecord({
      returnOrderId: order.id,
      penaltyType: 'marketing_sale_timeout',
      penaltyUserId: user.id,
      penaltyUserName: user.name,
      penaltyRole: 'marketing_manager',
      baseAmount: purchasePrice,
      penaltyRate: 0,
      overdueDays: 0,
      penaltyAmount,
      penaltyRuleSnapshot: {
        ruleName: rule.name,
        description: rule.description,
        expireDate: order.expire_date,
        purchasePrice,
      },
    });
    createdCount++;
  }

  console.log(`[ReturnPenalty] 营销销售超时考核: 处理 ${orders.length} 条, 创建 ${createdCount} 条记录`);
  return { type: 'marketing_sale_timeout', processedCount: orders.length, createdCount, updatedCount: 0 };
}

/**
 * 规则3定时补偿: 退货时保质期不足考核
 * 退货时剩余保质期低于15天，按商品进价全额考核营销师
 * 此函数用于定时任务补偿，检查已有但未创建考核的记录
 */
export async function checkReturnExpireInsufficient(): Promise<CalculationResult> {
  console.log('[ReturnPenalty] 检查退货保质期不足考核(定时补偿)...');

  const result = await appQuery<{
    id: number;
    return_no: string;
    goods_name: string;
    marketing_manager: string;
    purchase_price: string;
    days_to_expire_at_return: number;
  }>(
    `SELECT id, return_no, goods_name, marketing_manager, purchase_price, days_to_expire_at_return
     FROM expiring_return_orders
     WHERE days_to_expire_at_return IS NOT NULL
       AND days_to_expire_at_return < ${RETURN_EXPIRE_INSUFFICIENT_DAYS}
       AND NOT EXISTS (
         SELECT 1 FROM return_penalty_records
         WHERE return_order_id = expiring_return_orders.id
           AND penalty_type = 'return_expire_insufficient'
       )`
  );

  const orders = result.rows;
  if (orders.length === 0) {
    return { type: 'return_expire_insufficient', processedCount: 0, createdCount: 0, updatedCount: 0 };
  }

  const rule = PENALTY_RULES.return_expire_insufficient;
  let createdCount = 0;
  let skippedCount = 0;

  for (const order of orders) {
    if (!order.marketing_manager) {
      console.warn(`[ReturnPenalty] 退货单 ${order.return_no} 无营销师信息，跳过规则3考核`);
      skippedCount++;
      continue;
    }

    const user = await findUserByName(order.marketing_manager);
    if (!user) {
      console.warn(`[ReturnPenalty] 未找到营销师用户: ${order.marketing_manager}，跳过退货单 ${order.return_no}`);
      skippedCount++;
      continue;
    }

    const purchasePrice = parseFloat(order.purchase_price || '0');
    const penaltyAmount = purchasePrice;

    await upsertPenaltyRecord({
      returnOrderId: order.id,
      penaltyType: 'return_expire_insufficient',
      penaltyUserId: user.id,
      penaltyUserName: user.name,
      penaltyRole: 'marketing_manager',
      baseAmount: purchasePrice,
      penaltyRate: 0,
      overdueDays: 0,
      penaltyAmount,
      penaltyRuleSnapshot: {
        ruleName: rule.name,
        description: rule.description,
        daysToExpireAtReturn: order.days_to_expire_at_return,
        threshold: RETURN_EXPIRE_INSUFFICIENT_DAYS,
        purchasePrice,
      },
    });
    createdCount++;
  }

  console.log(
    `[ReturnPenalty] 退货保质期不足考核: 处理 ${orders.length} 条, ` +
    `创建 ${createdCount} 条记录, 跳过 ${skippedCount} 条`
  );
  return { type: 'return_expire_insufficient', processedCount: orders.length, createdCount, updatedCount: 0 };
}

/**
 * 规则4: ERP录入超时考核
 * 采购确认后30天内未录入ERP，每延迟1天考核10元
 * 考核对象：所有 procurement_manager 角色用户
 */
export async function checkErpFillTimeout(): Promise<CalculationResult> {
  console.log('[ReturnPenalty] 检查ERP录入超时考核...');

  const result = await appQuery<{
    id: number;
    return_no: string;
    goods_name: string;
    rule_confirmed_at: Date;
    purchase_price: string;
  }>(
    `SELECT id, return_no, goods_name, rule_confirmed_at, purchase_price
     FROM expiring_return_orders
     WHERE status = 'pending_erp_fill'
       AND rule_confirmed_at IS NOT NULL
       AND rule_confirmed_at + INTERVAL '30 days' < NOW()`
  );

  const orders = result.rows;
  if (orders.length === 0) {
    return { type: 'erp_fill_timeout', processedCount: 0, createdCount: 0, updatedCount: 0 };
  }

  const managers = await getUsersByRole('procurement_manager');
  if (managers.length === 0) {
    console.warn('[ReturnPenalty] 未找到采购主管角色用户');
    return { type: 'erp_fill_timeout', processedCount: orders.length, createdCount: 0, updatedCount: 0 };
  }

  const rule = PENALTY_RULES.erp_fill_timeout;
  let createdCount = 0;

  for (const order of orders) {
    const confirmedAt = new Date(order.rule_confirmed_at);
    const deadline = new Date(confirmedAt);
    deadline.setDate(deadline.getDate() + 30);

    const diffTime = Date.now() - deadline.getTime();
    const overdueDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));

    if (overdueDays <= 0) continue;

    const penaltyAmount = overdueDays * rule.penaltyPerDay;
    const purchasePrice = parseFloat(order.purchase_price || '0');

    for (const manager of managers) {
      await upsertPenaltyRecord({
        returnOrderId: order.id,
        penaltyType: 'erp_fill_timeout',
        penaltyUserId: manager.id,
        penaltyUserName: manager.name,
        penaltyRole: 'procurement_manager',
        baseAmount: purchasePrice,
        penaltyRate: rule.penaltyPerDay,
        overdueDays,
        penaltyAmount,
        penaltyRuleSnapshot: {
          ruleName: rule.name,
          description: rule.description,
          penaltyPerDay: rule.penaltyPerDay,
          deadlineDays: rule.deadlineDays,
          ruleConfirmedAt: order.rule_confirmed_at,
        },
      });
      createdCount++;
    }
  }

  console.log(`[ReturnPenalty] ERP录入超时考核: 处理 ${orders.length} 条, 创建 ${createdCount} 条记录`);
  return { type: 'erp_fill_timeout', processedCount: orders.length, createdCount, updatedCount: 0 };
}

/**
 * 规则5: 仓储执行超时考核
 * ERP录入后7天内未执行退货，每延迟1天，每条商品记录考核10元
 * 考核对象：所有 warehouse_manager, warehouse_operator 角色用户
 */
export async function checkWarehouseExecuteTimeout(): Promise<CalculationResult> {
  console.log('[ReturnPenalty] 检查仓储执行超时考核...');

  const result = await appQuery<{
    id: number;
    return_no: string;
    goods_name: string;
    erp_filled_at: Date;
    purchase_price: string;
  }>(
    `SELECT id, return_no, goods_name, erp_filled_at, purchase_price
     FROM expiring_return_orders
     WHERE status = 'pending_warehouse_execute'
       AND erp_filled_at IS NOT NULL
       AND erp_filled_at + INTERVAL '7 days' < NOW()`
  );

  const orders = result.rows;
  if (orders.length === 0) {
    return { type: 'warehouse_execute_timeout', processedCount: 0, createdCount: 0, updatedCount: 0 };
  }

  const WAREHOUSE_EXECUTION_ROLES = [
    'warehouse_manager',
    'warehouse_operator',
  ] as const;

  const roleUsersMap = new Map<string, { id: number; name: string }[]>();
  for (const roleCode of WAREHOUSE_EXECUTION_ROLES) {
    const users = await getUsersByRole(roleCode);
    if (users.length > 0) {
      roleUsersMap.set(roleCode, users);
    } else {
      console.warn(`[ReturnPenalty] 角色 ${roleCode} 无用户`);
    }
  }

  if (roleUsersMap.size === 0) {
    console.warn('[ReturnPenalty] 未找到任何仓储执行相关角色用户');
    return { type: 'warehouse_execute_timeout', processedCount: orders.length, createdCount: 0, updatedCount: 0 };
  }

  const rule = PENALTY_RULES.warehouse_execute_timeout;
  let createdCount = 0;

  for (const order of orders) {
    const erpFilledAt = new Date(order.erp_filled_at);
    const deadline = new Date(erpFilledAt);
    deadline.setDate(deadline.getDate() + 7);

    const diffTime = Date.now() - deadline.getTime();
    const overdueDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));

    if (overdueDays <= 0) continue;

    const penaltyAmount = overdueDays * rule.penaltyPerDay;
    const purchasePrice = parseFloat(order.purchase_price || '0');

    for (const roleCode of WAREHOUSE_EXECUTION_ROLES) {
      const users = roleUsersMap.get(roleCode) || [];

      for (const user of users) {
        await upsertPenaltyRecord({
          returnOrderId: order.id,
          penaltyType: 'warehouse_execute_timeout',
          penaltyUserId: user.id,
          penaltyUserName: user.name,
          penaltyRole: roleCode as PenaltyRole,
          baseAmount: purchasePrice,
          penaltyRate: rule.penaltyPerDay,
          overdueDays,
          penaltyAmount,
          penaltyRuleSnapshot: {
            ruleName: rule.name,
            description: rule.description,
            penaltyPerDay: rule.penaltyPerDay,
            deadlineDays: rule.deadlineDays,
            erpFilledAt: order.erp_filled_at,
            calculationNote: '每条商品记录按10元/天计算',
          },
        });
        createdCount++;
      }
    }
  }

  console.log(
    `[ReturnPenalty] 仓储执行超时考核: 处理 ${orders.length} 条退货单, ` +
    `创建 ${createdCount} 条考核记录 (涉及 ${WAREHOUSE_EXECUTION_ROLES.length} 个角色)`
  );
  return { type: 'warehouse_execute_timeout', processedCount: orders.length, createdCount, updatedCount: 0 };
}
