import {
  buildMergedWarningMessage,
  WarningDebtItem,
} from './ar-collection-notify-cards';

jest.mock('../../utils/logger', () => ({
  createLogger: () => ({ warn: jest.fn(), info: jest.fn(), error: jest.fn() }),
}));

jest.mock('../../config', () => ({
  config: { app: { baseUrl: 'https://example.com' } },
}));

describe('ar-collection-notify-cards', () => {
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
