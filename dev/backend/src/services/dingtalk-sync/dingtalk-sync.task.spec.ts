/**
 * 钉钉同步定时任务单元测试
 * 测试 task 层逻辑：防并发、日志记录、成功/失败路径、TaskResult 计算
 */

jest.mock('../../utils/logger', () => ({
  createLogger: () => ({ warn: jest.fn(), info: jest.fn(), error: jest.fn() }),
}));

jest.mock('../../utils/errorUtils', () => ({
  getErrorMessage: (e: unknown) => (e instanceof Error ? e.message : String(e)),
}));

const mockSyncDepartments = jest.fn();
const mockSyncUsers = jest.fn();
const mockIncrementalSyncUsers = jest.fn();
jest.mock('./dingtalk-sync.mutation', () => ({
  syncDepartments: mockSyncDepartments,
  syncUsers: mockSyncUsers,
  incrementalSyncUsers: mockIncrementalSyncUsers,
}));

const mockCreateSyncLog = jest.fn();
const mockUpdateSyncLog = jest.fn();
const mockHasRunningSync = jest.fn();
jest.mock('./dingtalk-sync-log.query', () => ({
  createSyncLog: mockCreateSyncLog,
  updateSyncLog: mockUpdateSyncLog,
  hasRunningSync: mockHasRunningSync,
}));

import {
  syncDingtalkDepartments,
  fullSyncDingtalkUsers,
  incrementalSyncDingtalkUsers,
} from './dingtalk-sync.task';

beforeEach(() => {
  jest.clearAllMocks();
  mockHasRunningSync.mockResolvedValue({ running: false });
  mockCreateSyncLog.mockResolvedValue(100);
  mockUpdateSyncLog.mockResolvedValue(undefined);
});

// ==================== syncDingtalkDepartments ====================

describe('syncDingtalkDepartments', () => {
  it('防并发：hasRunningSync 返回 true 时直接返回全零', async () => {
    mockHasRunningSync.mockResolvedValue({ running: true });
    const result = await syncDingtalkDepartments();
    expect(result).toEqual({ processed: 0, succeeded: 0, failed: 0, pending: 0 });
    expect(mockCreateSyncLog).not.toHaveBeenCalled();
  });

  it('成功路径：正确计算 TaskResult', async () => {
    mockSyncDepartments.mockResolvedValue({
      created: 3,
      updated: 5,
      total: 18,
    });
    const result = await syncDingtalkDepartments();
    // processed = deptResult.total
    expect(result.processed).toBe(18);
    // succeeded = created + updated
    expect(result.succeeded).toBe(8);
    expect(result.failed).toBe(0);
    // pending = total - created - updated
    expect(result.pending).toBe(10);
    expect(mockUpdateSyncLog).toHaveBeenCalledWith(
      100,
      expect.objectContaining({ status: 'completed' })
    );
  });

  it('失败路径：mutation 抛异常时记录日志并返回失败结果', async () => {
    mockSyncDepartments.mockRejectedValue(new Error('DB connection failed'));
    const result = await syncDingtalkDepartments();
    expect(result.failed).toBe(1);
    expect(result.succeeded).toBe(0);
    expect(mockUpdateSyncLog).toHaveBeenCalledWith(
      100,
      expect.objectContaining({
        status: 'failed',
        error_message: 'DB connection failed',
      })
    );
  });
});

// ==================== fullSyncDingtalkUsers ====================

describe('fullSyncDingtalkUsers', () => {
  it('防并发检查', async () => {
    mockHasRunningSync.mockResolvedValue({ running: true });
    const result = await fullSyncDingtalkUsers();
    expect(result).toEqual({ processed: 0, succeeded: 0, failed: 0, pending: 0 });
  });

  it('成功路径：调用 syncUsers 并返回正确结果', async () => {
    mockSyncUsers.mockResolvedValue({
      created: 2,
      updated: 8,
      disabled: 1,
      unchanged: 20,
      errors: 0,
    });
    const result = await fullSyncDingtalkUsers();
    expect(result.processed).toBe(31); // 2+8+1+20
    expect(result.succeeded).toBe(11); // 2+8+1
    expect(result.failed).toBe(0);
    expect(result.pending).toBe(20);
  });

  it('失败路径：记录错误', async () => {
    mockSyncUsers.mockRejectedValue(new Error('API timeout'));
    const result = await fullSyncDingtalkUsers();
    expect(result.failed).toBe(1);
    expect(result.succeeded).toBe(0);
    expect(mockUpdateSyncLog).toHaveBeenCalledWith(
      100,
      expect.objectContaining({ status: 'failed' })
    );
  });
});

// ==================== incrementalSyncDingtalkUsers ====================

describe('incrementalSyncDingtalkUsers', () => {
  it('防并发检查', async () => {
    mockHasRunningSync.mockResolvedValue({ running: true });
    const result = await incrementalSyncDingtalkUsers();
    expect(result).toEqual({ processed: 0, succeeded: 0, failed: 0, pending: 0 });
  });

  it('成功路径：调用 incrementalSyncUsers', async () => {
    mockIncrementalSyncUsers.mockResolvedValue({
      created: 1,
      updated: 3,
      disabled: 0,
      unchanged: 50,
      errors: 2,
    });
    const result = await incrementalSyncDingtalkUsers();
    expect(result.processed).toBe(54); // 1+3+0+50
    expect(result.succeeded).toBe(4); // 1+3+0
    expect(result.failed).toBe(2); // errors
    expect(result.pending).toBe(50);
  });

  it('失败路径', async () => {
    mockIncrementalSyncUsers.mockRejectedValue(new Error('rate limit'));
    const result = await incrementalSyncDingtalkUsers();
    expect(result.failed).toBe(1);
    expect(result.succeeded).toBe(0);
  });
});
