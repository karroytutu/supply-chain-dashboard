jest.mock('../../utils/logger', () => ({
  createLogger: () => ({ warn: jest.fn(), info: jest.fn(), error: jest.fn() }),
}));

jest.mock('../../db/appPool', () => ({
  appQuery: jest.fn(),
}));

jest.mock('./ar-collection-notify', () => ({
  sendCollectionNotification: jest.fn(),
  buildExtensionExpiryMessage: jest.fn(),
}));

import { checkExtensionExpiryReminders } from './ar-collection-reminder.task';
import { appQuery } from '../../db/appPool';
import { sendCollectionNotification, buildExtensionExpiryMessage } from './ar-collection-notify';

const mockAppQuery = appQuery as jest.Mock;
const mockSend = sendCollectionNotification as jest.Mock;
const mockBuildMsg = buildExtensionExpiryMessage as jest.Mock;

describe('ar-collection-reminder.task', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns early when no tasks found', async () => {
    mockAppQuery.mockResolvedValue({ rows: [] });
    await checkExtensionExpiryReminders();
    expect(mockSend).not.toHaveBeenCalled();
  });

  it('sends notifications for extension tasks', async () => {
    const futureDate = new Date();
    futureDate.setDate(futureDate.getDate() + 2);
    mockAppQuery.mockResolvedValue({
      rows: [
        {
          task_no: 'AR-001',
          consumer_name: '客户A',
          extension_until: futureDate.toISOString().slice(0, 10),
          current_handler_id: 10,
        },
      ],
    });
    mockBuildMsg.mockReturnValue({ title: 'test title', content: 'test content' });
    mockSend.mockResolvedValue(undefined);

    await checkExtensionExpiryReminders();
    expect(mockBuildMsg).toHaveBeenCalledTimes(1);
    expect(mockSend).toHaveBeenCalledWith({
      userIds: [10],
      title: 'test title',
      content: 'test content',
    });
  });

  it('skips tasks with negative days left', async () => {
    const pastDate = new Date();
    pastDate.setDate(pastDate.getDate() - 5);
    mockAppQuery.mockResolvedValue({
      rows: [
        {
          task_no: 'AR-002',
          consumer_name: '客户B',
          extension_until: pastDate.toISOString().slice(0, 10),
          current_handler_id: 10,
        },
      ],
    });

    await checkExtensionExpiryReminders();
    expect(mockSend).not.toHaveBeenCalled();
  });

  it('handles send error for individual task', async () => {
    const futureDate = new Date();
    futureDate.setDate(futureDate.getDate() + 1);
    mockAppQuery.mockResolvedValue({
      rows: [
        {
          task_no: 'AR-003',
          consumer_name: '客户C',
          extension_until: futureDate.toISOString().slice(0, 10),
          current_handler_id: 10,
        },
      ],
    });
    mockBuildMsg.mockReturnValue({ title: 't', content: 'c' });
    mockSend.mockRejectedValue(new Error('send error'));

    await checkExtensionExpiryReminders();
    // Should not throw
  });

  it('handles query error', async () => {
    mockAppQuery.mockRejectedValue(new Error('DB error'));
    await checkExtensionExpiryReminders();
    // Should not throw
  });

  it('skips tasks without handler', async () => {
    const futureDate = new Date();
    futureDate.setDate(futureDate.getDate() + 1);
    mockAppQuery.mockResolvedValue({
      rows: [
        {
          task_no: 'AR-004',
          consumer_name: '客户D',
          extension_until: futureDate.toISOString().slice(0, 10),
          current_handler_id: null,
        },
      ],
    });
    mockBuildMsg.mockReturnValue({ title: 't', content: 'c' });

    await checkExtensionExpiryReminders();
    expect(mockSend).not.toHaveBeenCalled();
  });
});
