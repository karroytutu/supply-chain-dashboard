/**
 * 通知日志服务单元测试
 */

jest.mock('../utils/logger', () => ({
  createLogger: () => ({ info: jest.fn(), error: jest.fn(), warn: jest.fn() }),
}));

jest.mock('../db/appPool', () => ({
  appQuery: jest.fn(),
}));

jest.mock('../config', () => ({
  config: { dingtalk: { agentId: 12345 } },
}));

jest.mock('./dingtalk.service', () => ({
  DEFAULT_RETRY_CONFIG: { maxRetries: 3 },
}));

import { appQuery } from '../db/appPool';
import { mockQueryResult } from '../__tests__/helpers/mockDb';
import {
  createNotificationLog,
  updateNotificationLogStatus,
  getNotificationLogById,
  getNotificationLogByTaskId,
  getPendingRetryLogs,
} from './notification-log.service';

const mockAppQuery = appQuery as jest.MockedFunction<typeof appQuery>;

describe('notification-log.service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('createNotificationLog', () => {
    it('创建推送记录并返回 ID', async () => {
      mockAppQuery.mockResolvedValueOnce(mockQueryResult([{ id: 42 }]));

      const id = await createNotificationLog({
        businessType: 'collection',
        businessId: 100,
        businessNo: 'CS-001',
        msgType: 'actionCard',
        title: '催收通知',
        content: '请及时处理',
        taskId: 999,
        receiverIds: ['user1', 'user2'],
        createdBy: 1,
      });

      expect(id).toBe(42);
      expect(mockAppQuery).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO dingtalk_notification_logs'),
        expect.arrayContaining(['collection', 100, 'CS-001'])
      );
    });
  });

  describe('updateNotificationLogStatus', () => {
    it('通过 ID 更新状态为 sent', async () => {
      mockAppQuery.mockResolvedValueOnce(mockQueryResult([], 1));

      await updateNotificationLogStatus(1, 'sent');

      expect(mockAppQuery).toHaveBeenCalledWith(
        expect.stringContaining("status = $"),
        expect.arrayContaining(['sent'])
      );
    });

    it('无 ID 但有 taskId 时先查找记录', async () => {
      // 第一次查询返回记录
      mockAppQuery.mockResolvedValueOnce(mockQueryResult([{ id: 5, businessType: 'test' }]));
      // 第二次是更新
      mockAppQuery.mockResolvedValueOnce(mockQueryResult([], 1));

      await updateNotificationLogStatus(undefined, 'failed', 999, 'error msg');

      expect(mockAppQuery).toHaveBeenCalledTimes(2);
    });

    it('无 ID 且无 taskId 时直接返回', async () => {
      await updateNotificationLogStatus(undefined, 'failed');

      expect(mockAppQuery).not.toHaveBeenCalled();
    });
  });

  describe('getNotificationLogById', () => {
    it('找到时返回映射后的记录', async () => {
      const row = {
        id: 1,
        businessType: 'ar_collection',
        businessId: 100,
        businessNo: 'CS-001',
        msgType: 'action_card',
        title: '通知',
        content: null,
        taskId: '999',
        receiverIds: ['user1'],
        status: 'sent',
        errorMessage: null,
        retryCount: 0,
        maxRetry: 3,
        nextRetryAt: null,
        createdBy: 1,
        createdAt: '2026-01-01',
        sentAt: '2026-01-01',
        updatedAt: '2026-01-01',
      };
      mockAppQuery.mockResolvedValueOnce(mockQueryResult([row]));

      const result = await getNotificationLogById(1);

      expect(result).not.toBeNull();
      expect(result!.id).toBe(1);
      expect(result!.businessType).toBe('ar_collection');
    });

    it('未找到时返回 null', async () => {
      mockAppQuery.mockResolvedValueOnce(mockQueryResult([]));

      const result = await getNotificationLogById(999);

      expect(result).toBeNull();
    });
  });

  describe('getNotificationLogByTaskId', () => {
    it('通过 taskId 查找记录', async () => {
      const row = {
        id: 1,
        businessType: 'ar_collection',
        businessId: null,
        businessNo: null,
        msgType: 'text',
        title: '通知',
        content: null,
        taskId: '999',
        receiverIds: [],
        status: 'pending',
        errorMessage: null,
        retryCount: 0,
        maxRetry: 3,
        nextRetryAt: null,
        createdBy: null,
        createdAt: '2026-01-01',
        sentAt: null,
        updatedAt: '2026-01-01',
      };
      mockAppQuery.mockResolvedValueOnce(mockQueryResult([row]));

      const result = await getNotificationLogByTaskId(999);

      expect(result).not.toBeNull();
      expect(mockAppQuery).toHaveBeenCalledWith(
        expect.stringContaining('task_id = $1'),
        ['999']
      );
    });

    it('未找到时返回 null', async () => {
      mockAppQuery.mockResolvedValueOnce(mockQueryResult([]));

      expect(await getNotificationLogByTaskId(0)).toBeNull();
    });
  });

  describe('getPendingRetryLogs', () => {
    it('返回待重试记录列表', async () => {
      const rows = [
        {
          id: 1,
          businessType: 'ar_collection',
          businessId: null,
          businessNo: null,
          msgType: 'text',
          title: '重试通知',
          content: null,
          taskId: '1',
          receiverIds: [],
          status: 'failed',
          errorMessage: 'timeout',
          retryCount: 1,
          maxRetry: 3,
          nextRetryAt: '2026-01-01',
          createdBy: null,
          createdAt: '2026-01-01',
          sentAt: null,
          updatedAt: '2026-01-01',
        },
      ];
      mockAppQuery.mockResolvedValueOnce(mockQueryResult(rows));

      const result = await getPendingRetryLogs();

      expect(result).toHaveLength(1);
      expect(result[0].status).toBe('failed');
      expect(result[0].retryCount).toBe(1);
    });

    it('无待重试记录时返回空数组', async () => {
      mockAppQuery.mockResolvedValueOnce(mockQueryResult([]));

      const result = await getPendingRetryLogs();

      expect(result).toEqual([]);
    });
  });
});
