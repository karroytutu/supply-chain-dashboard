/**
 * 退货考核规则实现（5条规则）
 * 从 return-penalty-rules.ts 迁移到统一规则框架
 *
 * 规则说明：
 * 1. procurement_confirm_timeout - 采购确认超时：10元/天/SKU
 * 2. marketing_sales_timeout - 营销销售超时：按进价全额
 * 3. return_expire_insufficient - 退货时保质期不足：按进价全额
 * 4. erp_entry_timeout - ERP录入超时：10元/天/SKU
 * 5. warehouse_execute_timeout - 仓储执行超时：10元/天/SKU
 */

import {
  registerAssessmentRule,
  DEFAULT_ALLOWED_TRANSITIONS,
  DEFAULT_STATUS_LABELS,
} from '../assessment.rules';
import type {
  CalculationContext,
  CalculationResult,
  AssessmentRecordRow,
  NotificationContent,
  AssessmentRole,
} from '../assessment.types';
import { getUsersByRole, findUserByName } from '../utils';
import { RETURN_EXPIRE_INSUFFICIENT_DAYS } from '../../../utils/constants';
import { appQuery } from '../../../db/appPool';

// ==================== 退货考核规则配置 ====================

const RETURN_PENALTY_PER_DAY = 10;
const ERP_FILL_DEADLINE_DAYS = 30;
const WAREHOUSE_EXECUTE_DEADLINE_DAYS = 7;

// ==================== 通知构建 ====================

/**
 * 构建退货考核通知内容
 */
function buildReturnNotification(
  records: AssessmentRecordRow[],
  role: string
): NotificationContent {
  const totalAmount = records.reduce((sum, r) => sum + parseFloat(r.penalty_amount || '0'), 0);

  const tableRows = records
    .map(r => {
      return `| ${r.source_no || '-'} | ${r.source_name || '-'} | ${r.overdue_days || '-'} | ¥${parseFloat(r.penalty_amount).toFixed(2)} |`;
    })
    .join('\n');

  const markdown = `### 退货考核通知

您有 ${records.length} 条退货考核记录：

| 退货单号 | 商品名称 | 超时天数 | 考核金额 |
|----------|----------|----------|----------|
${tableRows}

> 本次考核合计：¥${totalAmount.toFixed(2)}

请及时处理相关退货任务，避免更多考核。

---
推送时间：${new Date().toLocaleString('zh-CN')}`;

  return {
    title: `【退货考核】您有 ${records.length} 条新增考核记录`,
    markdown,
  };
}

// ==================== 规则1: 采购确认超时 ====================

registerAssessmentRule({
  category: 'return_order',
  ruleType: 'procurement_confirm_timeout',
  name: '采购确认超时考核',
  description: '退货单创建后，采购主管未在当天确认规则，超时期间按10元/天/SKU累计考核',
  triggerMode: 'scheduled',
  calculationModel: 'per_day',
  allowedTransitions: DEFAULT_ALLOWED_TRANSITIONS,
  statusLabels: DEFAULT_STATUS_LABELS,
  sourceType: 'expiring_return_order',
  sourceLabel: '退货单',

  calculate: async (_ctx: CalculationContext): Promise<CalculationResult[]> => {
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

    if (result.rows.length === 0) return [];

    const managers = await getUsersByRole('procurement_manager');
    if (managers.length === 0) return [];

    const results: CalculationResult[] = [];
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    for (const order of result.rows) {
      const createdAt = new Date(order.created_at);
      const diffTime = today.getTime() - createdAt.getTime();
      const overdueDays = Math.floor(diffTime / 86400000);
      if (overdueDays <= 0) continue;

      const penaltyAmount = overdueDays * RETURN_PENALTY_PER_DAY;
      const purchasePrice = parseFloat(order.purchase_price || '0');

      for (const manager of managers) {
        results.push({
          category: 'return_order',
          rule_type: 'procurement_confirm_timeout',
          source_type: 'expiring_return_order',
          source_id: order.id,
          source_no: order.return_no,
          source_name: order.goods_name,
          assessment_user_id: manager.id,
          assessment_user_name: manager.name,
          assessment_role: 'procurement_manager',
          base_amount: purchasePrice,
          penalty_rate: RETURN_PENALTY_PER_DAY,
          overdue_days: overdueDays,
          penalty_amount: penaltyAmount,
          rule_snapshot: {
            ruleName: '采购确认超时考核',
            penaltyPerDay: RETURN_PENALTY_PER_DAY,
            createdAt: order.created_at,
          },
        });
      }
    }

    return results;
  },

  buildNotification: buildReturnNotification,
});

// ==================== 规则2: 营销销售超时 ====================

