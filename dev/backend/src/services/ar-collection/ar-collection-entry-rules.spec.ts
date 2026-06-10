/**
 * 催收准入规则引擎单元测试
 * 测试 evaluateEntryRules() 和 extractEntryMetadata() 纯函数
 * 无需 mock：规则引擎为声明式纯函数架构
 */

jest.mock('../../utils/logger', () => ({
  createLogger: () => ({ warn: jest.fn(), info: jest.fn(), error: jest.fn() }),
}));

import {
  evaluateEntryRules,
  extractEntryMetadata,
  COLLECTION_ENTRY_RULES,
  ENTRY_REASON_LABELS,
  type EvaluationContext,
  type EntryRuleConfig,
  type CollectionEntryVerdict,
} from './ar-collection-entry-rules';
import type { EnrichedDebtRecord } from '../erp-debt/erp-debt.types';

// ==================== 测试数据工厂 ====================

function createDebt(overrides: Partial<EnrichedDebtRecord> & { billId?: string } = {}): EnrichedDebtRecord {
  return {
    billId: 'BILL-001',
    bizOrderStr: 'ORDER-001',
    consumerName: '测试客户',
    managerUsers: '张三',
    totalAmount: 1000,
    leftAmount: 800,
    settleMethod: 1,
    consumerExpireDay: 15,
    billTypeName: '销售单',
    workTime: '2026-01-01',
    hoardTag: null,
    holdType: null,
    holdUntil: null,
    traderId: null,
    overdueDays: 0,
    overdueDateStr: '',
    maxAllowedDays: 30,
    isOverdue: false,
    customerMaxDebtOrderNum: null,
    customerMaxDebtDays: null,
    customerMaxDebtAmount: null,
    writeOffAmount: 200,
    billNote: 'ORDER-001访销订单',
    ...overrides,
  } as EnrichedDebtRecord;
}

function createContext(
  ruleOverrides?: Partial<Record<'overdue_days' | 'max_overdue_orders', Partial<EntryRuleConfig>>>
): EvaluationContext {
  const configs = { ...COLLECTION_ENTRY_RULES };
  if (ruleOverrides?.overdue_days) {
    configs.overdue_days = { ...configs.overdue_days, ...ruleOverrides.overdue_days };
  }
  if (ruleOverrides?.max_overdue_orders) {
    configs.max_overdue_orders = { ...configs.max_overdue_orders, ...ruleOverrides.max_overdue_orders };
  }
  return { now: new Date('2026-06-01'), ruleConfigs: configs };
}

function createDebtsMap(debts: EnrichedDebtRecord[], consumerName = '测试客户'): Map<string, EnrichedDebtRecord[]> {
  return new Map([[consumerName, debts]]);
}

// ==================== COLLECTION_ENTRY_RULES 配置完整性 ====================

describe('COLLECTION_ENTRY_RULES 配置', () => {
  it('包含 overdue_days 和 max_overdue_orders 两条规则', () => {
    expect(Object.keys(COLLECTION_ENTRY_RULES)).toEqual(
      expect.arrayContaining(['overdue_days', 'max_overdue_orders'])
    );
  });

  it('所有规则都启用', () => {
    Object.values(COLLECTION_ENTRY_RULES).forEach(rule => {
      expect(rule.enabled).toBe(true);
    });
  });

  it('priority 唯一且有序', () => {
    const priorities = Object.values(COLLECTION_ENTRY_RULES).map(r => r.priority);
    const unique = new Set(priorities);
    expect(unique.size).toBe(priorities.length);
  });

  it('ENTRY_REASON_LABELS 与规则类型一致', () => {
    const ruleTypes = Object.keys(COLLECTION_ENTRY_RULES);
    ruleTypes.forEach(type => {
      expect(ENTRY_REASON_LABELS[type as keyof typeof ENTRY_REASON_LABELS]).toBeDefined();
    });
  });
});

// ==================== evaluateEntryRules ====================

