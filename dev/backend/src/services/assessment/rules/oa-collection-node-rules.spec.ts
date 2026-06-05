/**
 * OA催收节点考核规则 测试
 * @module services/assessment/rules/oa-collection-node-rules.spec
 */

jest.mock('../../../db/appPool', () => ({
  appQuery: jest.fn(),
}));

jest.mock('../../../utils/logger', () => ({
  createLogger: () => ({ warn: jest.fn(), info: jest.fn(), error: jest.fn() }),
}));

jest.mock('../../../utils/constants', () => {
  const actual = jest.requireActual('../../../utils/constants');
  return {
    ...actual,
    ROLE_CODES: {
      MARKETER: 'marketer',
      MARKETING_MANAGER: 'marketing_manager',
      CURRENT_ACCOUNTANT: 'current_accountant',
      ADMIN: 'admin',
    },
  };
});

import { appQuery } from '../../../db/appPool';
import { getAssessmentRule } from '../assessment.rules';
import type { AssessmentRecordRow } from '../assessment.types';

// 导入规则文件触发 registerAssessmentRule
import './oa-collection-node-rules';

const mockAppQuery = appQuery as jest.MockedFunction<typeof appQuery>;

// 固定时间：2026-06-05T12:00:00Z
const FIXED_NOW = new Date('2026-06-05T12:00:00Z').getTime();

function daysAgo(days: number): Date {
  return new Date(FIXED_NOW - days * 86400000);
}

function mockNode(overrides: Record<string, any> = {}) {
  return {
    node_id: 1,
    instance_id: 100,
    instance_no: 'OA-001',
    node_name: '营销师催收',
    role_code: 'marketer',
    assigned_user_id: 10,
    assigned_user_name: '张三',
    created_at: daysAgo(4),
    form_data_total_amount: '1000',
    consumer_name: '客户A',
    ...overrides,
  };
}

beforeEach(() => {
  jest.resetAllMocks();
  jest.spyOn(Date, 'now').mockReturnValue(FIXED_NOW);
});

afterEach(() => {
  jest.restoreAllMocks();
});

// =====================================================
// 规则注册
// =====================================================

describe('OA催收节点考核规则注册', () => {
  it('注册参数正确', () => {
    const rule = getAssessmentRule('oa_collection', 'oa_node_timeout');
    expect(rule).toBeDefined();
    expect(rule!.category).toBe('oa_collection');
    expect(rule!.ruleType).toBe('oa_node_timeout');
    expect(rule!.sourceType).toBe('oa_approval_node');
    expect(rule!.triggerMode).toBe('scheduled');
    expect(rule!.calculationModel).toBe('fixed_amount');
  });
});

// =====================================================
// calculate 函数
// =====================================================

