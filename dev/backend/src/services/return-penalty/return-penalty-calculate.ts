/**
 * 退货考核计算服务
 * 实现5类考核规则的自动化计算
 */

import { appQuery } from '../../db/appPool';
import { query } from '../../db/pool';
import {
  PENALTY_RULES,
  PENALTY_TYPE_NAMES,
  type PenaltyType,
  type PenaltyRole,
  type CreatePenaltyParams,
} from './return-penalty.types';

/** 考核计算结果 */
interface CalculationResult {
  type: PenaltyType;
  processedCount: number;
  createdCount: number;
  updatedCount: number;
}

/**
 * 获取商品平均进价
 * 从实时库存表获取 baseCostPrice 的加权平均值
 */
async function getPurchasePrice(goodsName: string): Promise<number> {
  try {
    const result = await query<{
      avg_price: string;
    }>(
      `SELECT
        SUM(r."baseCostPrice" * r."availableBaseQuantity") /
        NULLIF(SUM(r."availableBaseQuantity"), 0) as avg_price
       FROM "实时库存表" r
       WHERE r."goodsName" = $1`,
      [goodsName]
    );

    const avgPrice = parseFloat(result.rows[0]?.avg_price || '0');
    return avgPrice > 0 ? avgPrice : 0;
  } catch (error) {
    console.error('[ReturnPenalty] 获取商品进价失败:', goodsName, error);
    return 0;
  }
}

/**
 * 根据姓名查找用户
 */
async function findUserByName(name: string): Promise<{ id: number; name: string } | null> {
  if (!name) return null;

  const result = await appQuery<{ id: number; name: string }>(
    'SELECT id, name FROM users WHERE name = $1 LIMIT 1',
    [name]
  );

  return result.rows[0] || null;
}

/**
 * 根据角色获取所有用户
 */
async function getUsersByRole(roleCode: string): Promise<{ id: number; name: string }[]> {
  const result = await appQuery<{ id: number; name: string }>(
    `SELECT u.id, u.name
     FROM users u
     JOIN user_roles ur ON u.id = ur.user_id
     JOIN roles r ON ur.role_id = r.id
     WHERE r.code = $1`,
    [roleCode]
  );

  return result.rows;
}

/**
 * 创建或更新考核记录
 */
async function upsertPenaltyRecord(params: CreatePenaltyParams): Promise<void> {
  const {
    returnOrderId,
    penaltyType,
    penaltyUserId,
    penaltyUserName,
    penaltyRole,
    baseAmount,
    penaltyRate,
    overdueDays,
    penaltyAmount,
    penaltyRuleSnapshot,
  } = params;

  await appQuery(
    `INSERT INTO return_penalty_records (
      return_order_id, penalty_type, penalty_user_id, penalty_user_name,
      penalty_role, base_amount, penalty_rate, overdue_days, penalty_amount,
      penalty_rule_snapshot, calculated_at, status
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW(), 'pending')
    ON CONFLICT (return_order_id, penalty_type, penalty_user_id)
    DO UPDATE SET
      penalty_user_id = EXCLUDED.penalty_user_id,
      penalty_user_name = EXCLUDED.penalty_user_name,
      base_amount = EXCLUDED.base_amount,
      penalty_rate = EXCLUDED.penalty_rate,
      overdue_days = EXCLUDED.overdue_days,
      penalty_amount = EXCLUDED.penalty_amount,
      penalty_rule_snapshot = EXCLUDED.penalty_rule_snapshot,
      calculated_at = NOW(),
      updated_at = NOW()
    WHERE return_penalty_records.status = 'pending'`,
    [
      returnOrderId,
      penaltyType,
      penaltyUserId,
      penaltyUserName,
      penaltyRole,
      baseAmount,
      penaltyRate,
      overdueDays,
      penaltyAmount,
      JSON.stringify(penaltyRuleSnapshot || {}),
    ]
  );
}

/**
 * 规则1: 采购确认超时考核
 * 退货单创建后，采购主管未在当天确认规则，每延迟1天考核10元
 * 考核对象：所有 procurement_manager 角色用户
 */