registerAssessmentRule({
  category: 'return_order',
  ruleType: 'marketing_sales_timeout',
  name: '营销未完成销售考核',
  description: '无法采购退货的商品过期前未清仓，按商品进价全额考核营销师',
  triggerMode: 'scheduled',
  calculationModel: 'full_amount',
  allowedTransitions: DEFAULT_ALLOWED_TRANSITIONS,
  statusLabels: DEFAULT_STATUS_LABELS,
  sourceType: 'expiring_return_order',
  sourceLabel: '退货单',

  calculate: async (_ctx: CalculationContext): Promise<CalculationResult[]> => {
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

    if (result.rows.length === 0) return [];

    const results: CalculationResult[] = [];

    for (const order of result.rows) {
      if (!order.marketing_manager) continue;

      const user = await findUserByName(order.marketing_manager);
      if (!user) continue;

      const purchasePrice = parseFloat(order.purchase_price || '0');

      results.push({
        category: 'return_order',
        rule_type: 'marketing_sales_timeout',
        source_type: 'expiring_return_order',
        source_id: order.id,
        source_no: order.return_no,
        source_name: order.goods_name,
        assessment_user_id: user.id,
        assessment_user_name: user.name,
        assessment_role: 'marketing_manager',
        base_amount: purchasePrice,
        penalty_rate: 0,
        overdue_days: 0,
        penalty_amount: purchasePrice,
        rule_snapshot: {
          ruleName: '营销未完成销售考核',
          expireDate: order.expire_date,
          purchasePrice,
        },
      });
    }

    return results;
  },

  buildNotification: buildReturnNotification,
});

// ==================== 规则3: 退货时保质期不足 ====================

registerAssessmentRule({
  category: 'return_order',
  ruleType: 'return_expire_insufficient',
  name: '退货时保质期不足考核',
  description: `退货时剩余保质期低于${RETURN_EXPIRE_INSUFFICIENT_DAYS}天，按商品进价全额考核营销师`,
  triggerMode: 'both',
  calculationModel: 'full_amount',
  allowedTransitions: DEFAULT_ALLOWED_TRANSITIONS,
  statusLabels: DEFAULT_STATUS_LABELS,
  sourceType: 'expiring_return_order',
  sourceLabel: '退货单',

  calculate: async (_ctx: CalculationContext): Promise<CalculationResult[]> => {
    // 定时补偿：检查已有但未创建考核的记录
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
         AND days_to_expire_at_return < $1
         AND NOT EXISTS (
           SELECT 1 FROM assessment_records
           WHERE source_id = expiring_return_orders.id
             AND rule_type = 'return_expire_insufficient'
             AND category = 'return_order'
         )`,
      [RETURN_EXPIRE_INSUFFICIENT_DAYS]
    );

    if (result.rows.length === 0) return [];

    const results: CalculationResult[] = [];

    for (const order of result.rows) {
      if (!order.marketing_manager) continue;

      const user = await findUserByName(order.marketing_manager);
      if (!user) continue;

      const purchasePrice = parseFloat(order.purchase_price || '0');

      results.push({
        category: 'return_order',
        rule_type: 'return_expire_insufficient',
        source_type: 'expiring_return_order',
        source_id: order.id,
        source_no: order.return_no,
        source_name: order.goods_name,
        assessment_user_id: user.id,
        assessment_user_name: user.name,
        assessment_role: 'marketing_manager',
        base_amount: purchasePrice,
        penalty_rate: 0,
        overdue_days: 0,
        penalty_amount: purchasePrice,
        rule_snapshot: {
          ruleName: '退货时保质期不足考核',
          daysToExpireAtReturn: order.days_to_expire_at_return,
          threshold: RETURN_EXPIRE_INSUFFICIENT_DAYS,
          purchasePrice,
        },
      });
    }

    return results;
  },

  buildNotification: buildReturnNotification,
});

// ==================== 规则4: ERP录入超时 ====================

registerAssessmentRule({
  category: 'return_order',
  ruleType: 'erp_entry_timeout',
  name: 'ERP录入超时考核',
  description: `采购确认后${ERP_FILL_DEADLINE_DAYS}天内未录入ERP，超时期间按10元/天/SKU累计考核`,
  triggerMode: 'scheduled',
  calculationModel: 'per_day',
  allowedTransitions: DEFAULT_ALLOWED_TRANSITIONS,
  statusLabels: DEFAULT_STATUS_LABELS,
  sourceType: 'expiring_return_order',
  sourceLabel: '退货单',

  calculate: async (_ctx: CalculationContext): Promise<CalculationResult[]> => {
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
         AND rule_confirmed_at + INTERVAL '${ERP_FILL_DEADLINE_DAYS} days' < NOW()`
    );

    if (result.rows.length === 0) return [];

    const managers = await getUsersByRole('procurement_manager');
    if (managers.length === 0) return [];

    const results: CalculationResult[] = [];

    for (const order of result.rows) {
      const confirmedAt = new Date(order.rule_confirmed_at);
      const deadline = new Date(confirmedAt);
      deadline.setDate(deadline.getDate() + ERP_FILL_DEADLINE_DAYS);

      const diffTime = Date.now() - deadline.getTime();
      const overdueDays = Math.floor(diffTime / 86400000);
      if (overdueDays <= 0) continue;

      const penaltyAmount = overdueDays * RETURN_PENALTY_PER_DAY;
      const purchasePrice = parseFloat(order.purchase_price || '0');

      for (const manager of managers) {
        results.push({
          category: 'return_order',
          rule_type: 'erp_entry_timeout',
          source_type: 'expiring_return_order',
          source_id: order.id,
          source_no: order.return_no,
          source_name: order.goods_name,
          assessment_user_id: manager.id,
          assessment_user_name: manager.name,
          assessment_role: 'procurement_manager',
          base_amount: purchasePrice,
          penalty_rate: RETURN_PENALTY_PER_DAY,
          overdue_days: overdueDays,
          penalty_amount: penaltyAmount,
          rule_snapshot: {
            ruleName: 'ERP录入超时考核',
            penaltyPerDay: RETURN_PENALTY_PER_DAY,
            deadlineDays: ERP_FILL_DEADLINE_DAYS,
            ruleConfirmedAt: order.rule_confirmed_at,
          },
        });
      }
    }

    return results;
  },

  buildNotification: buildReturnNotification,
});