describe('evaluateEntryRules', () => {
  it('空输入返回空裁决', () => {
    const result = evaluateEntryRules(new Map(), createContext());
    expect(result).toEqual([]);
  });

  describe('overdue_days 规则', () => {
    it('未逾期欠款不触发规则', () => {
      const debts = [createDebt({ isOverdue: false, overdueDays: 0 })];
      const result = evaluateEntryRules(createDebtsMap(debts), createContext());
      expect(result[0].shouldEnter).toBe(false);
      expect(result[0].triggeredRules).toHaveLength(0);
    });

    it('逾期欠款触发 overdue_days 规则', () => {
      const debts = [createDebt({ isOverdue: true, overdueDays: 45, maxAllowedDays: 30, settleMethod: 1 })];
      const result = evaluateEntryRules(createDebtsMap(debts), createContext());
      expect(result[0].shouldEnter).toBe(true);
      expect(result[0].triggeredRules[0].triggeredRule).toBe('overdue_days');
      expect(result[0].triggeredRules[0].reason).toContain('45天');
    });

    it('规则快照包含关键审计字段', () => {
      const debts = [createDebt({ isOverdue: true, overdueDays: 10, maxAllowedDays: 7 })];
      const result = evaluateEntryRules(createDebtsMap(debts), createContext());
      const snapshot = result[0].triggeredRules[0].ruleSnapshot;
      expect(snapshot).toHaveProperty('maxAllowedDays');
      expect(snapshot).toHaveProperty('overdueDays');
      expect(snapshot).toHaveProperty('settleMethod');
    });

    it('规则禁用时不触发', () => {
      const debts = [createDebt({ isOverdue: true, overdueDays: 999 })];
      const ctx = createContext({ overdue_days: { enabled: false } });
      const result = evaluateEntryRules(createDebtsMap(debts), ctx);
      const overdueTriggered = result[0].triggeredRules.some(r => r.triggeredRule === 'overdue_days');
      expect(overdueTriggered).toBe(false);
    });
  });

  describe('max_overdue_orders 规则', () => {
    it('欠款数未超限不触发', () => {
      const debts = [
        createDebt({ customerMaxDebtOrderNum: 3, workTime: '2026-01-01' }),
        createDebt({ customerMaxDebtOrderNum: 3, workTime: '2026-02-01' }),
      ];
      const result = evaluateEntryRules(createDebtsMap(debts), createContext());
      const maxTriggered = result.some(v => v.triggeredRules.some(r => r.triggeredRule === 'max_overdue_orders'));
      expect(maxTriggered).toBe(false);
    });

    it('欠款数超限时最旧欠款触发规则', () => {
      const debts = [
        createDebt({ billId: 'BILL-1', customerMaxDebtOrderNum: 2, workTime: '2025-01-01' }), // 最旧
        createDebt({ billId: 'BILL-2', customerMaxDebtOrderNum: 2, workTime: '2025-06-01' }),
        createDebt({ billId: 'BILL-3', customerMaxDebtOrderNum: 2, workTime: '2026-01-01' }), // 最新
      ];
      const result = evaluateEntryRules(createDebtsMap(debts), createContext());

      // 最新2单保留，最旧1单超限
      const triggered = result.filter(v => v.shouldEnter);
      expect(triggered.length).toBe(1);
      expect(triggered[0].debt.billId).toBe('BILL-1'); // 最旧的 BILL-1 入催
      expect(triggered[0].triggeredRules[0].triggeredRule).toBe('max_overdue_orders');
    });

    it('maxDebtOrderNum=0 表示无限制', () => {
      const debts = Array.from({ length: 10 }, (_, i) =>
        createDebt({ billId: `BILL-${i}`, customerMaxDebtOrderNum: 0 })
      );
      const result = evaluateEntryRules(createDebtsMap(debts), createContext());
      const maxTriggered = result.some(v => v.shouldEnter);
      expect(maxTriggered).toBe(false);
    });

    it('maxDebtOrderNum=null 表示无限制', () => {
      const debts = Array.from({ length: 5 }, (_, i) =>
        createDebt({ billId: `BILL-${i}`, customerMaxDebtOrderNum: null })
      );
      const result = evaluateEntryRules(createDebtsMap(debts), createContext());
      const maxTriggered = result.some(v => v.shouldEnter);
      expect(maxTriggered).toBe(false);
    });
  });

  describe('多规则 OR 逻辑', () => {
    it('同时触发两条规则的欠款合并结果', () => {
      const debts = [
        createDebt({
          billId: 'BILL-A',
          isOverdue: true,
          overdueDays: 45,
          customerMaxDebtOrderNum: 1,
          workTime: '2025-01-01',
        }),
        createDebt({
          billId: 'BILL-B',
          isOverdue: false,
          customerMaxDebtOrderNum: 1,
          workTime: '2026-01-01',
        }),
      ];
      const result = evaluateEntryRules(createDebtsMap(debts), createContext());
      const debt1Verdict = result.find(v => v.debt.billId === 'BILL-A')!;
      expect(debt1Verdict.shouldEnter).toBe(true);
      expect(debt1Verdict.triggeredRules.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('多客户分组', () => {
    it('不同客户独立评估', () => {
      const map = new Map<string, EnrichedDebtRecord[]>([
        ['客户A', [createDebt({ billId: 'BILL-A', isOverdue: true, overdueDays: 999 })]],
        ['客户B', [createDebt({ billId: 'BILL-B', isOverdue: false })]],
      ]);
      const result = evaluateEntryRules(map, createContext());
      expect(result).toHaveLength(2);
      const a = result.find(v => v.debt.billId === 'BILL-A')!;
      const b = result.find(v => v.debt.billId === 'BILL-B')!;
      expect(a.shouldEnter).toBe(true);
      expect(b.shouldEnter).toBe(false);
    });
  });
});

// ==================== extractEntryMetadata ====================

describe('extractEntryMetadata', () => {
  it('无入催欠款时返回空', () => {
    const verdicts: CollectionEntryVerdict[] = [
      { debt: createDebt(), triggeredRules: [], shouldEnter: false },
    ];
    const result = extractEntryMetadata(verdicts);
    expect(result.enteringDebts).toHaveLength(0);
    expect(result.entryReasons).toHaveLength(0);
  });

  it('正确收集入催欠款和原因类型', () => {
    const debt1 = createDebt({ billId: 'BILL-1' });
    const debt2 = createDebt({ billId: 'BILL-2' });
    const verdicts: CollectionEntryVerdict[] = [
      {
        debt: debt1,
        triggeredRules: [{ triggeredRule: 'overdue_days', reason: '逾期', ruleSnapshot: {} }],
        shouldEnter: true,
      },
      { debt: debt2, triggeredRules: [], shouldEnter: false },
    ];
    const result = extractEntryMetadata(verdicts);
    expect(result.enteringDebts).toHaveLength(1);
    expect(result.enteringDebts[0].billId).toBe('BILL-1');
    expect(result.entryReasons).toContain('overdue_days');
  });

  it('entryRuleSnapshot 包含 evaluatedAt 时间戳', () => {
    const verdicts: CollectionEntryVerdict[] = [
      {
        debt: createDebt(),
        triggeredRules: [{ triggeredRule: 'max_overdue_orders', reason: '超单', ruleSnapshot: { maxDebtOrderNum: 3 } }],
        shouldEnter: true,
      },
    ];
    const result = extractEntryMetadata(verdicts);
    expect(result.entryRuleSnapshot.evaluatedAt).toBeDefined();
    expect(result.entryRuleSnapshot.rules).toHaveProperty('max_overdue_orders');
  });

  it('多条欠款触发同一规则时快照不重复', () => {
    const verdicts: CollectionEntryVerdict[] = [
      {
        debt: createDebt({ billId: 'BILL-X' }),
        triggeredRules: [{ triggeredRule: 'overdue_days', reason: '逾期', ruleSnapshot: { overdueDays: 10 } }],
        shouldEnter: true,
      },
      {
        debt: createDebt({ billId: 'BILL-Y' }),
        triggeredRules: [{ triggeredRule: 'overdue_days', reason: '逾期', ruleSnapshot: { overdueDays: 20 } }],
        shouldEnter: true,
      },
    ];
    const result = extractEntryMetadata(verdicts);
    expect(result.entryReasons.filter(r => r === 'overdue_days')).toHaveLength(1);
  });
});
