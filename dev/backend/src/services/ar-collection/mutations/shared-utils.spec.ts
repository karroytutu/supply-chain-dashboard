/**
 * 催收变更共享工具函数单元测试
 */

jest.mock('../../../utils/logger', () => ({
  createLogger: () => ({ info: jest.fn(), error: jest.fn(), warn: jest.fn() }),
}));

jest.mock('../../../db/appPool', () => ({
  appQuery: jest.fn(),
}));

import { appQuery } from '../../../db/appPool';
import { mockQueryResult } from '../../../__tests__/helpers/mockDb';
import {
  mapTaskStatusToDetailStatus,
  getTaskAndValidate,
  logAction,
} from './shared-utils';

const mockAppQuery = appQuery as jest.MockedFunction<typeof appQuery>;

describe('mutations/shared-utils', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('mapTaskStatusToDetailStatus', () => {
    it('collecting → pending', () => {
      expect(mapTaskStatusToDetailStatus('collecting')).toBe('pending');
    });

    it('difference_processing → difference_pending', () => {
      expect(mapTaskStatusToDetailStatus('difference_processing')).toBe('difference_pending');
    });

    it('verified → full_verified', () => {
      expect(mapTaskStatusToDetailStatus('verified')).toBe('full_verified');
    });

    it('closed → full_verified', () => {
      expect(mapTaskStatusToDetailStatus('closed')).toBe('full_verified');
    });

    it('其他状态直接透传', () => {
      expect(mapTaskStatusToDetailStatus('escalated' as any)).toBe('escalated');
    });
  });

  describe('getTaskAndValidate', () => {
    it('找到且状态匹配时返回任务', async () => {
      const task = { id: 1, status: 'collecting', task_no: 'CS-001' };
      mockAppQuery.mockResolvedValueOnce(mockQueryResult([task]));

      const result = await getTaskAndValidate(1, ['collecting']);

      expect(result).toEqual(task);
    });

    it('任务不存在时抛出错误', async () => {
      mockAppQuery.mockResolvedValueOnce(mockQueryResult([]));

      await expect(getTaskAndValidate(999, ['collecting'])).rejects.toThrow('不存在');
    });

    it('状态不匹配时抛出错误', async () => {
      const task = { id: 1, status: 'closed', task_no: 'CS-001' };
      mockAppQuery.mockResolvedValueOnce(mockQueryResult([task]));

      await expect(getTaskAndValidate(1, ['collecting'])).rejects.toThrow('不允许此操作');
    });
  });

  describe('logAction', () => {
    it('记录操作日志（无明细ID）', async () => {
      mockAppQuery.mockResolvedValueOnce(mockQueryResult([], 1));

      await logAction(1, null, 'escalate', 'success', '升级处理', {
        id: 10,
        name: '张三',
        role: 'manager',
      });

      expect(mockAppQuery).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO ar_collection_actions'),
        expect.arrayContaining([1, null, 'escalate', 'success', '升级处理', 10, '张三', 'manager'])
      );
    });

    it('记录操作日志（含明细ID）', async () => {
      mockAppQuery.mockResolvedValueOnce(mockQueryResult([], 1));

      await logAction(1, [100, 200], 'collect', 'success', '催收完成', {
        id: 10,
        name: '张三',
        role: 'marketer',
      });

      expect(mockAppQuery).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO ar_collection_actions'),
        expect.arrayContaining([[100, 200]])
      );
    });
  });
});