describe('calculate', () => {
  const getRule = () => getAssessmentRule('oa_collection', 'oa_node_timeout')!;

  it('无 pending 节点时返回空数组', async () => {
    mockAppQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 } as any); // queryPendingOaNodes
    const results = await getRule().calculate({ triggeredBy: 'scheduled' } as any);
    expect(results).toEqual([]);
  });

  it('overdueDays < 3 时跳过', async () => {
    mockAppQuery.mockResolvedValueOnce({ rows: [mockNode({ created_at: daysAgo(2) })] } as any);
    mockAppQuery.mockResolvedValueOnce({ rows: [] } as any); // queryExistingRecordsBatch
    const results = await getRule().calculate({ triggeredBy: 'scheduled' } as any);
    expect(results).toEqual([]);
  });

  describe('Marketer 各 tier', () => {
    it('3-5 天（4天）→ penalty_amount=10', async () => {
      mockAppQuery.mockResolvedValueOnce({ rows: [mockNode({ created_at: daysAgo(4) })] } as any);
      mockAppQuery.mockResolvedValueOnce({ rows: [] } as any); // queryExistingRecordsBatch
      const results = await getRule().calculate({ triggeredBy: 'scheduled' } as any);
      const tier1 = results.find(r => r.rule_type.includes('一级'));
      expect(tier1?.penalty_amount).toBe(10);
    });

    it('5-7 天（6天）→ penalty_amount=20', async () => {
      mockAppQuery.mockResolvedValueOnce({ rows: [mockNode({ created_at: daysAgo(6) })] } as any);
      mockAppQuery.mockResolvedValueOnce({ rows: [] } as any); // queryExistingRecordsBatch
      const results = await getRule().calculate({ triggeredBy: 'scheduled' } as any);
      const tier2 = results.find(r => r.rule_type.includes('二级'));
      expect(tier2?.penalty_amount).toBe(20);
    });

    it('7+ 天（10天）→ penalty_amount = totalAmount * 1.0', async () => {
      mockAppQuery.mockResolvedValueOnce({ rows: [mockNode({ created_at: daysAgo(10), form_data_total_amount: '500' })] } as any);
      mockAppQuery.mockResolvedValueOnce({ rows: [] } as any); // queryExistingRecordsBatch
      const results = await getRule().calculate({ triggeredBy: 'scheduled' } as any);
      const tier3 = results.find(r => r.rule_type.includes('三级'));
      expect(tier3?.penalty_amount).toBe(500);
    });
  });

  describe('Marketing_manager 各 tier', () => {
    it('3-5 天 → penalty_amount=50', async () => {
      mockAppQuery.mockResolvedValueOnce({ rows: [mockNode({ created_at: daysAgo(4), role_code: 'marketing_manager' })] } as any);
      mockAppQuery.mockResolvedValueOnce({ rows: [] } as any);
      const results = await getRule().calculate({ triggeredBy: 'scheduled' } as any);
      const tier1 = results.find(r => r.rule_type.includes('一级'));
      expect(tier1?.penalty_amount).toBe(50);
    });

    it('5-7 天 → penalty_amount=100', async () => {
      mockAppQuery.mockResolvedValueOnce({ rows: [mockNode({ created_at: daysAgo(6), role_code: 'marketing_manager' })] } as any);
      mockAppQuery.mockResolvedValueOnce({ rows: [] } as any);
      const results = await getRule().calculate({ triggeredBy: 'scheduled' } as any);
      const tier2 = results.find(r => r.rule_type.includes('二级'));
      expect(tier2?.penalty_amount).toBe(100);
    });
  });

  it('current_accountant 与 marketer 同标准（3-5天 → ¥10）', async () => {
    mockAppQuery.mockResolvedValueOnce({ rows: [mockNode({ created_at: daysAgo(4), role_code: 'current_accountant' })] } as any);
    mockAppQuery.mockResolvedValueOnce({ rows: [] } as any);
    const results = await getRule().calculate({ triggeredBy: 'scheduled' } as any);
    const tier1 = results.find(r => r.rule_type.includes('一级'));
    expect(tier1?.penalty_amount).toBe(10);
  });

  it('免考核节点（起诉立案）被跳过', async () => {
    mockAppQuery.mockResolvedValueOnce({ rows: [mockNode({ node_name: '起诉立案', created_at: daysAgo(10) })] } as any);
    mockAppQuery.mockResolvedValueOnce({ rows: [] } as any);
    const results = await getRule().calculate({ triggeredBy: 'scheduled' } as any);
    expect(results).toEqual([]);
  });

  it('免考核节点（更新催收状态）被跳过', async () => {
    mockAppQuery.mockResolvedValueOnce({ rows: [mockNode({ node_name: '更新催收状态', created_at: daysAgo(10) })] } as any);
    mockAppQuery.mockResolvedValueOnce({ rows: [] } as any);
    const results = await getRule().calculate({ triggeredBy: 'scheduled' } as any);
    expect(results).toEqual([]);
  });

  it('无对应角色配置时跳过', async () => {
    mockAppQuery.mockResolvedValueOnce({ rows: [mockNode({ role_code: 'unknown_role', created_at: daysAgo(10) })] } as any);
    mockAppQuery.mockResolvedValueOnce({ rows: [] } as any);
    const results = await getRule().calculate({ triggeredBy: 'scheduled' } as any);
    expect(results).toEqual([]);
  });

  it('assigned_user_id 为 null 时跳过', async () => {
    mockAppQuery.mockResolvedValueOnce({ rows: [mockNode({ assigned_user_id: null, created_at: daysAgo(10) })] } as any);
    mockAppQuery.mockResolvedValueOnce({ rows: [] } as any);
    const results = await getRule().calculate({ triggeredBy: 'scheduled' } as any);
    expect(results).toEqual([]);
  });

  it('去重：已有同 tier 考核记录不重复', async () => {
    mockAppQuery.mockResolvedValueOnce({ rows: [mockNode({ created_at: daysAgo(4) })] } as any);
    mockAppQuery.mockResolvedValueOnce({
      rows: [{ rule_type: 'oa_node_一级考核(3-5天)', source_id: 1, assessment_user_id: 10 }],
    } as any);
    const results = await getRule().calculate({ triggeredBy: 'scheduled' } as any);
    const tier1 = results.filter(r => r.rule_type.includes('一级'));
    expect(tier1).toHaveLength(0);
  });

  it('category 字段值为 oa_collection', async () => {
    mockAppQuery.mockResolvedValueOnce({ rows: [mockNode({ created_at: daysAgo(4) })] } as any);
    mockAppQuery.mockResolvedValueOnce({ rows: [] } as any);
    const results = await getRule().calculate({ triggeredBy: 'scheduled' } as any);
    results.forEach(r => expect(r.category).toBe('oa_collection'));
  });

  it('form_data_total_amount 为 null 时按 0 计算', async () => {
    mockAppQuery.mockResolvedValueOnce({ rows: [mockNode({ created_at: daysAgo(10), form_data_total_amount: null })] } as any);
    mockAppQuery.mockResolvedValueOnce({ rows: [] } as any);
    const results = await getRule().calculate({ triggeredBy: 'scheduled' } as any);
    const tier3 = results.find(r => r.rule_type.includes('三级'));
    expect(tier3?.penalty_amount).toBe(0);
  });

  it('边界天数：恰好 3 天命中 tier1', async () => {
    mockAppQuery.mockResolvedValueOnce({ rows: [mockNode({ created_at: daysAgo(3) })] } as any);
    mockAppQuery.mockResolvedValueOnce({ rows: [] } as any);
    const results = await getRule().calculate({ triggeredBy: 'scheduled' } as any);
    const tier1 = results.find(r => r.rule_type.includes('一级'));
    expect(tier1).toBeDefined();
    expect(tier1?.penalty_amount).toBe(10);
  });

  it('边界天数：恰好 5 天命中 tier2', async () => {
    mockAppQuery.mockResolvedValueOnce({ rows: [mockNode({ created_at: daysAgo(5) })] } as any);
    mockAppQuery.mockResolvedValueOnce({ rows: [] } as any);
    const results = await getRule().calculate({ triggeredBy: 'scheduled' } as any);
    const tier2 = results.find(r => r.rule_type.includes('二级'));
    expect(tier2).toBeDefined();
    expect(tier2?.penalty_amount).toBe(20);
  });

  it('边界天数：恰好 7 天命中 tier3', async () => {
    mockAppQuery.mockResolvedValueOnce({ rows: [mockNode({ created_at: daysAgo(7), form_data_total_amount: '200' })] } as any);
    mockAppQuery.mockResolvedValueOnce({ rows: [] } as any);
    const results = await getRule().calculate({ triggeredBy: 'scheduled' } as any);
    const tier3 = results.find(r => r.rule_type.includes('三级'));
    expect(tier3).toBeDefined();
    expect(tier3?.penalty_amount).toBe(200); // 200 * 1.0
  });
});