async function checkProcurementConfirmTimeout(): Promise<CalculationResult> {
  console.log('[ReturnPenalty] 检查采购确认超时考核...');

  // 查询待确认且创建时间早于今天的退货单
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

  // 获取所有采购主管
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

    // 计算超时天数
    const diffTime = today.getTime() - createdAt.getTime();
    const overdueDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));

    if (overdueDays <= 0) continue;

    const penaltyAmount = overdueDays * rule.penaltyPerDay;
    const purchasePrice = parseFloat(order.purchase_price || '0');

    // 为每个采购主管创建考核记录
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
async function checkMarketingSaleTimeout(): Promise<CalculationResult> {
  console.log('[ReturnPenalty] 检查营销销售超时考核...');

  // 查询待营销销售且已过期的退货单
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

    // 查找营销师用户
    const user = await findUserByName(order.marketing_manager);
    if (!user) {
      console.warn(`[ReturnPenalty] 未找到营销师: ${order.marketing_manager}`);
      continue;
    }

    const purchasePrice = parseFloat(order.purchase_price || '0');
    const penaltyAmount = purchasePrice; // 全额考核

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
 * 规则3: 退货时保质期不足考核（实时触发）
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
  // 检查是否低于15天
  if (!order.daysToExpireAtReturn || order.daysToExpireAtReturn >= 15) {
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
  const penaltyAmount = order.purchasePrice; // 全额考核

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
      threshold: 15,
      purchasePrice: order.purchasePrice,
    },
  });

  console.log(`[ReturnPenalty] 规则3考核记录已创建: 退货单 ${order.returnNo}, 营销师 ${user.name}, 金额 ${penaltyAmount}`);
}

/**
 * 规则4: ERP录入超时考核
 * 采购确认后30天内未录入ERP，每延迟1天考核10元
 * 考核对象：所有 procurement_manager 角色用户
 */
async function checkErpFillTimeout(): Promise<CalculationResult> {
  console.log('[ReturnPenalty] 检查ERP录入超时考核...');

  // 查询待填ERP且确认时间超过30天的退货单
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

  // 获取所有采购主管
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

    // 计算超时天数
    const diffTime = Date.now() - deadline.getTime();
    const overdueDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));

    if (overdueDays <= 0) continue;

    const penaltyAmount = overdueDays * rule.penaltyPerDay;
    const purchasePrice = parseFloat(order.purchase_price || '0');

    // 为每个采购主管创建考核记录
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
 * 考核对象：所有 warehouse_manager, warehouse_keeper, logistics_manager 角色用户
 */
async function checkWarehouseExecuteTimeout(): Promise<CalculationResult> {
  console.log('[ReturnPenalty] 检查仓储执行超时考核...');

  // 查询待仓储执行且ERP填写时间超过7天的退货单
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

  // 定义仓储执行相关考核角色（仓储主管和库管员）
  const WAREHOUSE_EXECUTION_ROLES = [
    'warehouse_manager',
    'warehouse_operator',
  ] as const;

  // 获取所有相关角色的用户
  const roleUsersMap = new Map<string, { id: number; name: string }[]>();
  for (const roleCode of WAREHOUSE_EXECUTION_ROLES) {
    const users = await getUsersByRole(roleCode);
    if (users.length > 0) {
      roleUsersMap.set(roleCode, users);
    } else {
      console.warn(`[ReturnPenalty] 角色角色 ${roleCode} 无用户`);
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

    // 计算超时天数
    const diffTime = Date.now() - deadline.getTime();
    const overdueDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));

    if (overdueDays <= 0) continue;

    const penaltyAmount = overdueDays * rule.penaltyPerDay;
    const purchasePrice = parseFloat(order.purchase_price || '0');

    // 为每个角色的每个用户创建考核记录
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

/**
 * 规则3定时检查: 退货时保质期不足考核
 * 退货时剩余保质期低于15天，按商品进价全额考核营销师
 * 此函数用于定时任务补偿，检查已有但未创建考核的记录
 */
async function checkReturnExpireInsufficient(): Promise<CalculationResult> {
  console.log('[ReturnPenalty] 检查退货保质期不足考核(定时补偿)...');

  // 查询退货时保质期不足15天且未创建考核记录的退货单
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
       AND days_to_expire_at_return < 15
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

    // 查找营销师用户
    const user = await findUserByName(order.marketing_manager);
    if (!user) {
      console.warn(`[ReturnPenalty] 未找到营销师用户: ${order.marketing_manager}，跳过退货单 ${order.return_no}`);
      skippedCount++;
      continue;
    }

    const purchasePrice = parseFloat(order.purchase_price || '0');
    const penaltyAmount = purchasePrice; // 全额考核

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
        threshold: 15,
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
 * 执行所有考核计算
 * 定时任务入口函数
 */
export async function calculateReturnPenalties(): Promise<CalculationResult[]> {
  console.log('[ReturnPenalty] 开始执行退货考核计算...');

  const results: CalculationResult[] = [];

  try {
    // 依次执行所有考核规则检查（按规则编号顺序）
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
