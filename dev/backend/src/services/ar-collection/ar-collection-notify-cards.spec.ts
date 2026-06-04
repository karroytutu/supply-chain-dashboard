import {
  buildEscalationActionCard,
  buildVerifyResultActionCard,
  buildRollbackActionCard,
  buildUpcomingWarningMessage,
  buildMergedWarningMessage,
  WarningDebtItem,
} from './ar-collection-notify-cards';
import type { CollectionTask } from './ar-collection.types';

jest.mock('../../utils/logger', () => ({
  createLogger: () => ({ warn: jest.fn(), info: jest.fn(), error: jest.fn() }),
}));

function makeTask(overrides: Partial<CollectionTask> = {}): CollectionTask {
  return {
    id: 1,
    task_no: 'AR-2026-001',
    consumer_code: 'C001',
    consumer_name: '张三商贸',
    total_amount: 10000,
    bill_count: 3,
    max_overdue_days: 15,
    status: 'collecting',
    current_level: 0,
    current_handler_id: 10,
    escalation_reason: null,
    extension_until: null,
    ...overrides,
  } as CollectionTask;
}

describe('ar-collection-notify-cards', () => {
  describe('buildEscalationActionCard', () => {
    it('builds card with basic params', () => {
      const card = buildEscalationActionCard(makeTask(), 0, 1);
      expect(card.title).toContain('催收升级');
      expect(card.title).toContain('营销经理');
      expect(card.markdown).toContain('AR-2026-001');
      expect(card.markdown).toContain('张三商贸');
      expect(card.markdown).toContain('营销师');
      expect(card.markdown).toContain('营销经理');
      expect(card.singleTitle).toBe('查看详情');
      expect(card.singleUrl).toContain('collection');
    });

    it('includes escalated by name when provided', () => {
      const card = buildEscalationActionCard(makeTask(), 0, 1, '李四');
      expect(card.markdown).toContain('李四');
    });

    it('uses consumer_code when name is empty', () => {
      const card = buildEscalationActionCard(makeTask({ consumer_name: '' }), 0, 1);
      expect(card.title).toContain('C001');
    });
  });

  describe('buildVerifyResultActionCard', () => {
    it('builds verified card', () => {
      const card = buildVerifyResultActionCard(makeTask(), true);
      expect(card.title).toContain('已通过');
      expect(card.markdown).toContain('核销已确认');
    });

    it('builds rejected card', () => {
      const card = buildVerifyResultActionCard(makeTask(), false);
      expect(card.title).toContain('未通过');
      expect(card.markdown).toContain('核销未通过');
    });

    it('includes verifier name and remark', () => {
      const card = buildVerifyResultActionCard(makeTask(), true, '王五', '确认收款');
      expect(card.markdown).toContain('王五');
      expect(card.markdown).toContain('确认收款');
    });
  });

  describe('buildRollbackActionCard', () => {
    it('builds rollback card', () => {
      const card = buildRollbackActionCard(makeTask(), 1, 0);
      expect(card.title).toContain('催收退回');
      expect(card.title).toContain('营销师');
      expect(card.markdown).toContain('AR-2026-001');
    });

    it('includes rollback by name and restored status', () => {
      const card = buildRollbackActionCard(makeTask(), 1, 0, '赵六', 'extension');
      expect(card.markdown).toContain('赵六');
      expect(card.markdown).toContain('延期中');
    });

    it('uses collecting label for unknown status', () => {
      const card = buildRollbackActionCard(makeTask(), 1, 0, undefined, 'unknown_status');
      expect(card.markdown).toContain('unknown_status');
    });
  });

  describe('buildUpcomingWarningMessage', () => {
    it('builds message for 1 day urgency', () => {
      const msg = buildUpcomingWarningMessage({
        consumerName: '测试客户',
        billCount: 3,
        totalAmount: 5000,
        daysToExpire: 1,
        details: [
          { erpBillId: 'B001', leftAmount: 2000, expireDate: '2026-06-05' },
          { erpBillId: 'B002', leftAmount: 3000, expireDate: '2026-06-05' },
        ],
      });
      expect(msg.title).toContain('紧急');
      expect(msg.title).toContain('1 天后到期');
      expect(msg.content).toContain('测试客户');
    });

    it('builds message for 3 days', () => {
      const msg = buildUpcomingWarningMessage({
        consumerName: '客户A',
        billCount: 1,
        totalAmount: 1000,
        daysToExpire: 3,
        details: [{ erpBillId: 'B1', leftAmount: 1000, expireDate: '2026-06-07' }],
      });
      expect(msg.title).toContain('关注');
    });

    it('truncates details to 5 and shows more text', () => {
      const details = Array.from({ length: 7 }, (_, i) => ({
        erpBillId: `B${i}`,
        leftAmount: 100,
        expireDate: '2026-06-10',
      }));
      const msg = buildUpcomingWarningMessage({
        consumerName: '客户',
        billCount: 7,
        totalAmount: 700,
        daysToExpire: 5,
        details,
      });
      expect(msg.content).toContain('还有 2 笔');
    });
  });

  describe('buildMergedWarningMessage', () => {
    it('builds merged message with warning and notice debts', () => {
      const debts: WarningDebtItem[] = [
        { erpBillId: 'B1', billNo: 'SO-001', consumerName: '客户A', leftAmount: 1000, expireDate: '2026-06-05', daysToExpire: 1, settleMethod: 2 },
        { erpBillId: 'B2', billNo: 'SO-002', consumerName: '客户B', leftAmount: 2000, expireDate: '2026-06-08', daysToExpire: 4, settleMethod: 1 },
      ];
      const msg = buildMergedWarningMessage({ managerName: '李经理', debts });
      expect(msg.title).toContain('逾期预警');
      expect(msg.content).toContain('客户A');
      expect(msg.content).toContain('客户B');
      expect(msg.content).toContain('逾期前2天预警');
      expect(msg.content).toContain('逾期前5天预警');
    });

    it('builds message with only warning-level debts', () => {
      const debts: WarningDebtItem[] = [
        { erpBillId: 'B1', billNo: 'SO-001', consumerName: '客户A', leftAmount: 500, expireDate: '2026-06-05', daysToExpire: 2, settleMethod: 1 },
      ];
      const msg = buildMergedWarningMessage({ managerName: '王经理', debts });
      expect(msg.content).toContain('逾期前2天预警');
      expect(msg.content).not.toContain('逾期前5天预警');
    });

    it('handles empty debts', () => {
      const msg = buildMergedWarningMessage({ managerName: '赵经理', debts: [] });
      expect(msg.title).toContain('0');
      expect(msg.content).toContain('0');
    });
  });
});
