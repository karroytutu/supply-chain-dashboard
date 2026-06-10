/**
 * 催收 Repository 缓存失效函数测试
 * 测试 invalidateTaskCache、invalidateStatsCache
 */

jest.mock('../../utils/logger', () => ({
  createLogger: () => ({ warn: jest.fn(), info: jest.fn(), error: jest.fn() }),
}));

const mockInvalidate = jest.fn();
jest.mock('../../utils/cache', () => ({
  cache: { invalidate: mockInvalidate },
}));

import { invalidateTaskCache, invalidateStatsCache } from './ar-collection.repository';

describe('ar-collection.repository', () => {
  beforeEach(() => {
    mockInvalidate.mockClear();
  });

  describe('invalidateTaskCache', () => {
    it('批量清除任务列表缓存', () => {
      invalidateTaskCache();
      expect(mockInvalidate).toHaveBeenCalledWith('ar:collection:tasks:');
      expect(mockInvalidate).toHaveBeenCalledWith('ar:collection:handlers');
    });

    it('指定 taskId 时清除该任务的详细缓存', () => {
      invalidateTaskCache(42);
      expect(mockInvalidate).toHaveBeenCalledWith('ar:collection:tasks:');
      expect(mockInvalidate).toHaveBeenCalledWith('ar:collection:task:42');
      expect(mockInvalidate).toHaveBeenCalledWith('ar:collection:details:42');
      expect(mockInvalidate).toHaveBeenCalledWith('ar:collection:actions:42');
      expect(mockInvalidate).toHaveBeenCalledWith('ar:collection:legal:42');
      expect(mockInvalidate).toHaveBeenCalledWith('ar:collection:handlers');
    });
  });

  describe('invalidateStatsCache', () => {
    it('清除统计缓存', () => {
      invalidateStatsCache();
      expect(mockInvalidate).toHaveBeenCalledWith('ar:collection:stats:');
    });
  });
});
