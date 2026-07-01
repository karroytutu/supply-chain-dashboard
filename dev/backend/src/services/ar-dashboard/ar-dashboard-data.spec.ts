// 后端单元测试：ar-dashboard-data.ts（共享数据获取层）
jest.mock('../../utils/logger', () => ({
  createLogger: () => ({ warn: jest.fn(), info: jest.fn(), error: jest.fn(), debug: jest.fn() }),
}));
jest.mock('../../db/appPool', () => ({
  appQuery: jest.fn(),
}));
jest.mock('../erp-debt/erp-debt-enrichment.service', () => ({
  getEnrichedNonHoardDebts: jest.fn(),
  filterHoardDebts: jest.fn((debts: any[]) => debts.filter((d: any) => d.hoardTag !== 'HOARD')),
}));
jest.mock('../ar-collection/ar-warning.query', () => ({
  computeUpcomingWarnings: jest.fn(),
}));

import { buildDashboardContext, fetchCollectionOaInstances } from './ar-dashboard-data';
import { appQuery } from '../../db/appPool';
import { getEnrichedNonHoardDebts } from '../erp-debt/erp-debt-enrichment.service';
import { computeUpcomingWarnings } from '../ar-collection/ar-warning.query';

const mockAppQuery = appQuery as jest.MockedFunction<typeof appQuery>;
const mockGetEnrichedNonHoardDebts = getEnrichedNonHoardDebts as jest.MockedFunction<typeof getEnrichedNonHoardDebts>;
const mockComputeUpcomingWarnings = computeUpcomingWarnings as jest.MockedFunction<typeof computeUpcomingWarnings>;