// =====================================================
// buildNotification
// =====================================================

describe('buildNotification', () => {
  const getRule = () => getAssessmentRule('oa_collection', 'oa_node_timeout')!;

  const mockRecords: AssessmentRecordRow[] = [
    {
      source_no: 'OA-001',
      source_name: '客户A',
      overdue_days: 5,
      penalty_amount: '10',
    } as any,
    {
      source_no: 'OA-002',
      source_name: '客户B',
      overdue_days: 8,
      penalty_amount: '200',
    } as any,
  ];

  it('标题包含记录数', () => {
    const notif = getRule().buildNotification!(mockRecords, 'marketer');
    expect(notif.title).toContain('2');
    expect(notif.title).toContain('考核记录');
  });

  it('Markdown 表格包含正确列', () => {
    const notif = getRule().buildNotification!(mockRecords, 'marketer');
    expect(notif.markdown).toContain('实例编号');
    expect(notif.markdown).toContain('客户名称');
    expect(notif.markdown).toContain('超时天数');
    expect(notif.markdown).toContain('考核金额');
  });

  it('合计金额正确', () => {
    const notif = getRule().buildNotification!(mockRecords, 'marketer');
    expect(notif.markdown).toContain('¥210.00');
  });

  it('角色名映射：marketer → 营销师', () => {
    const notif = getRule().buildNotification!(mockRecords, 'marketer');
    expect(notif.markdown).toContain('营销师');
  });

  it('角色名映射：marketing_manager → 营销经理', () => {
    const notif = getRule().buildNotification!(mockRecords, 'marketing_manager');
    expect(notif.markdown).toContain('营销经理');
  });

  it('角色名映射：current_accountant → 财务', () => {
    const notif = getRule().buildNotification!(mockRecords, 'current_accountant');
    expect(notif.markdown).toContain('财务');
  });

  it('未知角色显示原始 roleCode', () => {
    const notif = getRule().buildNotification!(mockRecords, 'unknown_role');
    expect(notif.markdown).toContain('unknown_role');
  });
});
