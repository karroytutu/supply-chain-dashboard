/**
 * 考核管理查询控制器单元测试
 */

jest.mock('../utils/logger', () => ({
  createLogger: () => ({ warn: jest.fn(), info: jest.fn(), error: jest.fn() }),
}));

jest.mock('../services/assessment', () => ({
  getAssessmentRecords: jest.fn(),
  getAssessmentStats: jest.fn(),
  getMyAssessments: jest.fn(),
  getAssessmentById: jest.fn(),
  getCategoriesConfig: jest.fn(),
}));

import {
  getRecords,
  getStats,
  getMyRecords,
  getCategories,
  getDetail,
} from './assessment-query.controller';
import {
  getAssessmentRecords,
  getAssessmentStats,
  getMyAssessments,
  getAssessmentById,
  getCategoriesConfig,
} from '../services/assessment';
import { createMockRequest, createMockResponse } from '../__tests__/helpers/testFactory';

beforeEach(() => {
  jest.resetAllMocks();
});

describe('getRecords', () => {
  it('成功查询考核记录', async () => {
    const result = { rows: [{ id: 1 }], total: 10 };
    (getAssessmentRecords as jest.Mock).mockResolvedValueOnce(result);

    const req = createMockRequest({
      query: { page: '1', page_size: '20', category: 'return_order' },
    });
    const res = createMockResponse();

    await getRecords(req, res);

    expect(getAssessmentRecords).toHaveBeenCalledWith(
      expect.objectContaining({ page: 1, page_size: 20, category: 'return_order' })
    );
    expect(res.json).toHaveBeenCalledWith({ code: 200, data: result });
  });

  it('支持 camelCase 参数名', async () => {
    (getAssessmentRecords as jest.Mock).mockResolvedValueOnce({ rows: [], total: 0 });

    const req = createMockRequest({
      query: { pageSize: '50', ruleType: 'test_rule', startDate: '2026-01-01', endDate: '2026-12-31' },
    });
    const res = createMockResponse();

    await getRecords(req, res);
    expect(getAssessmentRecords).toHaveBeenCalledWith(
      expect.objectContaining({
        page_size: 50,
        rule_type: 'test_rule',
        start_date: '2026-01-01',
        end_date: '2026-12-31',
      })
    );
  });

  it('异常时返回 500', async () => {
    (getAssessmentRecords as jest.Mock).mockRejectedValueOnce(new Error('fail'));

    const req = createMockRequest();
    const res = createMockResponse();

    await getRecords(req, res);
    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({ code: 500, message: '查询失败' });
  });
});

describe('getStats', () => {
  it('成功获取统计', async () => {
    const stats = { total_amount: '500', pending_count: '3' };
    (getAssessmentStats as jest.Mock).mockResolvedValueOnce(stats);

    const req = createMockRequest({ query: { category: 'return_order' } });
    const res = createMockResponse();

    await getStats(req, res);
    expect(res.json).toHaveBeenCalledWith({ code: 200, data: stats });
  });

  it('不传 category 查询全部', async () => {
    (getAssessmentStats as jest.Mock).mockResolvedValueOnce({});

    const req = createMockRequest({ query: {} });
    const res = createMockResponse();

    await getStats(req, res);
    expect(getAssessmentStats).toHaveBeenCalledWith(undefined);
  });
});

describe('getMyRecords', () => {
  it('成功获取我的考核记录', async () => {
    const result = { rows: [{ id: 1 }], total: 5 };
    (getMyAssessments as jest.Mock).mockResolvedValueOnce(result);

    const req = createMockRequest({
      user: { userId: 42 },
      query: { page: '1', page_size: '10' },
    });
    const res = createMockResponse();

    await getMyRecords(req, res);
    expect(getMyAssessments).toHaveBeenCalledWith(42, expect.objectContaining({ page: 1 }));
    expect(res.json).toHaveBeenCalledWith({ code: 200, data: result });
  });

  it('未登录时返回 401', async () => {
    const req = createMockRequest({ user: {} });
    const res = createMockResponse();

    await getMyRecords(req, res);
    expect(res.status).toHaveBeenCalledWith(401);
  });
});

describe('getCategories', () => {
  it('成功获取分类配置', async () => {
    const config = [{ category: 'return_order', rules: [] }];
    (getCategoriesConfig as jest.Mock).mockResolvedValueOnce(config);

    const req = createMockRequest();
    const res = createMockResponse();

    await getCategories(req, res);
    expect(res.json).toHaveBeenCalledWith({ code: 200, data: config });
  });
});

describe('getDetail', () => {
  it('成功获取详情', async () => {
    const record = { id: 1, category: 'return_order', penalty_amount: '100' };
    (getAssessmentById as jest.Mock).mockResolvedValueOnce(record);

    const req = createMockRequest({ params: { id: '1' } });
    const res = createMockResponse();

    await getDetail(req, res);
    expect(res.json).toHaveBeenCalledWith({ code: 200, data: record });
  });

  it('无效 ID 返回 400', async () => {
    const req = createMockRequest({ params: { id: 'abc' } });
    const res = createMockResponse();

    await getDetail(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ code: 400, message: '无效的记录ID' });
  });

  it('不存在时返回 404', async () => {
    (getAssessmentById as jest.Mock).mockResolvedValueOnce(null);

    const req = createMockRequest({ params: { id: '999' } });
    const res = createMockResponse();

    await getDetail(req, res);
    expect(res.status).toHaveBeenCalledWith(404);
  });
});
