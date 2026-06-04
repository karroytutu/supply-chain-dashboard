/**
 * 考核规则注册表框架单元测试
 * 纯函数测试，无需 mock
 */

import {
  registerAssessmentRule,
  getAssessmentRule,
  getRulesByCategory,
  getAllRules,
  getMatchingRules,
  isTransitionAllowed,
  DEFAULT_ALLOWED_TRANSITIONS,
  DEFAULT_STATUS_LABELS,
  type AssessmentRuleDefinition,
} from './assessment.rules';

// ==================== 测试数据工厂 ====================

function createRuleDefinition(overrides: Partial<AssessmentRuleDefinition> = {}): AssessmentRuleDefinition {
  return {
    category: 'return_order',
    ruleType: `test_rule_${Date.now()}_${Math.random()}`,
    name: '测试规则',
    description: '测试用规则',
    triggerMode: 'both',
    calculationModel: 'fixed_amount',
    allowedTransitions: DEFAULT_ALLOWED_TRANSITIONS,
    statusLabels: DEFAULT_STATUS_LABELS,
    sourceType: 'test_source',
    sourceLabel: '测试来源',
    calculate: jest.fn().mockResolvedValue([]),
    buildNotification: jest.fn().mockReturnValue({ title: '通知', markdown: '' }),
    ...overrides,
  };
}

// ==================== registerAssessmentRule ====================

describe('registerAssessmentRule', () => {
  it('成功注册规则', () => {
    const rule = createRuleDefinition({ ruleType: 'register_test_ok' });
    expect(() => registerAssessmentRule(rule)).not.toThrow();
  });

  it('重复注册抛出异常', () => {
    const rule = createRuleDefinition({ ruleType: 'register_dup_test' });
    registerAssessmentRule(rule);
    const dup = createRuleDefinition({ ruleType: 'register_dup_test' });
    expect(() => registerAssessmentRule(dup)).toThrow('考核规则已注册');
  });
});

// ==================== getAssessmentRule ====================

describe('getAssessmentRule', () => {
  it('存在的规则返回定义', () => {
    const rule = createRuleDefinition({ ruleType: 'get_test_found' });
    registerAssessmentRule(rule);
    const found = getAssessmentRule('return_order', 'get_test_found');
    expect(found).toBeDefined();
    expect(found!.name).toBe('测试规则');
  });

  it('不存在的规则返回 undefined', () => {
    const found = getAssessmentRule('return_order', 'nonexistent_rule_xyz');
    expect(found).toBeUndefined();
  });
});

// ==================== getRulesByCategory ====================

describe('getRulesByCategory', () => {
  it('返回指定分类的规则', () => {
    const rules = getRulesByCategory('return_order');
    expect(rules.length).toBeGreaterThan(0);
    rules.forEach(r => expect(r.category).toBe('return_order'));
  });

  it('空分类返回空数组', () => {
    const rules = getRulesByCategory('nonexistent_category' as any);
    expect(rules).toEqual([]);
  });
});

// ==================== getAllRules ====================

describe('getAllRules', () => {
  it('返回所有已注册规则', () => {
    const rules = getAllRules();
    expect(rules.length).toBeGreaterThan(0);
  });
});

// ==================== getMatchingRules ====================

describe('getMatchingRules', () => {
  it('按 category 过滤', () => {
    const rules = getMatchingRules({ category: 'return_order' } as any);
    rules.forEach(r => expect(r.category).toBe('return_order'));
  });

  it('按 ruleType 过滤', () => {
    const rule = createRuleDefinition({
      category: 'return_order',
      ruleType: 'match_filter_test',
      triggerMode: 'both',
    });
    registerAssessmentRule(rule);

    const rules = getMatchingRules({ rule_type: 'match_filter_test' } as any);
    expect(rules.some(r => r.ruleType === 'match_filter_test')).toBe(true);
  });

  it('triggered_by=scheduled 排除 realtime-only 规则', () => {
    const rule = createRuleDefinition({
      category: 'return_order',
      ruleType: 'realtime_only_test',
      triggerMode: 'realtime',
    });
    registerAssessmentRule(rule);

    const rules = getMatchingRules({
      category: 'return_order',
      triggered_by: 'scheduled',
    } as any);
    expect(rules.some(r => r.ruleType === 'realtime_only_test')).toBe(false);
  });

  it('triggered_by=realtime 排除 scheduled-only 规则', () => {
    const rule = createRuleDefinition({
      category: 'return_order',
      ruleType: 'scheduled_only_test',
      triggerMode: 'scheduled',
    });
    registerAssessmentRule(rule);

    const rules = getMatchingRules({
      category: 'return_order',
      triggered_by: 'realtime',
    } as any);
    expect(rules.some(r => r.ruleType === 'scheduled_only_test')).toBe(false);
  });
});

// ==================== isTransitionAllowed ====================

describe('isTransitionAllowed', () => {
  it('允许的转换返回 true', () => {
    const rule = createRuleDefinition({
      category: 'return_order',
      ruleType: 'transition_test',
      allowedTransitions: { pending: ['confirmed', 'cancelled'] },
    });
    registerAssessmentRule(rule);

    expect(isTransitionAllowed('return_order', 'transition_test', 'pending', 'confirmed')).toBe(true);
    expect(isTransitionAllowed('return_order', 'transition_test', 'pending', 'cancelled')).toBe(true);
  });

  it('不允许的转换返回 false', () => {
    const rule = createRuleDefinition({
      category: 'return_order',
      ruleType: 'transition_block_test',
      allowedTransitions: { pending: ['confirmed'] },
    });
    registerAssessmentRule(rule);

    expect(isTransitionAllowed('return_order', 'transition_block_test', 'confirmed', 'pending')).toBe(false);
    expect(isTransitionAllowed('return_order', 'transition_block_test', 'pending', 'appealed')).toBe(false);
  });

  it('不存在的规则返回 false', () => {
    expect(isTransitionAllowed('return_order', 'no_such_rule', 'pending', 'confirmed')).toBe(false);
  });
});

// ==================== DEFAULT 常量 ====================

describe('DEFAULT_ALLOWED_TRANSITIONS', () => {
  it('pending 可转到 confirmed, cancelled, appealed', () => {
    expect(DEFAULT_ALLOWED_TRANSITIONS.pending).toEqual(['confirmed', 'cancelled', 'appealed']);
  });

  it('appealed 可转到 cancelled, pending', () => {
    expect(DEFAULT_ALLOWED_TRANSITIONS.appealed).toEqual(['cancelled', 'pending']);
  });
});

describe('DEFAULT_STATUS_LABELS', () => {
  it('包含所有状态标签', () => {
    expect(DEFAULT_STATUS_LABELS.pending).toBe('待处理');
    expect(DEFAULT_STATUS_LABELS.confirmed).toBe('已处理');
    expect(DEFAULT_STATUS_LABELS.cancelled).toBe('无需考核');
    expect(DEFAULT_STATUS_LABELS.appealed).toBe('申诉中');
  });
});
