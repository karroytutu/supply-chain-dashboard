jest.mock('../../db/appPool', () => ({
  appQuery: jest.fn(),
}));

jest.mock('../../utils/cache', () => ({
  cache: {
    get: jest.fn(),
    set: jest.fn(),
    invalidate: jest.fn(),
  },
  CACHE_TTL: { HIGH_FREQUENCY: 60 },
}));

import {
  getByInstanceId,
  getPendingReminders,
  getOverdueRecords,
  getOverdueAssessmentTargets,
  create,
  updateStatus,
  markOverdueBatch,
  getByApplicant,
  getAll,
} from './credit-license.repository';
import { appQuery } from '../../db/appPool';
import { cache } from '../../utils/cache';

beforeEach(() => {
  jest.resetAllMocks();
});

describe('getByInstanceId', () => {
  it('缓存命中直接返回', async () => {
    const cached = { id: 1, oa_instance_id: 10 };
    (cache.get as jest.Mock).mockReturnValueOnce(cached);
    const result = await getByInstanceId(10);
    expect(result).toBe(cached);
    expect(appQuery).not.toHaveBeenCalled();
  });

  it('缓存未命中查询数据库', async () => {
    (cache.get as jest.Mock).mockReturnValueOnce(null);
    (appQuery as jest.Mock).mockResolvedValueOnce({ rows: [{ id: 1, oa_instance_id: 10 }] });
    const result = await getByInstanceId(10);
    expect(result).toEqual({ id: 1, oa_instance_id: 10 });
    expect(cache.set).toHaveBeenCalled();
  });

  it('查询无结果返回 null', async () => {
    (cache.get as jest.Mock).mockReturnValueOnce(null);
    (appQuery as jest.Mock).mockResolvedValueOnce({ rows: [] });
    const result = await getByInstanceId(99);
    expect(result).toBeNull();
    expect(cache.set).not.toHaveBeenCalled();
  });
});

describe('getPendingReminders', () => {
  it('查询待提醒记录', async () => {
    const rows = [{ id: 1 }, { id: 2 }];
    (appQuery as jest.Mock).mockResolvedValueOnce({ rows });
    const start = new Date('2026-01-01');
    const end = new Date('2026-12-31');
    const result = await getPendingReminders(start, end);
    expect(result).toEqual(rows);
    expect(appQuery).toHaveBeenCalledWith(expect.any(String), [start, end]);
  });
});

describe('getOverdueRecords', () => {
  it('查询过期记录', async () => {
    (appQuery as jest.Mock).mockResolvedValueOnce({ rows: [{ id: 1 }] });
    const result = await getOverdueRecords();
    expect(result).toEqual([{ id: 1 }]);
  });
});

describe('getOverdueAssessmentTargets', () => {
  it('查询逾期考核目标', async () => {
    (appQuery as jest.Mock).mockResolvedValueOnce({ rows: [{ id: 1 }] });
    const result = await getOverdueAssessmentTargets();
    expect(result).toEqual([{ id: 1 }]);
  });
});

describe('create', () => {
  it('创建延期记录', async () => {
    const data = {
      oaInstanceId: 10,
      customerId: 100,
      customerName: 'Test',
      applicantId: 1,
      applicantName: 'Admin',
      deadline: new Date('2026-12-31'),
    };
    (appQuery as jest.Mock).mockResolvedValueOnce({ rows: [{ id: 1, ...data }] });
    const result = await create(data);
    expect(result.id).toBe(1);
    expect(cache.invalidate).toHaveBeenCalled();
  });
});

describe('updateStatus', () => {
  it('更新状态', async () => {
    (appQuery as jest.Mock).mockResolvedValueOnce({ rows: [{ id: 1, status: 'reminded' }] });
    const result = await updateStatus(1, 'reminded');
    expect(result).toEqual({ id: 1, status: 'reminded' });
    expect(cache.invalidate).toHaveBeenCalled();
  });

  it('带额外字段更新', async () => {
    (appQuery as jest.Mock).mockResolvedValueOnce({ rows: [{ id: 1 }] });
    const result = await updateStatus(1, 'completed', { completed_at: new Date() });
    expect(result).toEqual({ id: 1 });
    expect(appQuery).toHaveBeenCalledWith(
      expect.stringContaining('completed_at'),
      expect.any(Array)
    );
  });

  it('无结果返回 null', async () => {
    (appQuery as jest.Mock).mockResolvedValueOnce({ rows: [] });
    const result = await updateStatus(999, 'reminded');
    expect(result).toBeNull();
  });
});

describe('markOverdueBatch', () => {
  it('有记录更新时清除缓存', async () => {
    (appQuery as jest.Mock).mockResolvedValueOnce({ rowCount: 5 });
    const count = await markOverdueBatch();
    expect(count).toBe(5);
    expect(cache.invalidate).toHaveBeenCalled();
  });

  it('无记录时不清缓存', async () => {
    (appQuery as jest.Mock).mockResolvedValueOnce({ rowCount: 0 });
    const count = await markOverdueBatch();
    expect(count).toBe(0);
    expect(cache.invalidate).not.toHaveBeenCalled();
  });
});

describe('getByApplicant', () => {
  it('查询营销员列表', async () => {
    (appQuery as jest.Mock)
      .mockResolvedValueOnce({ rows: [{ count: '3' }] })
      .mockResolvedValueOnce({ rows: [{ id: 1 }, { id: 2 }] });
    const result = await getByApplicant(1, { page: 1, pageSize: 10 });
    expect(result.total).toBe(3);
    expect(result.rows).toEqual([{ id: 1 }, { id: 2 }]);
  });

  it('带 status 过滤', async () => {
    (appQuery as jest.Mock)
      .mockResolvedValueOnce({ rows: [{ count: '1' }] })
      .mockResolvedValueOnce({ rows: [{ id: 1 }] });
    const result = await getByApplicant(1, { page: 1, pageSize: 10, status: 'pending' });
    expect(result.total).toBe(1);
    expect(appQuery).toHaveBeenCalledWith(
      expect.stringContaining('status'),
      expect.any(Array)
    );
  });
});

describe('getAll', () => {
  it('无过滤查询', async () => {
    (appQuery as jest.Mock)
      .mockResolvedValueOnce({ rows: [{ count: '0' }] })
      .mockResolvedValueOnce({ rows: [] });
    const result = await getAll({ page: 1, pageSize: 20 });
    expect(result.total).toBe(0);
    expect(result.rows).toEqual([]);
  });

  it('带 status 和 applicantId 过滤', async () => {
    (appQuery as jest.Mock)
      .mockResolvedValueOnce({ rows: [{ count: '2' }] })
      .mockResolvedValueOnce({ rows: [{ id: 1 }, { id: 2 }] });
    const result = await getAll({ page: 1, pageSize: 10, status: 'overdue', applicantId: 5 });
    expect(result.total).toBe(2);
    expect(appQuery).toHaveBeenCalledWith(
      expect.stringContaining('applicant_id'),
      expect.any(Array)
    );
  });
});
