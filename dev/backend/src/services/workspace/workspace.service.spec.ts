jest.mock('../../utils/logger', () => ({
  createLogger: () => ({ warn: jest.fn(), info: jest.fn(), error: jest.fn() }),
}));
jest.mock('../../utils/errorUtils', () => ({
  getErrorMessage: (e: unknown) => (e instanceof Error ? e.message : String(e)),
}));
jest.mock('../oa/oa.query', () => ({
  getApprovalStats: jest.fn(),
}));
jest.mock('../ar-collection/ar-collection.stats', () => ({
  getCollectionStats: jest.fn(),
}));
jest.mock('../return-order/return-order.repository', () => ({
  getStats: jest.fn(),
}));
jest.mock('../strategic-product/strategic-product.repository', () => ({
  getStats: jest.fn(),
}));
jest.mock('../assessment/assessment.repository', () => ({
  getStats: jest.fn(),
}));
jest.mock('../../utils/cache', () => ({
  cache: {
    get: jest.fn(),
    set: jest.fn(),
  },
  CACHE_TTL: { HIGH_FREQUENCY: 300 },
}));
jest.mock('../../utils/cache-keys', () => ({
  CACHE_KEY: {
    WORKSPACE_DATA: (userId: number) => `workspace:${userId}`,
  },
}));

import { getWorkspaceData } from './workspace.service';
import { getApprovalStats } from '../oa/oa.query';
import { getCollectionStats } from '../ar-collection/ar-collection.stats';
import { getStats as getReturnOrderStats } from '../return-order/return-order.repository';
import { getStats as getStrategicProductStats } from '../strategic-product/strategic-product.repository';
import { getStats as getAssessmentStats } from '../assessment/assessment.repository';
import { cache } from '../../utils/cache';

const mockGetApprovalStats = getApprovalStats as jest.MockedFunction<typeof getApprovalStats>;
const mockGetCollectionStats = getCollectionStats as jest.MockedFunction<typeof getCollectionStats>;
const mockGetReturnOrderStats = getReturnOrderStats as jest.MockedFunction<typeof getReturnOrderStats>;
const mockGetStrategicProductStats = getStrategicProductStats as jest.MockedFunction<typeof getStrategicProductStats>;
const mockGetAssessmentStats = getAssessmentStats as jest.MockedFunction<typeof getAssessmentStats>;
const mockCacheGet = cache.get as jest.MockedFunction<typeof cache.get>;
const mockCacheSet = cache.set as jest.MockedFunction<typeof cache.set>;

describe('getWorkspaceData', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockCacheGet.mockReturnValue(null);
  });

  it('returns cached data when available', async () => {
    const cached = { summary: { totalPending: 5, urgentCount: 1, todayNew: 0, todayDone: 0 }, modules: [] };
    mockCacheGet.mockReturnValue(cached as any);

    const result = await getWorkspaceData(1, ['oa:read'], ['admin']);
    expect(result).toEqual(cached);
  });

  it('fetches all modules for admin user', async () => {
    mockGetApprovalStats.mockResolvedValue({ pending: '3', my: '1', cc: '2' } as any);
    mockGetCollectionStats.mockResolvedValue({
      collecting: { count: '5' },
      waiting: { count: '2' },
      attention: { count: '1' },
    } as any);
    mockGetReturnOrderStats.mockResolvedValue({
      pending_confirm: '1',
      pending_erp_fill: '0',
      pending_warehouse_execute: '3',
    } as any);
    mockGetStrategicProductStats.mockResolvedValue({ pending: '4' } as any);
    mockGetAssessmentStats.mockResolvedValue({
      pending_count: '2',
      today_new: '3',
      today_confirmed: '1',
    } as any);

    const result = await getWorkspaceData(1, ['oa:read', 'ar:collection:read', 'return:read', 'strategic:read', 'assessment:read'], ['admin']);

    expect(result.modules.length).toBeGreaterThan(0);
    expect(result.summary.totalPending).toBeGreaterThan(0);
    expect(result.summary.todayNew).toBe(3);
    expect(result.summary.todayDone).toBe(1);
    expect(mockCacheSet).toHaveBeenCalled();
  });

  it('skips modules user has no permission for', async () => {
    mockGetApprovalStats.mockResolvedValue({ pending: '1', my: '0', cc: '0' } as any);

    const result = await getWorkspaceData(1, ['oa:read'], []);

    // Only OA module should be fetched
    expect(result.modules).toHaveLength(1);
    expect(result.modules[0]!.code).toBe('oa');
    expect(mockGetCollectionStats).not.toHaveBeenCalled();
  });

  it('handles module failures gracefully (Promise.allSettled)', async () => {
    mockGetApprovalStats.mockRejectedValue(new Error('OA service down'));
    mockGetCollectionStats.mockResolvedValue({
      collecting: { count: '1' },
      waiting: { count: '0' },
      attention: { count: '0' },
    } as any);
    mockGetReturnOrderStats.mockResolvedValue({} as any);
    mockGetStrategicProductStats.mockResolvedValue({} as any);
    mockGetAssessmentStats.mockResolvedValue({} as any);

    const result = await getWorkspaceData(1, ['oa:read', 'ar:collection:read', 'return:read', 'strategic:read', 'assessment:read'], ['admin']);

    // Should not throw, OA module should be absent
    const oaModule = result.modules.find(m => m.code === 'oa');
    expect(oaModule).toBeUndefined();
    // Collection module should still be present
    const collModule = result.modules.find(m => m.code === 'collection');
    expect(collModule).toBeDefined();
  });

  it('returns empty data when no permissions at all', async () => {
    const result = await getWorkspaceData(1, [], []);
    expect(result.modules).toHaveLength(0);
    expect(result.summary.totalPending).toBe(0);
  });

  it('counts urgent items correctly', async () => {
    mockGetApprovalStats.mockResolvedValue({ pending: '5', my: '0', cc: '0' } as any);
    mockGetCollectionStats.mockResolvedValue({ collecting: { count: '0' }, waiting: { count: '0' }, attention: { count: '0' } } as any);
    mockGetReturnOrderStats.mockResolvedValue({} as any);
    mockGetStrategicProductStats.mockResolvedValue({} as any);
    mockGetAssessmentStats.mockResolvedValue({} as any);

    const result = await getWorkspaceData(1, ['oa:read', 'ar:collection:read', 'return:read', 'strategic:read', 'assessment:read'], ['admin']);

    // OA pending=5, marked as urgent since > 0
    expect(result.summary.urgentCount).toBe(5);
  });
});
