jest.mock('../../utils/logger', () => ({
  createLogger: () => ({ warn: jest.fn(), info: jest.fn(), error: jest.fn() }),
}));
jest.mock('../../utils/errorUtils', () => ({
  getErrorMessage: (e: unknown) => (e instanceof Error ? e.message : String(e)),
}));
jest.mock('../../db/appPool', () => ({
  appQuery: jest.fn(),
  getAppClient: jest.fn(),
}));
jest.mock('../erp-client/erp-snapshot.service', () => ({
  getMonthlyAvailability: jest.fn(),
}));
jest.mock('../erp-client/erp-stock-cost.service', () => ({
  getStockCostByMonth: jest.fn(),
}));
jest.mock('../../utils/dateFormat', () => ({
  formatDateOnly: jest.fn((v: any) => {
    if (v instanceof Date) return v.toISOString().slice(0, 10);
    return String(v).slice(0, 10);
  }),
}));

import { appQuery } from '../../db/appPool';
import { getMonthlyAvailability } from '../erp-client/erp-snapshot.service';
import { getStockCostByMonth } from '../erp-client/erp-stock-cost.service';
import {
  getLastMonthEndDate,
  getMonthFirstDay,
  calculateMonthlyAvailability,
  calculateMonthlyTurnover,
  saveMonthlyArchive,
  getMonthlyArchiveList,
} from './procurement-archive.service';

const mockAppQuery = appQuery as jest.MockedFunction<typeof appQuery>;
const mockGetMonthlyAvailability = getMonthlyAvailability as jest.MockedFunction<typeof getMonthlyAvailability>;
const mockGetStockCostByMonth = getStockCostByMonth as jest.MockedFunction<typeof getStockCostByMonth>;

describe('getLastMonthEndDate', () => {
  it('returns last day of previous month', () => {
    const result = getLastMonthEndDate();
    expect(result).toBeInstanceOf(Date);
    expect(result.getDate()).toBeGreaterThan(0);
  });
});

describe('getMonthFirstDay', () => {
  it('returns the first day of the given month', () => {
    const d = new Date(2026, 2, 15); // March 15, 2026
    const result = getMonthFirstDay(d);
    expect(result.getDate()).toBe(1);
    expect(result.getMonth()).toBe(2);
    expect(result.getFullYear()).toBe(2026);
  });
});

describe('calculateMonthlyAvailability', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns null when no strategic products exist', async () => {
    mockAppQuery.mockResolvedValue({ rows: [], rowCount: 0 } as any);
    const result = await calculateMonthlyAvailability(2026, 3);
    expect(result).toBeNull();
  });

  it('returns availability rate when snapshot data exists', async () => {
    mockAppQuery.mockResolvedValue({
      rows: [{ goods_name: 'A' }, { goods_name: 'B' }],
      rowCount: 2,
    } as any);

    const dailyMap = new Map<string, number>();
    dailyMap.set('2026-03-01', 2); // both in stock
    dailyMap.set('2026-03-02', 1); // 1 in stock
    mockGetMonthlyAvailability.mockResolvedValue(dailyMap);

    const result = await calculateMonthlyAvailability(2026, 3);
    expect(result).not.toBeNull();
    expect(result!.totalSku).toBe(2);
    expect(result!.daysInMonth).toBe(2);
    expect(result!.rate).toBeGreaterThan(0);
  });

  it('returns rate=0 when no daily snapshots available', async () => {
    mockAppQuery.mockResolvedValue({
      rows: [{ goods_name: 'A' }],
      rowCount: 1,
    } as any);
    mockGetMonthlyAvailability.mockResolvedValue(new Map());

    const result = await calculateMonthlyAvailability(2026, 3);
    expect(result!.rate).toBe(0);
    expect(result!.daysInMonth).toBe(0);
  });
});

