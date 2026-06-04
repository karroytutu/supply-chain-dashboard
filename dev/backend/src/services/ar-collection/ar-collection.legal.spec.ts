/**
 * 法律催收服务单元测试
 */

jest.mock('../../utils/logger', () => ({
  createLogger: () => ({ info: jest.fn(), error: jest.fn(), warn: jest.fn() }),
}));

jest.mock('../../db/appPool', () => ({
  appQuery: jest.fn(),
}));

jest.mock('./ar-collection.repository', () => ({
  invalidateTaskCache: jest.fn(),
  invalidateStatsCache: jest.fn(),
}));

import { appQuery } from '../../db/appPool';
import { mockQueryResult } from '../../__tests__/helpers/mockDb';
import { invalidateTaskCache, invalidateStatsCache } from './ar-collection.repository';
import {
  sendCollectionNotice,
  fileLawsuit,
  updateLegalProgress,
} from './ar-collection.legal';

const mockAppQuery = appQuery as jest.MockedFunction<typeof appQuery>;
const mockInvalidateTask = invalidateTaskCache as jest.MockedFunction<typeof invalidateTaskCache>;
const mockInvalidateStats = invalidateStatsCache as jest.MockedFunction<typeof invalidateStatsCache>;

const mockOperator = { id: 10, name: '张三', role: 'manager' };

describe('ar-collection.legal', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('sendCollectionNotice', () => {
    it('任务存在时成功发送催收函', async () => {
      // ensureTaskExists
      mockAppQuery.mockResolvedValueOnce(mockQueryResult([{ id: 1 }]));
      // INSERT ar_legal_progress
      mockAppQuery.mockResolvedValueOnce(mockQueryResult([], 1));
      // logAction
      mockAppQuery.mockResolvedValueOnce(mockQueryResult([], 1));

      await sendCollectionNotice(
        1,
        { task_id: 1, description: '发送催收函', attachment_url: '/uploads/notice.pdf', operator_id: 10 } as any,
        mockOperator
      );

      expect(mockAppQuery).toHaveBeenCalledTimes(3);
      expect(mockInvalidateTask).toHaveBeenCalledWith(1);
      expect(mockInvalidateStats).toHaveBeenCalled();
    });

    it('任务不存在时抛出错误', async () => {
      mockAppQuery.mockResolvedValueOnce(mockQueryResult([])); // ensureTaskExists 返回空

      await expect(
        sendCollectionNotice(999, { task_id: 999, description: '测试', attachment_url: '', operator_id: 10 } as any, mockOperator)
      ).rejects.toThrow('不存在');
    });
  });

  describe('fileLawsuit', () => {
    it('成功提起诉讼', async () => {
      mockAppQuery.mockResolvedValueOnce(mockQueryResult([{ id: 1 }])); // ensureTaskExists
      mockAppQuery.mockResolvedValueOnce(mockQueryResult([], 1)); // INSERT legal_progress
      mockAppQuery.mockResolvedValueOnce(mockQueryResult([], 1)); // logAction

      await fileLawsuit(
        1,
        { task_id: 1, description: '提起诉讼', attachment_url: '/uploads/lawsuit.pdf', operator_id: 10 } as any,
        mockOperator
      );

      expect(mockAppQuery).toHaveBeenCalledTimes(3);
      expect(mockInvalidateTask).toHaveBeenCalledWith(1);
    });

    it('任务不存在时抛出错误', async () => {
      mockAppQuery.mockResolvedValueOnce(mockQueryResult([]));

      await expect(
        fileLawsuit(999, { task_id: 999, description: '诉讼', operator_id: 10 } as any, mockOperator)
      ).rejects.toThrow('不存在');
    });
  });

  describe('updateLegalProgress', () => {
    it('成功更新法律进展', async () => {
      mockAppQuery.mockResolvedValueOnce(mockQueryResult([{ id: 1 }])); // ensureTaskExists
      mockAppQuery.mockResolvedValueOnce(mockQueryResult([], 1)); // INSERT legal_progress
      mockAppQuery.mockResolvedValueOnce(mockQueryResult([], 1)); // logAction

      await updateLegalProgress(
        1,
        { task_id: 1, description: '法院受理' } as any,
        mockOperator
      );

      expect(mockAppQuery).toHaveBeenCalledTimes(3);
      expect(mockInvalidateTask).toHaveBeenCalledWith(1);
      expect(mockInvalidateStats).toHaveBeenCalled();
    });
  });
});
