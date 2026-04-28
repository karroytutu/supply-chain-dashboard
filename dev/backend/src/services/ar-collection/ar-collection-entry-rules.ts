/**
 * 催收准入规则框架
 * 遵循 PENALTY_RULES / ASSESSMENT_RULES 声明式规则模式
 * 新增规则只需：① 添加 EntryRuleType ② 添加 ENTRY_RULES 配置 ③ 实现评估器
 * 任务生成管线本身无需修改
 */

import { AR_DEFAULT_EXPIRE_DAYS, AR_SETTLE_METHOD_CONSUMER_EXPIRE } from '../../utils/constants';
import type { EnrichedDebtRecord } from './ar-debt.types';
import type { EntryRuleSnapshot } from './ar-collection.types';

// ============================================
// 类型定义
// ============================================

/** 入催规则类型（可扩展） */
export type EntryRuleType = 'overdue_days' | 'max_overdue_orders';
// 未来: | 'max_overdue_amount' | 'customer_grade' 等

/** 入催规则配置 */
export interface EntryRuleConfig {
  type: EntryRuleType;
  name: string;           // 中文显示名
  description: string;    // 规则说明（用于审计）
  enabled: boolean;       // 开关
  priority: number;       // 评估顺序（越小越先评估）
}

/** 评估上下文 */
export interface EvaluationContext {
  now: Date;
  ruleConfigs: Record<EntryRuleType, EntryRuleConfig>;
}

/** 单条规则评估结果 */
export interface EntryRuleResult {
  triggeredRule: EntryRuleType;
  reason: string;                         // 人可读原因
  ruleSnapshot: Record<string, unknown>;    // 规则快照（审计用）
}

/** 每条欠款的入催裁决 */
export interface CollectionEntryVerdict {
  debt: EnrichedDebtRecord;
  triggeredRules: EntryRuleResult[];      // 触发的所有规则
  shouldEnter: boolean;                   // 任一规则触发即为 true（OR 逻辑）
}

/** 评估器函数签名 — 接收一客户组的欠款，返回触发结果 */
export type EntryRuleEvaluator = (
  debts: EnrichedDebtRecord[],
  context: EvaluationContext,
) => Map<number, EntryRuleResult>;  // key = debt 在数组中的 index

// ============================================
// 规则配置常量
// ============================================

/** 催收准入规则配置 @usedBy ar-collection-task-generator.ts */
export const COLLECTION_ENTRY_RULES: Record<EntryRuleType, EntryRuleConfig> = {
  overdue_days: {
    type: 'overdue_days',
    name: '逾期天数超标',
    description: '欠款账龄超过客户最大欠款天数时进入催收',
    enabled: true,
    priority: 1,
  },
  max_overdue_orders: {
    type: 'max_overdue_orders',
    name: '超过最大欠款单数',
    description: '客户欠款单数超过最大欠款单数时，超限新单进入催收',
    enabled: true,
    priority: 2,
  },
};

/** 入催原因中文映射 @usedBy ar-collection.mapper.ts, frontend */
export const ENTRY_REASON_LABELS: Record<EntryRuleType, string> = {
  overdue_days: '逾期',
  max_overdue_orders: '超单',
};

// ============================================
// 评估器注册表
// ============================================

const evaluatorRegistry: Map<EntryRuleType, EntryRuleEvaluator> = new Map();

/** 注册评估器 */
function registerEvaluator(type: EntryRuleType, evaluator: EntryRuleEvaluator): void {
  evaluatorRegistry.set(type, evaluator);
}

// ============================================
// 评估器实现：逾期天数
// ============================================

/**
 * 逾期天数评估器
 * 检查每条欠款的 overdueDays 是否超过 maxAllowedDays
 */
const overdueDaysEvaluator: EntryRuleEvaluator = (
  debts: EnrichedDebtRecord[],
  context: EvaluationContext,
): Map<number, EntryRuleResult> => {
  const results = new Map<number, EntryRuleResult>();
  const ruleConfig = context.ruleConfigs.overdue_days;

  debts.forEach((debt, index) => {
    if (debt.isOverdue) {
      results.set(index, {
        triggeredRule: 'overdue_days',
        reason: `逾期${debt.overdueDays}天，超过结算方式${debt.settleMethod}的${debt.maxAllowedDays}天限制`,
        ruleSnapshot: {
          type: ruleConfig.type,
          name: ruleConfig.name,
          maxAllowedDays: debt.maxAllowedDays,
          settleMethod: debt.settleMethod,
          consumerExpireDay: debt.consumerExpireDay,
          overdueDays: debt.overdueDays,
        },
      });
    }
  });

  return results;
};

registerEvaluator('overdue_days', overdueDaysEvaluator);

// ============================================
// 评估器实现：最大欠款单数
// ============================================

/**
 * 最大欠款单数评估器
 * 按客户分组后，按 workTime 升序排列（最早优先保留）
 * 前 maxDebtOrderNum 单为"额度内"，之后的为"超限单"
 */
