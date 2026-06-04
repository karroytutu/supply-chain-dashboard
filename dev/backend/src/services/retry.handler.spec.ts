jest.mock('../utils/logger', () => ({
  createLogger: () => ({ warn: jest.fn(), info: jest.fn(), error: jest.fn() }),
}));

jest.mock('./dingtalk.service', () => ({
  getAccessToken: jest.fn(),
  sendDingtalkRequest: jest.fn(),
  DEFAULT_RETRY_CONFIG: { baseDelayMs: 1000, backoffFactor: 2, maxDelayMs: 30000 },
  RETRYABLE_ERROR_CODES: [88001, 90002],
}));

jest.mock('./notification-log.service', () => ({
  getPendingRetryLogs: jest.fn(),
  updateNotificationLogStatus: jest.fn(),
}));

jest.mock('../config', () => ({
  config: { dingtalk: { agentId: 'agent_001' } },
}));

import {
  calculateNextRetry,
  isRetryableError,
  handleRetry,
} from './retry.handler';
import { getAccessToken, sendDingtalkRequest } from './dingtalk.service';
import { getPendingRetryLogs, updateNotificationLogStatus } from './notification-log.service';

const mockGetToken = getAccessToken as jest.Mock;
const mockSendReq = sendDingtalkRequest as jest.Mock;
const mockGetPending = getPendingRetryLogs as jest.Mock;
const mockUpdateStatus = updateNotificationLogStatus as jest.Mock;

describe('retry.handler', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('calculateNextRetry', () => {
    it('calculates delay for first retry', () => {
      const next = calculateNextRetry(0);
      expect(next.getTime()).toBeGreaterThan(Date.now());
    });

    it('increases delay exponentially', () => {
      const t0 = calculateNextRetry(0).getTime();
      const t1 = calculateNextRetry(1).getTime();
      const t2 = calculateNextRetry(2).getTime();
      expect(t1).toBeGreaterThan(t0);
      expect(t2).toBeGreaterThan(t1);
    });

    it('caps at maxDelayMs', () => {
      const t10 = calculateNextRetry(10);
      const t20 = calculateNextRetry(20);
      // Both should be capped, so similar
      expect(Math.abs(t10.getTime() - t20.getTime())).toBeLessThan(1000);
    });
  });

  describe('isRetryableError', () => {
    it('returns true for retryable codes', () => {
      expect(isRetryableError(88001)).toBe(true);
      expect(isRetryableError(90002)).toBe(true);
    });

    it('returns false for non-retryable codes', () => {
      expect(isRetryableError(40001)).toBe(false);
      expect(isRetryableError(0)).toBe(false);
    });
  });

  describe('handleRetry', () => {
    it('returns zeros when no pending logs', async () => {
      mockGetPending.mockResolvedValue([]);
      const result = await handleRetry();
      expect(result).toEqual({ processed: 0, succeeded: 0, failed: 0, pending: 0 });
    });

    it('marks record as failed when exceeding max retries', async () => {
      mockGetPending.mockResolvedValue([
        { id: 1, retryCount: 3, maxRetry: 3, msgType: 'markdown', receiverIds: ['u1'] },
      ]);
      const result = await handleRetry();
      expect(result.failed).toBe(1);
      expect(mockUpdateStatus).toHaveBeenCalledWith(1, 'failed', undefined, '超过最大重试次数');
    });

    it('retries and marks sent on success', async () => {
      mockGetToken.mockResolvedValue('token');
      mockSendReq.mockResolvedValue({ errcode: 0, taskId: 999 });
      mockGetPending.mockResolvedValue([
        { id: 2, retryCount: 0, maxRetry: 3, msgType: 'markdown', receiverIds: ['u1'], title: 'test', content: 'hello' },
      ]);
      const result = await handleRetry();
      expect(result.succeeded).toBe(1);
      expect(mockUpdateStatus).toHaveBeenCalledWith(2, 'sent', 999);
    });

    it('increments retry count on failure', async () => {
      mockGetToken.mockResolvedValue('token');
      mockSendReq.mockResolvedValue({ errcode: 88001, errmsg: 'rate limited' });
      mockGetPending.mockResolvedValue([
        { id: 3, retryCount: 0, maxRetry: 3, msgType: 'markdown', receiverIds: ['u1'], title: 'test', content: 'body' },
      ]);
      const result = await handleRetry();
      expect(result.pending).toBe(1);
    });

    it('handles actionCard message type', async () => {
      mockGetToken.mockResolvedValue('token');
      mockSendReq.mockResolvedValue({ errcode: 0, taskId: 100 });
      const cardContent = JSON.stringify({ title: 'Card', markdown: 'body', singleTitle: 'View', singleUrl: 'http://x' });
      mockGetPending.mockResolvedValue([
        { id: 4, retryCount: 0, maxRetry: 3, msgType: 'actionCard', receiverIds: ['u1'], title: 'test', content: cardContent },
      ]);
      const result = await handleRetry();
      expect(result.succeeded).toBe(1);
    });

    it('handles unsupported message type', async () => {
      mockGetToken.mockResolvedValue('token');
      mockGetPending.mockResolvedValue([
        { id: 5, retryCount: 0, maxRetry: 3, msgType: 'unknown', receiverIds: ['u1'], title: 'test', content: 'body' },
      ]);
      const result = await handleRetry();
      expect(result.pending).toBe(1); // increments retry
    });

    it('handles getPendingRetryLogs error', async () => {
      mockGetPending.mockRejectedValue(new Error('DB error'));
      const result = await handleRetry();
      expect(result).toEqual({ processed: 0, succeeded: 0, failed: 0, pending: 0 });
    });

    it('handles non-retryable error from send', async () => {
      mockGetToken.mockResolvedValue('token');
      mockSendReq.mockResolvedValue({ errcode: 40001, errmsg: 'invalid token' });
      mockGetPending.mockResolvedValue([
        { id: 6, retryCount: 0, maxRetry: 3, msgType: 'markdown', receiverIds: ['u1'], title: 't', content: 'c' },
      ]);
      const result = await handleRetry();
      expect(result.pending).toBe(1);
    });

    it('marks as failed when reaching maxRetry after retry', async () => {
      mockGetToken.mockResolvedValue('token');
      mockSendReq.mockResolvedValue({ errcode: 88001, errmsg: 'limited' });
      mockGetPending.mockResolvedValue([
        { id: 7, retryCount: 2, maxRetry: 3, msgType: 'markdown', receiverIds: ['u1'], title: 't', content: 'c' },
      ]);
      const result = await handleRetry();
      expect(result.failed).toBe(1);
    });
  });
});
