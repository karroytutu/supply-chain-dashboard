/**
 * 营业执照补交超时考核规则单元测试
 */

jest.mock('../../../utils/logger', () => ({
  createLogger: () => ({ warn: jest.fn(), info: jest.fn(), error: jest.fn() }),
}));

jest.mock('../../../db/appPool', () => ({
  appQuery: jest.fn(),
}));

jest.mock('../../../utils/constants', () => ({
  CREDIT_LICENSE_PENALTY_PER_DAY: 10,
  CREDIT_LICENSE_DEFERRED_DEADLINE_DAYS: 7,
}));

jest.mock('../../credit-license/credit-license.repository', () => ({
  getOverdueAssessmentTargets: jest.fn(),
}));

import { appQuery } from '../../../db/appPool';
import { mockQueryResult } from '../../../__tests__/helpers/mockDb';
import { getOverdueAssessmentTargets } from '../../credit-license/credit-license.repository';
import { getAssessmentRule, getRulesByCategory } from '../assessment.rules';

// 导入规则文件触发注册
import './credit-license-rules';

const mockAppQuery = appQuery as jest.MockedFunction<typeof appQuery>;
const mockGetOverdue = getOverdueAssessmentTargets as jest.MockedFunction<typeof getOverdueAssessmentTargets>;

describe('credit-license-rules', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('规则注册', () => {
    it('license_timeout 规则已注册', () => {
      const rule = getAssessmentRule('credit_license', 'license_timeout');
      expect(rule).toBeDefined();
      expect(rule!.name).toBe('营业执照补交超时考核');
      expect(rule!.calculationModel).toBe('per_day');
      expect(rule!.sourceType).toBe('credit_license_deferred');
    });

    it('getRulesByCategory 返回 credit_license 分类规则', () => {
      const rules = getRulesByCategory('credit_license');
      expect(rules.length).toBeGreaterThan(0);
      expect(rules.some(r => r.ruleType === 'license_timeout')).toBe(true);
    });
  });

  describe('calculate', () => {
    const rule = getAssessmentRule('credit_license', 'license_timeout')!;

    it('无逾期记录时返回空', async () => {
      mockGetOverdue.mockResolvedValueOnce([]);

      const results = await rule.calculate({} as any);

      expect(results).toEqual([]);
    });

    it('逾期记录正确计算考核金额', async () => {
      const today = new Date();
      const deadline = new Date(today);
      deadline.setDate(deadline.getDate() - 5); // 5天前到期

      mockGetOverdue.mockResolvedValueOnce([
        {
          id: 1,
          customer_name: '测试客户',
          customer_id: 1001,
          applicant_id: 10,
          applicant_name: '张三',
          deadline: deadline.toISOString(),
          oa_instance_id: 100,
          status: 'overdue',
          last_reminder_at: null,
          completed_at: null,
          created_at: '2026-01-01',
          updated_at: '2026-01-01',
        },
      ]);
      mockAppQuery.mockResolvedValueOnce(
        mockQueryResult([{ instance_no: 'OA-2026-001' }])
      );

      const results = await rule.calculate({} as any);

      expect(results.length).toBeGreaterThan(0);
      const record = results[0];
      expect(record.category).toBe('credit_license');
      expect(record.rule_type).toBe('license_timeout');
      expect(record.assessment_user_id).toBe(10);
      expect(record.assessment_role).toBe('marketer');
      expect(record.penalty_rate).toBe(10); // 10元/天
      expect(record.penalty_amount).toBeGreaterThanOrEqual(50); // 至少5天 × 10元
      expect(record.source_name).toBe('测试客户');
    });

    it('oa_instance_id 查询不到实例编号时使用空字符串', async () => {
      const deadline = new Date();
      deadline.setDate(deadline.getDate() - 3);

      mockGetOverdue.mockResolvedValueOnce([
        {
          id: 1,
          customer_name: '客户A',
          customer_id: 1002,
          applicant_id: 20,
          applicant_name: '李四',
          deadline: deadline.toISOString(),
          oa_instance_id: 999,
          status: 'overdue',
          last_reminder_at: null,
          completed_at: null,
          created_at: '2026-01-01',
          updated_at: '2026-01-01',
        },
      ]);
      mockAppQuery.mockResolvedValueOnce(mockQueryResult([]));

      const results = await rule.calculate({} as any);

      expect(results[0].source_no).toBe('');
    });
  });

  describe('buildNotification', () => {
    const rule = getAssessmentRule('credit_license', 'license_timeout')!;

    it('构建通知包含合计金额和表格', () => {
      const records = [
        {
          id: 1,
          source_name: '客户A',
          overdue_days: 5,
          penalty_amount: '50.00',
          category: 'credit_license' as const,
          rule_type: 'license_timeout',
          source_type: 'credit_license_deferred',
          source_id: 1,
          source_no: 'OA-001',
          assessment_user_id: 10,
          assessment_user_name: '张三',
          assessment_role: 'marketer' as any,
          base_amount: null,
          penalty_rate: null,
          status: 'pending' as const,
          handle_remark: null,
          handled_by: null,
          handled_at: null,
          oa_instance_id: null,
          appeal_reason: null,
          appeal_submitted_at: null,
          rule_snapshot: null,
          calculated_at: '',
          created_at: '',
          updated_at: '',
        },
      ];

      const notification = rule.buildNotification(records, 'marketer');

      expect(notification.title).toContain('执照考核');
      expect(notification.title).toContain('1');
      expect(notification.markdown).toContain('客户A');
      expect(notification.markdown).toContain('¥50.00');
      expect(notification.markdown).toContain('合计');
    });
  });
});