// ==================== 规则5: 仓储执行超时 ====================

registerAssessmentRule({
  category: 'return_order',
  ruleType: 'warehouse_execute_timeout',
  name: '仓储执行超时考核',
  description: `ERP录入后${WAREHOUSE_EXECUTE_DEADLINE_DAYS}天内未完成退货执行，超时期间按10元/天/SKU累计考核`,
  triggerMode: 'scheduled',
  calculationModel: 'per_day',
  allowedTransitions: DEFAULT_ALLOWED_TRANSITIONS,
  statusLabels: DEFAULT_STATUS_LABELS,
  sourceType: 'expiring_return_order',
  sourceLabel: '退货单',

  calculate: async (_ctx: CalculationContext): Promise<CalculationResult[]> => {
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
         AND erp_filled_at + INTERVAL '${WAREHOUSE_EXECUTE_DEADLINE_DAYS} days' < NOW()`
    );

    if (result.rows.length === 0) return [];

    // 仓储执行涉及的角色
    const warehouseRoles = ['warehouse_manager', 'warehouse_operator'] as const;
    // 角色表编码 → 统一考核枚举值映射
    const ROLE_CODE_TO_ASSESSMENT_ROLE: Record<string, AssessmentRole> = {
      warehouse_manager: 'warehouse_manager',
      warehouse_operator: 'warehouse_operator',
    };
    const roleUsersMap = new Map<string, Array<{ id: number; name: string }>>();

    for (const roleCode of warehouseRoles) {
      const users = await getUsersByRole(roleCode);
      if (users.length > 0) {
        roleUsersMap.set(roleCode, users);
      }
    }

    if (roleUsersMap.size === 0) return [];

    const results: CalculationResult[] = [];

    for (const order of result.rows) {
      const erpFilledAt = new Date(order.erp_filled_at);
      const deadline = new Date(erpFilledAt);
      deadline.setDate(deadline.getDate() + WAREHOUSE_EXECUTE_DEADLINE_DAYS);

      const diffTime = Date.now() - deadline.getTime();
      const overdueDays = Math.floor(diffTime / 86400000);
      if (overdueDays <= 0) continue;

      const penaltyAmount = overdueDays * RETURN_PENALTY_PER_DAY;
      const purchasePrice = parseFloat(order.purchase_price || '0');

      for (const roleCode of warehouseRoles) {
        const users = roleUsersMap.get(roleCode) || [];
        for (const user of users) {
          results.push({
            category: 'return_order',
            rule_type: 'warehouse_execute_timeout',
            source_type: 'expiring_return_order',
            source_id: order.id,
            source_no: order.return_no,
            source_name: order.goods_name,
            assessment_user_id: user.id,
            assessment_user_name: user.name,
            assessment_role: ROLE_CODE_TO_ASSESSMENT_ROLE[roleCode] || (roleCode as AssessmentRole),
            base_amount: purchasePrice,
            penalty_rate: RETURN_PENALTY_PER_DAY,
            overdue_days: overdueDays,
            penalty_amount: penaltyAmount,
            rule_snapshot: {
              ruleName: '仓储执行超时考核',
              penaltyPerDay: RETURN_PENALTY_PER_DAY,
              deadlineDays: WAREHOUSE_EXECUTE_DEADLINE_DAYS,
              erpFilledAt: order.erp_filled_at,
            },
          });
        }
      }
    }

    return results;
  },

  buildNotification: buildReturnNotification,
});
