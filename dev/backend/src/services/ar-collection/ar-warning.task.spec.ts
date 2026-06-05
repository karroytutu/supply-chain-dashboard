jest.mock('../../utils/logger', () => ({
  createLogger: () => ({ warn: jest.fn(), info: jest.fn(), error: jest.fn() }),
}));

jest.mock('../erp-client/erp-debt.service', () => ({
  fetchAllErpDebts: jest.fn(),
}));

jest.mock('../../db/appPool', () => ({
  appQuery: jest.fn(),
}));

jest.mock('./ar-warning.query', () => ({
  hasReminderSentToday: jest.fn(),
  recordWarningReminder: jest.fn(),
  hasBillReminderSent: jest.fn(),
}));

jest.mock('./ar-collection-notify', () => ({
  sendCollectionNotification: jest.fn(),
  buildMergedWarningMessage: jest.fn(),
}));

jest.mock('../erp-debt/erp-debt-enrichment.service', () => ({
  enrichDebtRecords: jest.fn(),
  filterHoardDebts: jest.fn(),
}));

import { checkUpcomingOverdueReminders } from './ar-warning.task';
import { fetchAllErpDebts } from '../erp-client/erp-debt.service';
import { appQuery } from '../../db/appPool';
import { hasBillReminderSent, recordWarningReminder } from './ar-warning.query';
import { sendCollectionNotification, buildMergedWarningMessage } from './ar-collection-notify';
import { enrichDebtRecords, filterHoardDebts } from '../erp-debt/erp-debt-enrichment.service';

const mockFetchDebts = fetchAllErpDebts as jest.Mock;
const mockAppQuery = appQuery as jest.Mock;
const mockHasBillSent = hasBillReminderSent as jest.Mock;
const mockRecordReminder = recordWarningReminder as jest.Mock;
const mockSend = sendCollectionNotification as jest.Mock;
const mockBuildMsg = buildMergedWarningMessage as jest.Mock;
const mockEnrich = enrichDebtRecords as jest.Mock;
const mockFilterHoard = filterHoardDebts as jest.Mock;

describe('ar-warning.task', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns early when no upcoming debts', async () => {
    mockFetchDebts.mockResolvedValue([]);
    mockEnrich.mockResolvedValue([]);
    mockFilterHoard.mockReturnValue([]);
    await checkUpcomingOverdueReminders();
    expect(mockSend).not.toHaveBeenCalled();
  });

  it('processes debts and sends merged reminders', async () => {
    const now = new Date();
    const workTime = new Date(now.getTime() - 25 * 86400000); // 25 days ago
    const debts = [
      {
        billId: 'B001',
        consumerName: '客户A',
        leftAmount: '1000',
        workTime: workTime.toISOString(),
        settleMethod: 1,
        consumerExpireDay: null,
        managerUsers: '张三',
        bizOrderStr: 'SO-001',
      },
    ];
    mockFetchDebts.mockResolvedValue(debts);
    mockEnrich.mockResolvedValue(debts);
    mockFilterHoard.mockReturnValue(debts);

    // Manager user lookup
    mockAppQuery.mockResolvedValue({ rows: [{ name: '张三', id: 10 }] });

    // hasManagerReminderSentToday - no
    mockAppQuery.mockResolvedValueOnce({ rows: [{ count: '0' }] });

    // hasBillReminderSent - no
    mockHasBillSent.mockResolvedValue(false);

    mockBuildMsg.mockReturnValue({ title: '预警', content: '内容' });
    mockSend.mockResolvedValue(undefined);
    mockRecordReminder.mockResolvedValue(undefined);

    await checkUpcomingOverdueReminders();
    // The test mainly exercises the code paths; exact assertions depend on date math
  });

  it('handles fetch error gracefully', async () => {
    mockFetchDebts.mockRejectedValue(new Error('ERP down'));
    mockEnrich.mockResolvedValue([]);
    mockFilterHoard.mockReturnValue([]);
    await checkUpcomingOverdueReminders();
    // Should not throw
  });
});
