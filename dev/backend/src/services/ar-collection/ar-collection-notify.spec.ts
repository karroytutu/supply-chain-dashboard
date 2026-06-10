jest.mock('../../utils/logger', () => ({
  createLogger: () => ({ warn: jest.fn(), info: jest.fn(), error: jest.fn() }),
}));

jest.mock('../../config', () => ({
  config: { app: { baseUrl: 'https://example.com' } },
}));

import {
  ESCALATION_LEVEL_NAMES,
  buildExtensionExpiryMessage,
} from './ar-collection-notify';
import type { CollectionTask } from './ar-collection.types';

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
    current_handler_id: 10,
    escalation_reason: '超时自动升级',
    extension_until: '2026-06-10',
    ...overrides,
  } as CollectionTask;
}

describe('ar-collection-notify', () => {
  describe('ESCALATION_LEVEL_NAMES', () => {
    it('maps levels correctly', () => {
      expect(ESCALATION_LEVEL_NAMES[0]).toBe('营销师');
      expect(ESCALATION_LEVEL_NAMES[1]).toBe('营销经理');
      expect(ESCALATION_LEVEL_NAMES[2]).toBe('财务');
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
});