describe('buildDashboardContext', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('所有数据源成功时返回完整上下文', async () => {
    const debts = [
      { billId: '1', consumerName: 'A客户', managerUsers: '张三', leftAmount: 1000, totalAmount: 2000, isOverdue: false, overdueDays: 0, overdueDateStr: '2026-07-01', hoardTag: 'NORMAL', holdType: null, holdUntil: null, traderId: 1, maxAllowedDays: 7, billTypeName: '销售订单', workTime: '2026-06-01', bizOrderStr: 'XS001', customerMaxDebtAmount: 50000, customerMaxDebtDays: 30, customerMaxDebtOrderNum: 10, settleMethod: 1, consumerExpireDay: 7, writeOffAmount: 0, billNote: '' },
    ] as any[];
    const oaInstances = [
      { id: 1, status: 'pending', form_data: { consumerName: 'A客户', totalAmount: 1000 }, current_node_order: 1, role_code: 'marketer', node_name: '营销师催收', node_status: 'pending' },
    ];
    const warnings = {
      details: [
        { erpBillId: '1', billNo: 'XS001', consumerName: 'A客户', leftAmount: 1000, expireDate: '2026-06-12', daysToExpire: 2, warningLevel: 'high' as const, managerUserName: '张三', managerUserId: 1, reminderCount: 0, settleMethod: 1, consumerExpireDay: 7, hoardTag: null },
      ],
      summary: { today: { count: 0, amount: 0 }, within2Days: { count: 1, amount: 1000 }, within5Days: { count: 0, amount: 0 }, totalCount: 1, totalAmount: 1000 },
      pagination: { page: 1, pageSize: 9999, total: 1 },
    };

    mockGetEnrichedNonHoardDebts.mockResolvedValue(debts);
    mockAppQuery
      .mockResolvedValueOnce({ rows: oaInstances } as any) // OA instances
      .mockResolvedValueOnce({ rows: [
        { finance_sales_amount: '10000' },
        { finance_sales_amount: '20000' },
      ] } as any); // sales details from local table
    mockComputeUpcomingWarnings.mockResolvedValue({
      details: warnings.details,
      summary: warnings.summary,
      pagination: warnings.pagination,
    });

    const ctx = await buildDashboardContext();

    expect(ctx.enrichedDebts).toHaveLength(1);
    expect(ctx.oaInstances).toHaveLength(1);
    expect(ctx.upcomingWarnings).toHaveLength(1);
    expect(ctx.dsoValue).toBeGreaterThan(0);
    // 验证预警计算用的是已获取的欠款数据，而非重新调 ERP
    expect(mockComputeUpcomingWarnings).toHaveBeenCalledWith(
      expect.arrayContaining([expect.objectContaining({ billId: '1' })]),
      { pageSize: 9999 }
    );
  });

  it('单个数据源失败时降级为空数组（Promise.allSettled）', async () => {
    mockGetEnrichedNonHoardDebts.mockRejectedValue(new Error('ERP API 超时'));
    mockAppQuery.mockResolvedValue({ rows: [] } as any);

    const ctx = await buildDashboardContext();

    // ERP 欠款失败 → 空数组，预警计算也被跳过
    expect(ctx.enrichedDebts).toEqual([]);
    expect(ctx.oaInstances).toEqual([]);
    expect(ctx.upcomingWarnings).toEqual([]);
    expect(ctx.dsoValue).toBeNull();
    expect(mockComputeUpcomingWarnings).not.toHaveBeenCalled();
  });

  it('所有数据源失败时不抛异常，返回全空上下文', async () => {
    mockGetEnrichedNonHoardDebts.mockRejectedValue(new Error('fail'));
    mockAppQuery.mockRejectedValue(new Error('fail'));

    const ctx = await buildDashboardContext();

    expect(ctx.enrichedDebts).toEqual([]);
    expect(ctx.oaInstances).toEqual([]);
    expect(ctx.upcomingWarnings).toEqual([]);
    expect(ctx.dsoValue).toBeNull();
  });

  it('DSO 计算：无销售数据时返回 null', async () => {
    mockGetEnrichedNonHoardDebts.mockResolvedValue([
      { leftAmount: 50000, hoardTag: 'NORMAL' } as any,
    ]);
    mockAppQuery.mockResolvedValue({ rows: [] } as any);
    mockComputeUpcomingWarnings.mockResolvedValue({
      details: [], summary: { today: { count: 0, amount: 0 }, within2Days: { count: 0, amount: 0 }, within5Days: { count: 0, amount: 0 }, totalCount: 0, totalAmount: 0 },
      pagination: { page: 1, pageSize: 9999, total: 0 },
    });

    const ctx = await buildDashboardContext();
    expect(ctx.dsoValue).toBeNull();
  });

  it('DSO 计算：有销售数据时正确计算', async () => {
    const debts = [
      { leftAmount: 300000, hoardTag: 'NORMAL' },
      { leftAmount: 200000, hoardTag: 'NORMAL' },
    ] as any[];
    mockGetEnrichedNonHoardDebts.mockResolvedValue(debts);
    mockAppQuery
      .mockResolvedValueOnce({ rows: [] } as any) // OA instances
      .mockResolvedValueOnce({ rows: [
        { finance_sales_amount: '150000' },
        { finance_sales_amount: '150000' },
      ] } as any); // sales details: 30天销售总额 300000 → 日均 10000
    mockComputeUpcomingWarnings.mockResolvedValue({
      details: [], summary: { today: { count: 0, amount: 0 }, within2Days: { count: 0, amount: 0 }, within5Days: { count: 0, amount: 0 }, totalCount: 0, totalAmount: 0 },
      pagination: { page: 1, pageSize: 9999, total: 0 },
    });

    const ctx = await buildDashboardContext();
    // 应收 500000 / 日均 10000 = 50 天
    expect(ctx.dsoValue).toBe(50);
  });
});

describe('fetchCollectionOaInstances', () => {
  beforeEach(() => jest.clearAllMocks());

  it('查询活跃催收 OA 实例', async () => {
    const rows = [
      { id: 1, status: 'pending', form_data: {}, current_node_order: 1, role_code: 'marketer', node_name: '营销师催收', node_status: 'pending' },
    ];
    mockAppQuery.mockResolvedValue({ rows } as any);

    const result = await fetchCollectionOaInstances();
    expect(result).toEqual(rows);
    expect(mockAppQuery).toHaveBeenCalledTimes(1);
    // 验证 SQL 包含正确的表名和条件
    const sql = (mockAppQuery as jest.Mock).mock.calls[0][0] as string;
    expect(sql).toContain('oa_approval_instances');
    expect(sql).toContain('ar_collection');
    expect(sql).toContain('pending');
  });

  it('无数据时返回空数组', async () => {
    mockAppQuery.mockResolvedValue({ rows: [] } as any);
    const result = await fetchCollectionOaInstances();
    expect(result).toEqual([]);
  });
});
