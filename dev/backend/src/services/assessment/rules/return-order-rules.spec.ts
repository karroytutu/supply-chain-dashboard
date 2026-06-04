/**
 * 退货考核规则单元测试
 * 测试规则注册和计算逻辑
 */

jest.mock('../../../db/appPool', () => ({
  appQuery: jest.fn(),
}));

jest.mock('../../../utils/logger', () => ({
  createLogger: () => ({ warn: jest.fn(), info: jest.fn(), error: jest.fn() }),
}));

jest.mock('../../../utils/constants', () => ({
  RETURN_EXPIRE_INSUFFICIENT_DAYS: 15,
}));

jest.mock('../utils', () => ({
  getUsersByRole: jest.fn(),
  findUserByName: jest.fn(),
}));

import { appQuery } from '../../../db/appPool';
import { getUsersByRole } from '../utils';
import { getAssessmentRule, getRulesByCategory } from '../assessment.rules';

// 导入规则文件会触发 registerAssessmentRule
import './return-order-rules';

const mockAppQuery = appQuery as jest.MockedFunction<typeof appQuery>;
const mockGetUsersByRole = getUsersByRole as jest.MockedFunction<typeof getUsersByRole>;

beforeEach(() => {
  jest.resetAllMocks();
});

// ==================== 规则注册 ====================

describe('退货考核规则注册', () => {
  it('5条规则全部注册成功', () => {
    const rules = getRulesByCategory('return_order');
    const ruleTypes = rules.map(r => r.ruleType);

    expect(ruleTypes).toContain('procurement_confirm_timeout');
    expect(ruleTypes).toContain('marketing_sales_timeout');
    expect(ruleTypes).toContain('return_expire_insufficient');
    expect(ruleTypes).toContain('erp_entry_timeout');
    expect(ruleTypes).toContain('warehouse_execute_timeout');
  });

  it('各规则的 triggerMode 正确', () => {
    const scheduled = getAssessmentRule('return_order', 'procurement_confirm_timeout');
    expect(scheduled?.triggerMode).toBe('scheduled');

    const realtime = getAssessmentRule('return_order', 'return_expire_insufficient');
    expect(realtime?.triggerMode).toBe('both');
  });

  it('各规则的 calculationModel 正确', () => {
    const perDay = getAssessmentRule('return_order', 'procurement_confirm_timeout');
    expect(perDay?.calculationModel).toBe('per_day');

    const fullAmount = getAssessmentRule('return_order', 'return_expire_insufficient');
    expect(fullAmount?.calculationModel).toBe('full_amount');
  });

  it('所有规则的 sourceType 为 expiring_return_order', () => {
    const rules = getRulesByCategory('return_order');
    rules.forEach(r => {
      expect(r.sourceType).toBe('expiring_return_order');
    });
  });
});

// ==================== 采购确认超时规则计算 ====================

describe('procurement_confirm_timeout 计算', () => {
  it('无超时退货单返回空', async () => {
    mockAppQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 } as any);

    const rule = getAssessmentRule('return_order', 'procurement_confirm_timeout');
    const results = await rule!.calculate({ triggered_by: 'scheduled' } as any);
    expect(results).toEqual([]);
  });

  it('无采购主管返回空', async () => {
    mockAppQuery.mockResolvedValueOnce({
      rows: [{ id: 1, return_no: 'RT-001', goods_name: 'A', created_at: new Date(), purchase_price: '10' }],
    } as any);
    mockGetUsersByRole.mockResolvedValueOnce([]);

    const rule = getAssessmentRule('return_order', 'procurement_confirm_timeout');
    const results = await rule!.calculate({ triggered_by: 'scheduled' } as any);
    expect(results).toEqual([]);
  });

  it('有超时退货单且有主管时生成考核记录', async () => {
    const threeDaysAgo = new Date();
    threeDaysAgo.setDate(threeDaysAgo.getDate() - 3);

    mockAppQuery.mockResolvedValueOnce({
      rows: [{
        id: 1, return_no: 'RT-001', goods_name: '商品A',
        created_at: threeDaysAgo, purchase_price: '25',
      }],
    } as any);
    mockGetUsersByRole.mockResolvedValueOnce([{ id: 10, name: '采购主管' }] as any);

    const rule = getAssessmentRule('return_order', 'procurement_confirm_timeout');
    const results = await rule!.calculate({ triggered_by: 'scheduled' } as any);
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].penalty_amount).toBeGreaterThan(0);
    expect(results[0].assessment_user_id).toBe(10);
  });
});

// ==================== 通知构建 ====================

describe('退货考核通知构建', () => {
  it('buildNotification 返回正确格式', () => {
    const rule = getAssessmentRule('return_order', 'procurement_confirm_timeout');
    const records = [
      {
        id: 1, source_no: 'RT-001', source_name: '商品A',
        overdue_days: 3, penalty_amount: '30',
      } as any,
    ];

    const notification = rule!.buildNotification(records, 'procurement_manager');
    expect(notification.title).toContain('退货考核');
    expect(notification.title).toContain('1');
    expect(notification.markdown).toContain('RT-001');
    expect(notification.markdown).toContain('30');
  });
});