const maxOverdueOrdersEvaluator: EntryRuleEvaluator = (
  debts: EnrichedDebtRecord[],
  context: EvaluationContext,
): Map<number, EntryRuleResult> => {
  const results = new Map<number, EntryRuleResult>();
  const ruleConfig = context.ruleConfigs.max_overdue_orders;

  // 获取该客户的 maxDebtOrderNum（所有欠款共享同一客户限额）
  const maxDebtOrderNum = debts[0]?.customerMaxDebtOrderNum;

  // null 或 0 表示无限制
  if (!maxDebtOrderNum || maxDebtOrderNum <= 0) {
    return results;
  }

  // 欠款总数未超过限额，无需标记
  if (debts.length <= maxDebtOrderNum) {
    return results;
  }

  // 按 workTime 升序排列（最早优先保留）
  const sortedWithIndex = debts.map((debt, index) => ({ debt, index }));
  sortedWithIndex.sort((a, b) => new Date(a.debt.workTime).getTime() - new Date(b.debt.workTime).getTime());

  // 前 maxDebtOrderNum 单保留，之后的为超限单
  const excessStartIndex = maxDebtOrderNum;
  const excessCount = debts.length - maxDebtOrderNum;

  for (let i = excessStartIndex; i < sortedWithIndex.length; i++) {
    const { debt, index } = sortedWithIndex[i];
    results.set(index, {
      triggeredRule: 'max_overdue_orders',
      reason: `客户欠款${debts.length}单，超过最大欠款单数${maxDebtOrderNum}，最新${excessCount}单超限入催`,
      ruleSnapshot: {
        type: ruleConfig.type,
        name: ruleConfig.name,
        maxDebtOrderNum,
        totalDebtCount: debts.length,
        excessCount,
      },
    });
  }

  return results;
};

registerEvaluator('max_overdue_orders', maxOverdueOrdersEvaluator);

// ============================================
// Composite 评估函数
// ============================================

/**
 * 评估所有准入规则，返回每条欠款的入催裁决
 * 多规则 OR 逻辑：任一评估器返回某条欠款，该欠款即进入催收
 *
 * @param debtsByConsumer 按客户名分组的富化欠款记录
 * @param context 评估上下文
 * @returns 所有应入催的欠款裁决列表
 */
export function evaluateEntryRules(
  debtsByConsumer: Map<string, EnrichedDebtRecord[]>,
  context: EvaluationContext,
): CollectionEntryVerdict[] {
  // 获取所有启用的规则，按 priority 排序
  const enabledRules = Object.values(context.ruleConfigs)
    .filter(r => r.enabled)
    .sort((a, b) => a.priority - b.priority);

  const allVerdicts: CollectionEntryVerdict[] = [];

  for (const [_consumerName, debts] of debtsByConsumer) {
    // 为每条欠款初始化裁决
    const verdictMap = new Map<number, CollectionEntryVerdict>();
    debts.forEach((debt, index) => {
      verdictMap.set(index, { debt, triggeredRules: [], shouldEnter: false });
    });

    // 按优先级依次评估每个规则
    for (const rule of enabledRules) {
      const evaluator = evaluatorRegistry.get(rule.type);
      if (!evaluator) {
        console.warn(`[EntryRules] 评估器未注册: ${rule.type}`);
        continue;
      }

      const ruleResults = evaluator(debts, context);

      // 合并结果到裁决（OR 逻辑）
      for (const [index, result] of ruleResults) {
        const verdict = verdictMap.get(index);
        if (verdict) {
          verdict.triggeredRules.push(result);
          verdict.shouldEnter = true;
        }
      }
    }

    // 收集所有裁决
    for (const verdict of verdictMap.values()) {
      allVerdicts.push(verdict);
    }
  }

  return allVerdicts;
}

/**
 * 从裁决列表中提取应入催的欠款记录
 * 同时收集任务级别的 entry_reasons 和 entry_rule_snapshot
 */
export function extractEntryMetadata(verdicts: CollectionEntryVerdict[]): {
  enteringDebts: EnrichedDebtRecord[];
  entryReasons: EntryRuleType[];
  entryRuleSnapshot: EntryRuleSnapshot;
} {
  const enteringDebts: EnrichedDebtRecord[] = [];
  const reasonSet = new Set<EntryRuleType>();
  const ruleSnapshots: Record<string, Record<string, unknown>> = {};

  for (const verdict of verdicts) {
    if (verdict.shouldEnter) {
      enteringDebts.push(verdict.debt);
      for (const result of verdict.triggeredRules) {
        reasonSet.add(result.triggeredRule);
        // 合并规则快照（同一规则多次触发只保留一份）
        if (!ruleSnapshots[result.triggeredRule]) {
          ruleSnapshots[result.triggeredRule] = result.ruleSnapshot;
        }
      }
    }
  }

  return {
    enteringDebts,
    entryReasons: Array.from(reasonSet),
    entryRuleSnapshot: { rules: ruleSnapshots, evaluatedAt: new Date().toISOString() },
  };
}