describe('calculateMonthlyTurnover', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns turnover days and trend', async () => {
    mockGetStockCostByMonth.mockImplementation(async (month: string): Promise<any> => {
      if (month === '2026-03') return { totalCostAmount: 30000 };
      if (month === '2026-02') return { totalCostAmount: 25000 };
      return { totalCostAmount: 0 };
    });

    const result = await calculateMonthlyTurnover(2026, 3);
    expect(result).not.toBeNull();
    expect(result!.days).toBeGreaterThanOrEqual(0);
    expect(typeof result!.trend).toBe('number');
  });

  it('handles January (previous month is December of prior year)', async () => {
    mockGetStockCostByMonth.mockImplementation(async (month: string): Promise<any> => {
      if (month === '2026-01') return { totalCostAmount: 10000 };
      if (month === '2025-12') return { totalCostAmount: 8000 };
      return { totalCostAmount: 0 };
    });

    const result = await calculateMonthlyTurnover(2026, 1);
    expect(result).not.toBeNull();
  });

  it('returns 0 trend when both months have 0 cost', async () => {
    mockGetStockCostByMonth.mockResolvedValue({ totalCostAmount: 0 } as any);
    const result = await calculateMonthlyTurnover(2026, 6);
    expect(result!.trend).toBe(0);
    expect(result!.days).toBe(0);
  });
});

describe('saveMonthlyArchive', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetMonthlyAvailability.mockResolvedValue(new Map());
    mockGetStockCostByMonth.mockResolvedValue({ totalCostAmount: 0 } as any);
    mockAppQuery.mockImplementation(async (sqlOrText: any, params?: any[]) => {
      // For the strategic products query (no params)
      if (typeof sqlOrText === 'string' && sqlOrText.includes('strategic_products')) {
        return { rows: [{ goods_name: 'A' }], rowCount: 1 } as any;
      }
      // For the INSERT
      return { rows: [], rowCount: 1 } as any;
    });
  });

  it('calculates and saves archive to database', async () => {
    const archiveMonth = new Date(2026, 4, 1); // May 2026
    await saveMonthlyArchive(archiveMonth);

    // appQuery called for: strategic_products, getMonthlyAvailability already mocked, INSERT
    expect(mockAppQuery).toHaveBeenCalledTimes(2); // strategic_products + INSERT
  });

  it('uses custom archivedBy', async () => {
    const archiveMonth = new Date(2026, 4, 1);
    await saveMonthlyArchive(archiveMonth, 'manual');

    const insertCall = mockAppQuery.mock.calls.find(
      call => typeof call[0] === 'string' && (call[0] as string).includes('INSERT')
    );
    expect(insertCall).toBeDefined();
    expect(insertCall![1]).toContain('manual');
  });
});

describe('getMonthlyArchiveList', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns paginated archive list', async () => {
    // count query
    mockAppQuery.mockImplementation(async (sql: any, params?: any[]) => {
      if (typeof sql === 'string' && sql.includes('COUNT')) {
        return { rows: [{ total: '2' }], rowCount: 1 } as any;
      }
      return {
        rows: [
          {
            id: 1,
            archive_month: '2026-03-01',
            strategic_availability_rate: '85.5',
            strategic_total_sku: '20',
            strategic_days_in_month: '30',
            turnover_days: '15',
            turnover_previous_days: '18',
            turnover_trend: '-16.7',
            archived_at: '2026-04-01',
            archived_by: 'scheduler',
          },
          {
            id: 2,
            archive_month: '2026-02-01',
            strategic_availability_rate: null,
            strategic_total_sku: null,
            strategic_days_in_month: null,
            turnover_days: null,
            turnover_previous_days: null,
            turnover_trend: null,
            archived_at: '2026-03-01',
            archived_by: null,
          },
        ],
        rowCount: 2,
      } as any;
    });

    const result = await getMonthlyArchiveList({ page: 1, pageSize: 12 });
    expect(result.total).toBe(2);
    expect(result.records).toHaveLength(2);
    expect(result.records[0]!.strategicAvailabilityRate).toBe(85.5);
    expect(result.records[1]!.strategicAvailabilityRate).toBeNull();
    expect(result.records[1]!.archivedBy).toBe('scheduler');
  });

  it('builds WHERE clause when startMonth/endMonth provided', async () => {
    mockAppQuery.mockResolvedValue({ rows: [{ total: '0' }], rowCount: 1 } as any);
    // data query
    mockAppQuery.mockResolvedValueOnce({ rows: [{ total: '0' }], rowCount: 1 } as any);
    mockAppQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 } as any);

    await getMonthlyArchiveList({
      page: 1,
      pageSize: 10,
      startMonth: '2026-01-01',
      endMonth: '2026-06-01',
    });

    // Verify WHERE conditions were built
    const countCall = mockAppQuery.mock.calls[0];
    expect((countCall![0] as string)).toContain('archive_month >=');
    expect((countCall![0] as string)).toContain('archive_month <=');
  });
});
