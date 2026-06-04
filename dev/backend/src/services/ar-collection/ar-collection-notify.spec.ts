jest.mock('../../utils/logger', () => ({
  createLogger: () => ({ warn: jest.fn(), info: jest.fn(), error: jest.fn() }),
}));

jest.mock('../../db/appPool', () => ({
  appQuery: jest.fn(),
}));

jest.mock('../dingtalk.service', () => ({
  sendWorkNotification: jest.fn(),
}));

import {
  ESCALATION_LEVEL_NAMES,
  sendCollectionNotification,
  sendCollectionNotificationByRole,
  buildExtensionExpiryMessage,
  buildEscalationMessage,
  buildVerifyResultMessage,
} from './ar-collection-notify';
import { appQuery } from '../../db/appPool';
import { sendWorkNotification } from '../dingtalk.service';
import type { CollectionTask } from './ar-collection.types';

const mockAppQuery = appQuery as jest.Mock;
const mockSendWorkNotification = sendWorkNotification as jest.Mock;

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
    escalation_reason: '超时自动升级',
    extension_until: '2026-06-10',
    ...overrides,
  } as CollectionTask;
}

describe('ar-collection-notify', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('ESCALATION_LEVEL_NAMES', () => {
    it('maps levels correctly', () => {
      expect(ESCALATION_LEVEL_NAMES[0]).toBe('营销师');
      expect(ESCALATION_LEVEL_NAMES[1]).toBe('营销经理');
      expect(ESCALATION_LEVEL_NAMES[2]).toBe('财务');
    });
  });

  describe('sendCollectionNotification', () => {
    it('skips when no valid receivers', async () => {
      mockAppQuery.mockResolvedValue({ rows: [] });
      await sendCollectionNotification({ userIds: [1], title: 'test', content: 'body' });
      expect(mockSendWorkNotification).not.toHaveBeenCalled();
    });

    it('sends notification to valid receivers', async () => {
      mockAppQuery.mockResolvedValue({ rows: [{ dingtalk_user_id: 'dt_001' }] });
      mockSendWorkNotification.mockResolvedValue({ errcode: 0 });
      await sendCollectionNotification({ userIds: [1], title: 'test', content: 'body' });
      expect(mockSendWorkNotification).toHaveBeenCalledWith(['dt_001'], 'test', 'body', undefined);
    });

    it('handles empty userIds', async () => {
      await sendCollectionNotification({ userIds: [], title: 'test', content: 'body' });
      expect(mockSendWorkNotification).not.toHaveBeenCalled();
    });

    it('filters out dev_admin', async () => {
      mockAppQuery.mockResolvedValue({ rows: [{ dingtalk_user_id: 'dev_admin' }] });
      await sendCollectionNotification({ userIds: [1], title: 'test', content: 'body' });
      expect(mockSendWorkNotification).not.toHaveBeenCalled();
    });

    it('handles send failure gracefully', async () => {
      mockAppQuery.mockResolvedValue({ rows: [{ dingtalk_user_id: 'dt_001' }] });
      mockSendWorkNotification.mockRejectedValue(new Error('API error'));
      await sendCollectionNotification({ userIds: [1], title: 'test', content: 'body' });
      // Should not throw
    });

    it('handles query failure', async () => {
      mockAppQuery.mockRejectedValue(new Error('DB error'));
      await sendCollectionNotification({ userIds: [1], title: 'test', content: 'body' });
      expect(mockSendWorkNotification).not.toHaveBeenCalled();
    });
  });

  describe('sendCollectionNotificationByRole', () => {
    it('skips when role has no valid users', async () => {
      mockAppQuery.mockResolvedValue({ rows: [] });
      await sendCollectionNotificationByRole('marketing_manager', 'test', 'body');
      expect(mockSendWorkNotification).not.toHaveBeenCalled();
    });

    it('sends to role users', async () => {
      mockAppQuery.mockResolvedValue({ rows: [{ dingtalk_user_id: 'dt_002' }] });
      mockSendWorkNotification.mockResolvedValue({ errcode: 0 });
      await sendCollectionNotificationByRole('marketing_manager', 'role test', 'body');
      expect(mockSendWorkNotification).toHaveBeenCalledWith(['dt_002'], 'role test', 'body', undefined);
    });

    it('handles query failure', async () => {
      mockAppQuery.mockRejectedValue(new Error('DB error'));
      await sendCollectionNotificationByRole('marketing_manager', 'test', 'body');
      expect(mockSendWorkNotification).not.toHaveBeenCalled();
    });
  });

  describe('buildExtensionExpiryMessage', () => {
    it('builds message with urgency for 1 day left', () => {
      const msg = buildExtensionExpiryMessage(makeTask(), 1);
      expect(msg.title).toContain('紧急');
      expect(msg.title).toContain('延期到期');
      expect(msg.content).toContain('AR-2026-001');
      expect(msg.content).toContain('张三商贸');
    });

    it('builds message without urgency for 3 days left', () => {
      const msg = buildExtensionExpiryMessage(makeTask(), 3);
      expect(msg.title).not.toContain('紧急');
    });

    it('handles null amount', () => {
      const msg = buildExtensionExpiryMessage(makeTask({ total_amount: null }), 2);
      expect(msg.content).toContain('¥0.00');
    });
  });

  describe('buildEscalationMessage', () => {
    it('builds escalation message', () => {
      const msg = buildEscalationMessage(makeTask(), 0, 1);
      expect(msg.title).toContain('催收升级');
      expect(msg.content).toContain('营销师');
      expect(msg.content).toContain('营销经理');
      expect(msg.content).toContain('AR-2026-001');
    });

    it('uses default escalation reason', () => {
      const msg = buildEscalationMessage(makeTask({ escalation_reason: null }), 0, 1);
      expect(msg.content).toContain('催收超时自动升级');
    });
  });

  describe('buildVerifyResultMessage', () => {
    it('builds verified message', () => {
      const msg = buildVerifyResultMessage(makeTask(), true);
      expect(msg.title).toContain('已通过');
      expect(msg.content).toContain('核销已确认');
    });

    it('builds rejected message', () => {
      const msg = buildVerifyResultMessage(makeTask(), false);
      expect(msg.title).toContain('未通过');
      expect(msg.content).toContain('核销未通过');
    });
  });
});
