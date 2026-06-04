/**
 * 数据总览控制器单元测试
 */

jest.mock('../utils/logger', () => ({
  createLogger: () => ({ warn: jest.fn(), info: jest.fn(), error: jest.fn() }),
}));

jest.mock('../services/overview', () => ({
  getOverviewStats: jest.fn(),
  getOverviewFull: jest.fn(),
  getTrendData: jest.fn(),
}));

import {
  getOverviewStatsController,
  getOverviewFullController,
  getTrendDataController,
} from './overview.controller';
import { getOverviewStats, getOverviewFull, getTrendData } from '../services/overview';
import { createMockRequest, createMockResponse } from '../__tests__/helpers/testFactory';

const mockGetStats = getOverviewStats as jest.MockedFunction<typeof getOverviewStats>;
const mockGetFull = getOverviewFull as jest.MockedFunction<typeof getOverviewFull>;
const mockGetTrend = getTrendData as jest.MockedFunction<typeof getTrendData>;

beforeEach(() => {
  jest.resetAllMocks();
});

describe('getOverviewStatsController', () => {
  it('成功时返回 200 + 统计数据', async () => {
    const stats = { totalSku: 500, warningProductCount: 20 };
    mockGetStats.mockResolvedValueOnce(stats as any);

    const req = createMockRequest();
    const res = createMockResponse();

    await getOverviewStatsController(req, res);

    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ code: 200, data: stats })
    );
  });

  it('异常时返回 500', async () => {
    mockGetStats.mockRejectedValueOnce(new Error('DB error'));

    const req = createMockRequest();
    const res = createMockResponse();

    await getOverviewStatsController(req, res);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ code: 500 })
    );
  });
});

describe('getOverviewFullController', () => {
  it('成功时返回完整概览数据', async () => {
    const fullData = { stats: {}, trend: { data: [] } };
    mockGetFull.mockResolvedValueOnce(fullData as any);

    const req = createMockRequest();
    const res = createMockResponse();

    await getOverviewFullController(req, res);

    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ code: 200, data: fullData })
    );
  });

  it('异常时返回 500', async () => {
    mockGetFull.mockRejectedValueOnce(new Error('timeout'));

    const req = createMockRequest();
    const res = createMockResponse();

    await getOverviewFullController(req, res);

    expect(res.status).toHaveBeenCalledWith(500);
  });
});

describe('getTrendDataController', () => {
  it('使用默认天数 7', async () => {
    mockGetTrend.mockResolvedValueOnce({ data: [], period: '7天' } as any);

    const req = createMockRequest({ query: {} });
    const res = createMockResponse();

    await getTrendDataController(req, res);

    expect(mockGetTrend).toHaveBeenCalledWith(7);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ code: 200 })
    );
  });

  it('使用自定义天数', async () => {
    mockGetTrend.mockResolvedValueOnce({ data: [], period: '14天' } as any);

    const req = createMockRequest({ query: { days: '14' } });
    const res = createMockResponse();

    await getTrendDataController(req, res);

    expect(mockGetTrend).toHaveBeenCalledWith(14);
  });

  it('异常时返回 500', async () => {
    mockGetTrend.mockRejectedValueOnce(new Error('fail'));

    const req = createMockRequest();
    const res = createMockResponse();

    await getTrendDataController(req, res);

    expect(res.status).toHaveBeenCalledWith(500);
  });
});
