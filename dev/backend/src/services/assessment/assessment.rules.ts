/**
 * 统一考核管理 - 规则注册表框架
 * 提供规则注册、查询、状态转换校验等核心能力
 */

import type {
  AssessmentCategory,
  AssessmentStatus,
  CalculationContext,
  CalculationResult,
  NotificationContent,
  AssessmentRecordRow,
} from './assessment.types';

// ==================== 规则定义接口 ====================

/** 考核规则定义（每个规则实现此接口并注册） */
export interface AssessmentRuleDefinition {
  /** 考核分类 */
  category: AssessmentCategory;
  /** 规则类型标识 */
  ruleType: string;
  /** 规则名称（中文） */
  name: string;
  /** 规则描述 */
  description: string;
  /** 触发模式：定时/实时/两者皆可 */
  triggerMode: 'scheduled' | 'realtime' | 'both';
  /** 计算模型：固定金额/按天/比例/全额 */
  calculationModel: 'fixed_amount' | 'per_day' | 'ratio' | 'full_amount';
  /** 状态转换规则：fromStatus → 允许的 toStatus 列表 */
  allowedTransitions: Record<string, string[]>;
  /** 状态标签（可覆盖默认标签） */
  statusLabels: Record<string, string>;
  /** 来源类型标识：'ar_collection_task' | 'expiring_return_order' */
  sourceType: string;
  /** 来源类型中文标签：'催收任务' | '退货单' */
  sourceLabel: string;
  /** 执行计算逻辑，返回需生成的考核记录 */
  calculate: (ctx: CalculationContext) => Promise<CalculationResult[]>;
  /** 构建通知内容 */
  buildNotification: (records: AssessmentRecordRow[], role: string) => NotificationContent;
}

// ==================== 全局注册表 ====================

const ASSESSMENT_RULE_REGISTRY = new Map<string, AssessmentRuleDefinition>();

/**
 * 注册考核规则
 * @param rule 规则定义
 * @throws 重复注册时抛出错误
 */
export function registerAssessmentRule(rule: AssessmentRuleDefinition): void {
  const key = `${rule.category}:${rule.ruleType}`;
  if (ASSESSMENT_RULE_REGISTRY.has(key)) {
    throw new Error(`考核规则已注册: ${key}`);
  }
  ASSESSMENT_RULE_REGISTRY.set(key, rule);
}

/**
 * 获取指定规则定义
 * @param category 考核分类
 * @param ruleType 规则类型
 */
export function getAssessmentRule(
  category: AssessmentCategory,
  ruleType: string
): AssessmentRuleDefinition | undefined {
  return ASSESSMENT_RULE_REGISTRY.get(`${category}:${ruleType}`);
}

/**
 * 获取指定分类的所有规则
 * @param category 考核分类
 */
export function getRulesByCategory(category: AssessmentCategory): AssessmentRuleDefinition[] {
  return Array.from(ASSESSMENT_RULE_REGISTRY.values()).filter(r => r.category === category);
}

/**
 * 获取所有注册的规则
 */
export function getAllRules(): AssessmentRuleDefinition[] {
  return Array.from(ASSESSMENT_RULE_REGISTRY.values());
}

/**
 * 获取匹配计算上下文的规则列表
 * @param ctx 计算上下文
 */
export function getMatchingRules(ctx: CalculationContext): AssessmentRuleDefinition[] {
  return Array.from(ASSESSMENT_RULE_REGISTRY.values()).filter(rule => {
    // 按 category 过滤
    if (ctx.category && rule.category !== ctx.category) return false;
    // 按 ruleType 过滤
    if (ctx.rule_type && rule.ruleType !== ctx.rule_type) return false;
    // 按 triggerMode 过滤
    if (ctx.triggered_by === 'scheduled' && rule.triggerMode === 'realtime') return false;
    if (ctx.triggered_by === 'realtime' && rule.triggerMode === 'scheduled') return false;
    return true;
  });
}

/**
 * 检查状态转换是否允许
 * @param category 考核分类
 * @param ruleType 规则类型
 * @param fromStatus 当前状态
 * @param toStatus 目标状态
 */
export function isTransitionAllowed(
  category: AssessmentCategory,
  ruleType: string,
  fromStatus: AssessmentStatus,
  toStatus: string
): boolean {
  const rule = getAssessmentRule(category, ruleType);
  if (!rule) return false;
  const allowed = rule.allowedTransitions[fromStatus];
  return allowed ? allowed.includes(toStatus) : false;
}

// ==================== 默认状态转换（所有规则统一） ====================

/** 默认允许的状态转换 */
export const DEFAULT_ALLOWED_TRANSITIONS: Record<string, string[]> = {
  pending: ['confirmed', 'cancelled', 'appealed'],
  appealed: ['cancelled', 'pending'],
};

/** 默认状态标签 */
export const DEFAULT_STATUS_LABELS: Record<string, string> = {
  pending: '待处理',
  confirmed: '已处理',
  cancelled: '无需考核',
  appealed: '申诉中',
};
