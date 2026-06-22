// 后端单元测试：ar-dashboard.service.ts（聚合逻辑）
jest.mock('../../utils/logger', () => ({
  createLogger: () => ({ warn: jest.fn(), info: jest.fn(), error: jest.fn(), debug: jest.fn() }),
}));
jest.mock('../../utils/cache', () => ({
  cache: { getWithMeta: jest.fn(), set: jest.fn(), get: jest.fn(), getStale: jest.fn() },
  CACHE_TTL: { DASHBOARD: 60000, HIGH_FREQUENCY: 30000, ERP_SLOW: 300000 },
}));
jest.mock('../../utils/cache-keys', () => ({
  CACHE_KEY: {
    AR_DASHBOARD_OVERVIEW: 'ar:dashboard:overview',
    AR_DASHBOARD_UPCOMING_EXPIRY: 'ar:dashboard:upcoming-expiry',
    AR_DASHBOARD_PIPELINE_EXPIRY: (s: string, l?: number) => `ar:dashboard:pipeline-expiry:${s}:${l ?? 0}`,
    AR_DASHBOARD_LEGAL_PROGRESS: (c: string) => `ar:dashboard:legal-progress:${c}`,
    AR_DASHBOARD_PIPELINE_TIMEOUT: (s: string, l?: number) => `ar:dashboard:pipeline-timeout:${s}:${l ?? 0}`,
  },
}));
jest.mock('../../db/appPool', () => ({ appQuery: jest.fn() }));
jest.mock('../ar-collection/ar-warning.query', () => ({ getUpcomingWarnings: jest.fn() }));
jest.mock('../erp-debt/erp-debt-enrichment.service', () => ({ fetchCustomerData: jest.fn() }));
jest.mock('./ar-dashboard-data', () => ({ buildDashboardContext: jest.fn(), fetchCollectionOaInstances: jest.fn() }));

import { getArDashboardOverview, getUpcomingExpiryCustomers, getPipelineExpiryDetails, getLegalProgressDetails, getPipelineTimeoutDetails } from './ar-dashboard.service';
import { cache } from '../../utils/cache';
import { buildDashboardContext, fetchCollectionOaInstances } from './ar-dashboard-data';
import { getUpcomingWarnings } from '../ar-collection/ar-warning.query';
import type { DashboardContext } from './ar-dashboard.types';

const mockCacheGetWithMeta = cache.getWithMeta as jest.MockedFunction<typeof cache.getWithMeta>;
const mockCacheGetStale = cache.getStale as jest.MockedFunction<typeof cache.getStale>;
const mockCacheSet = cache.set as jest.MockedFunction<typeof cache.set>;
const mockBuildContext = buildDashboardContext as jest.MockedFunction<typeof buildDashboardContext>;
const mockFetchOaInstances = fetchCollectionOaInstances as jest.MockedFunction<typeof fetchCollectionOaInstances>;
const mockGetUpcomingWarnings = getUpcomingWarnings as jest.MockedFunction<typeof getUpcomingWarnings>;

/** 构建测试用的 DashboardContext */
function makeCtx(overrides: Partial<DashboardContext> = {}): DashboardContext {
  return {
    enrichedDebts: [
      { consumerName: 'A客户', managerUsers: '张三', leftAmount: 50000, totalAmount: 80000, isOverdue: true, overdueDays: 15, overdueDateStr: '2026-05-20', billTypeName: '销售订单', workTime: '2026-04-01', bizOrderStr: 'XS001', billId: '1', customerMaxDebtAmount: 100000, settleMethod: 1, consumerExpireDay: 30, hoardTag: 'NORMAL', holdType: null, holdUntil: null, traderId: 1, maxAllowedDays: 30, writeOffAmount: 0, billNote: '' },
      { consumerName: 'B客户', managerUsers: '李四', leftAmount: 30000, totalAmount: 30000, isOverdue: false, overdueDays: 0, overdueDateStr: '2026-07-01', billTypeName: '销售订单', workTime: '2026-06-01', bizOrderStr: 'XS002', billId: '2', customerMaxDebtAmount: 50000, settleMethod: 1, consumerExpireDay: 30, hoardTag: 'NORMAL', holdType: null, holdUntil: null, traderId: 2, maxAllowedDays: 30, writeOffAmount: 0, billNote: '' },
      { consumerName: 'A客户', managerUsers: '张三', leftAmount: 20000, totalAmount: 40000, isOverdue: false, overdueDays: 0, overdueDateStr: '2026-07-10', billTypeName: '销售订单', workTime: '2026-06-10', bizOrderStr: 'XS003', billId: '3', customerMaxDebtAmount: 100000, settleMethod: 1, consumerExpireDay: 30, hoardTag: 'NORMAL', holdType: null, holdUntil: null, traderId: 1, maxAllowedDays: 30, writeOffAmount: 0, billNote: '' },
    ] as any[],
    oaInstances: [
      { id: 1, instance_no: 'OA-001', status: 'pending', submitted_at: new Date('2026-06-01T10:00:00Z'), form_data: { consumerName: 'A客户', totalAmount: 50000, managerName: '张三' }, current_node_order: 1, role_code: 'marketer', node_name: '营销师催收', node_status: 'pending', deadline_at: new Date('2026-06-20T18:00:00Z') },
      { id: 2, instance_no: 'OA-002', status: 'pending', submitted_at: new Date('2026-06-02T10:00:00Z'), form_data: { consumerName: 'C客户', totalAmount: 80000, managerName: '张三', action: 'extension' }, current_node_order: 1, role_code: 'marketer', node_name: '营销师催收', node_status: 'pending', deadline_at: null },
      { id: 3, instance_no: 'OA-003', status: 'processing', submitted_at: new Date('2026-06-03T10:00:00Z'), form_data: { consumerName: 'D客户', totalAmount: 120000, managerName: '李四' }, current_node_order: 2, role_code: 'marketing_manager', node_name: '营销经理催收', node_status: 'pending', deadline_at: new Date('2026-06-25T18:00:00Z') },
    ],
    upcomingWarnings: [
      { consumerName: 'A客户', leftAmount: 20000, expireDate: '2026-06-12', daysToExpire: 2, managerUserName: '张三' },
      { consumerName: 'B客户', leftAmount: 10000, expireDate: '2026-06-13', daysToExpire: 3, managerUserName: '李四' },
    ] as any[],
    dsoValue: 45,
    ...overrides,
  };
}

describe('getArDashboardOverview', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockCacheGetWithMeta.mockReturnValue(null);
    mockCacheGetStale.mockReturnValue(null);
  });

  it('无缓存时等待数据刷新并返回完整结果', async () => {
    mockBuildContext.mockResolvedValue(makeCtx());

    const result = await getArDashboardOverview();

    expect(result.kpiCards).toHaveLength(6);
    expect(result.pipeline.nodes).toHaveLength(5);
    expect(result.pipeline.legalProgress).toBeDefined();
    expect(result.marketers.length).toBeGreaterThan(0);
    expect(result.details.length).toBeGreaterThan(0);
    expect(result.popupData).toBeDefined();
    expect(result.popupData.upcomingExpiryCustomers).toBeDefined();
    expect(result.popupData.pipelineTimeoutDetails).toBeDefined();
    expect(result.popupData.legalProgressDetails).toBeDefined();
    expect(result.updatedAt).toBeDefined();
    expect(mockCacheSet).toHaveBeenCalled();
  });

  it('缓存命中时直接返回并注入新鲜度指标', async () => {
    const cached = { kpiCards: [], pipeline: { nodes: [], legalProgress: { noticeSent: 0, lawsuitFiled: 0, lawsuitInProgress: 0, lawsuitCompleted: 0 } }, marketers: [], details: [], marketerOptions: [], updatedAt: 'cached', cacheAge: 0, isStale: false };
    mockCacheGetWithMeta.mockReturnValue({ data: cached as any, timestamp: Date.now() - 60000, ttl: 300000 });

    const result = await getArDashboardOverview();

    expect(result.cacheAge).toBe(60);
    expect(result.isStale).toBe(false);
    expect(mockBuildContext).not.toHaveBeenCalled();
  });

  it('KPI 卡片数据正确聚合', async () => {
    mockBuildContext.mockResolvedValue(makeCtx());

    const result = await getArDashboardOverview();
    const kpiMap = Object.fromEntries(result.kpiCards.map(k => [k.key, k]));

    // 应收总额 = 50000 + 30000 + 20000 = 100000
    expect(kpiMap.totalReceivable.value).toBe(100000);
    // 逾期总额 = 50000（只有 A客户第一笔 isOverdue=true）
    expect(kpiMap.overdueAmount.value).toBe(50000);
    // 应收客户数 = 2（A客户 + B客户）
    expect(kpiMap.customerCount.value).toBe(2);
    // DSO
    expect(kpiMap.dso.value).toBe(45);
    // 催收中任务 = 2 个（status='pending' 的 OA 实例，id=1和2）
    expect(kpiMap.collectingTasks.value).toBe(2);
    // 即将逾期 = 2 笔
    expect(kpiMap.upcomingExpiry.value).toBe(2);
    expect(kpiMap.upcomingExpiry.auxiliary).toHaveLength(2);
  });

  it('管道节点按 OA 实例角色正确分组', async () => {
    mockBuildContext.mockResolvedValue(makeCtx());

    const result = await getArDashboardOverview();
    const nodes = result.pipeline.nodes;

    // 5 个管道节点
    expect(nodes).toHaveLength(5);

    // 催收中：role_code='marketer' 且无 action → 1个（id=1）
    const collecting = nodes.find(n => n.status === 'collecting' && !n.escalationLevel);
    expect(collecting?.count).toBe(1);

    // 延期：formData.action='extension' → 1个（id=2）
    const extension = nodes.find(n => n.status === 'extension');
    expect(extension?.count).toBe(1);

    // 已升级·经理：role_code='marketing_manager' → 1个（id=3）
    const escalatedL1 = nodes.find(n => n.status === 'escalated' && n.escalationLevel === 1);
    expect(escalatedL1?.count).toBe(1);
  });

  it('DSO 为 null 时 KPI 卡片值为 null', async () => {
    mockBuildContext.mockResolvedValue(makeCtx({ dsoValue: null }));

    const result = await getArDashboardOverview();
    const dsoCard = result.kpiCards.find(k => k.key === 'dso');
    expect(dsoCard?.value).toBeNull();
  });

  it('空数据源时不抛异常，返回零值', async () => {
    mockBuildContext.mockResolvedValue(makeCtx({
      enrichedDebts: [],
      oaInstances: [],
      upcomingWarnings: [],
      dsoValue: null,
    }));

    const result = await getArDashboardOverview();
    expect(result.kpiCards).toHaveLength(6);
    const totalCard = result.kpiCards.find(k => k.key === 'totalReceivable');
    expect(totalCard?.value).toBe(0);
    expect(result.pipeline.nodes).toHaveLength(5);
    result.pipeline.nodes.forEach(n => expect(n.count).toBe(0));
  });

  it('明细表包含全量 ERP 欠款', async () => {
    mockBuildContext.mockResolvedValue(makeCtx());

    const result = await getArDashboardOverview();
    // 3 笔 ERP 欠款 → 3 行明细
    expect(result.details).toHaveLength(3);
    // 账龄区间已计算
    expect(result.details.every(d => d.agingBucket.length > 0)).toBe(true);
    // 日期字段为 YYYY-MM-DD 格式（来自 Date 对象安全转换）
    expect(result.details[0].collectionStartDate).toBe('2026-06-01');
    expect(result.details[0].deadlineAt).toBe('2026-06-20');
  });

  it('营销师统计数据正确聚合', async () => {
    mockBuildContext.mockResolvedValue(makeCtx());

    const result = await getArDashboardOverview();
    // 张三: 2笔欠款(50000+20000), 李四: 1笔(30000)
    expect(result.marketers.length).toBeGreaterThanOrEqual(2);
    const zhangsan = result.marketers.find(m => m.marketerName === '张三');
    expect(zhangsan?.debtCustomerCount).toBe(1); // A客户
    expect(zhangsan?.debtAmount).toBe(70000);
    expect(zhangsan?.collectingCount).toBe(2); // 2 个 OA 实例 managerName='张三'
  });

  it('popupData 包含预计算的弹窗数据', async () => {
    mockBuildContext.mockResolvedValue(makeCtx());

    const result = await getArDashboardOverview();
    const { popupData } = result;

    // 即将逾期客户聚合：从 upcomingWarnings 按客户聚合
    expect(popupData.upcomingExpiryCustomers.length).toBeGreaterThan(0);
    const aCustomer = popupData.upcomingExpiryCustomers.find(c => c.consumerName === 'A客户');
    expect(aCustomer?.billCount).toBe(1);
    expect(aCustomer?.totalAmount).toBe(20000);

    // 管道超时明细：OA 实例有 deadline_at 的会被包含
    expect(Object.keys(popupData.pipelineTimeoutDetails)).toContain('collecting');

    // 诉讼进度明细：4 种分类都有 key
    expect(Object.keys(popupData.legalProgressDetails)).toContain('noticeSent');
    expect(Object.keys(popupData.legalProgressDetails)).toContain('lawsuitFiled');
    expect(Object.keys(popupData.legalProgressDetails)).toContain('lawsuitInProgress');
    expect(Object.keys(popupData.legalProgressDetails)).toContain('lawsuitCompleted');
  });
});

describe('getUpcomingExpiryCustomers', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (cache.get as any) = jest.fn().mockReturnValue(null);
  });

  it('按客户聚合即将逾期数据', async () => {
    mockGetUpcomingWarnings.mockResolvedValue({
      details: [
        { consumerName: 'A客户', leftAmount: 5000, expireDate: '2026-06-12', managerUserName: '张三' },
        { consumerName: 'A客户', leftAmount: 3000, expireDate: '2026-06-11', managerUserName: '张三' },
        { consumerName: 'B客户', leftAmount: 8000, expireDate: '2026-06-13', managerUserName: '李四' },
      ],
      summary: {} as any,
      pagination: { page: 1, pageSize: 9999, total: 3 },
    } as any);

    const result = await getUpcomingExpiryCustomers();

    // A客户合并为 1 条
    expect(result).toHaveLength(2);
    const aCustomer = result.find(c => c.consumerName === 'A客户');
    expect(aCustomer?.billCount).toBe(2);
    expect(aCustomer?.totalAmount).toBe(8000);
    expect(aCustomer?.nearestExpireDate).toBe('2026-06-11'); // 最近的
  });
});

describe('getPipelineExpiryDetails', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (cache.get as any) = jest.fn().mockReturnValue(null);
  });

  it('按 status + escalationLevel 过滤并返回即将逾期明细', async () => {
    const now = new Date();
    const in3Days = new Date(now.getTime() + 3 * 86400000).toISOString().slice(0, 10);

    mockBuildContext.mockResolvedValue({
      enrichedDebts: [
        { consumerName: 'A客户', leftAmount: 10000, isOverdue: false, overdueDateStr: in3Days, bizOrderStr: 'XS001', billId: '1', managerUsers: '张三' },
        { consumerName: 'B客户', leftAmount: 20000, isOverdue: false, overdueDateStr: in3Days, bizOrderStr: 'XS002', billId: '2', managerUsers: '李四' },
        { consumerName: 'C客户', leftAmount: 5000, isOverdue: true, overdueDateStr: in3Days, bizOrderStr: 'XS003', billId: '3', managerUsers: '张三' }, // 已逾期，应被排除
      ] as any[],
      oaInstances: [
        { id: 1, instance_no: 'OA-101', status: 'pending', submitted_at: new Date('2026-06-01'), form_data: { consumerName: 'A客户', action: 'extension' }, current_node_order: 1, role_code: 'marketer', node_name: '营销师催收', node_status: 'pending', deadline_at: null },
        { id: 2, instance_no: 'OA-102', status: 'pending', submitted_at: new Date('2026-06-01'), form_data: { consumerName: 'B客户', action: 'extension' }, current_node_order: 1, role_code: 'marketer', node_name: '营销师催收', node_status: 'pending', deadline_at: null },
        { id: 3, instance_no: 'OA-103', status: 'pending', submitted_at: new Date('2026-06-01'), form_data: { consumerName: 'C客户', action: 'extension' }, current_node_order: 1, role_code: 'marketer', node_name: '营销师催收', node_status: 'pending', deadline_at: null },
      ],
      upcomingWarnings: [],
      dsoValue: null,
    });

    const result = await getPipelineExpiryDetails('extension');

    // C客户已逾期(isOverdue=true)，应被排除，只返回 A、B
    expect(result).toHaveLength(2);
    expect(result.every(r => r.daysToExpire >= 0)).toBe(true);
    // 按 daysToExpire 升序
    expect(result[0].daysToExpire).toBeLessThanOrEqual(result[1].daysToExpire);
  });

  it('无匹配 OA 实例时返回空数组', async () => {
    mockBuildContext.mockResolvedValue({
      enrichedDebts: [],
      oaInstances: [],
      upcomingWarnings: [],
      dsoValue: null,
    });

    const result = await getPipelineExpiryDetails('escalated', 1);
    expect(result).toEqual([]);
  });

  it('escalationLevel 过滤生效', async () => {
    mockBuildContext.mockResolvedValue({
      enrichedDebts: [
        { consumerName: 'A客户', leftAmount: 10000, isOverdue: false, overdueDateStr: new Date(Date.now() + 2 * 86400000).toISOString().slice(0, 10), bizOrderStr: 'XS001', billId: '1', managerUsers: '张三' },
      ] as any[],
      oaInstances: [
        { id: 1, instance_no: 'OA-201', status: 'pending', submitted_at: new Date('2026-06-01'), form_data: { consumerName: 'A客户' }, current_node_order: 2, role_code: 'marketing_manager', node_name: '营销经理催收', node_status: 'pending', deadline_at: null },
      ],
      upcomingWarnings: [],
      dsoValue: null,
    });

    // L1 匹配
    const l1 = await getPipelineExpiryDetails('escalated', 1);
    expect(l1).toHaveLength(1);

    // L2 不匹配
    (cache.get as any).mockReturnValue(null);
    const l2 = await getPipelineExpiryDetails('escalated', 2);
    expect(l2).toHaveLength(0);
  });
});

describe('getLegalProgressDetails', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (cache.get as any) = jest.fn().mockReturnValue(null);
  });

  it('只查 OA 实例，不调用 buildDashboardContext', async () => {
    mockFetchOaInstances.mockResolvedValue([
      { id: 1, instance_no: 'OA-001', status: 'pending', submitted_at: new Date('2026-06-01'), form_data: { action: 'send_letter', consumerName: 'A客户', totalAmount: 50000 }, current_node_order: 1, role_code: 'marketer', node_name: '营销师催收', node_status: 'pending', deadline_at: null },
      { id: 2, instance_no: 'OA-002', status: 'approved', submitted_at: new Date('2026-06-02'), form_data: { action: 'lawsuit', consumerName: 'B客户', totalAmount: 80000 }, current_node_order: 2, role_code: 'current_accountant', node_name: '财务审核', node_status: 'approved', deadline_at: null },
    ] as any[]);

    const result = await getLegalProgressDetails('noticeSent');

    expect(result).toHaveLength(1);
    expect(result[0].action).toBe('send_letter');
    // 验证没有调用 buildDashboardContext（不需要 ERP 数据）
    expect(mockBuildContext).not.toHaveBeenCalled();
    expect(mockFetchOaInstances).toHaveBeenCalledTimes(1);
  });

  it('lawsuitFiled 返回所有 lawsuit 类型', async () => {
    mockFetchOaInstances.mockResolvedValue([
      { id: 1, instance_no: 'OA-001', status: 'pending', submitted_at: new Date('2026-06-01'), form_data: { action: 'lawsuit', consumerName: 'A客户', totalAmount: 50000 }, current_node_order: 1, role_code: 'marketer', node_name: '催收', node_status: 'pending', deadline_at: null },
      { id: 2, instance_no: 'OA-002', status: 'approved', submitted_at: new Date('2026-06-02'), form_data: { action: 'lawsuit', consumerName: 'B客户', totalAmount: 80000 }, current_node_order: 2, role_code: 'current_accountant', node_name: '财务', node_status: 'approved', deadline_at: null },
      { id: 3, instance_no: 'OA-003', status: 'pending', submitted_at: new Date('2026-06-03'), form_data: { action: 'send_letter', consumerName: 'C客户', totalAmount: 30000 }, current_node_order: 1, role_code: 'marketer', node_name: '催收', node_status: 'pending', deadline_at: null },
    ] as any[]);

    const result = await getLegalProgressDetails('lawsuitFiled');
    expect(result).toHaveLength(2);
  });
});

describe('getPipelineTimeoutDetails', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (cache.get as any) = jest.fn().mockReturnValue(null);
  });

  it('只查 OA 实例，不调用 buildDashboardContext', async () => {
    const now = new Date();
    const deadline = new Date(now.getTime() + 12 * 3600000);
    mockFetchOaInstances.mockResolvedValue([
      { id: 1, instance_no: 'OA-001', status: 'pending', submitted_at: new Date('2026-06-01'), form_data: { consumerName: 'A客户', totalAmount: 50000, managerName: '张三' }, current_node_order: 1, role_code: 'marketer', node_name: '营销师催收', node_status: 'pending', deadline_at: deadline },
    ] as any[]);

    const result = await getPipelineTimeoutDetails('collecting');

    expect(result).toHaveLength(1);
    expect(result[0].consumerName).toBe('A客户');
    expect(result[0].remainingHours).toBeGreaterThan(0);
    expect(mockBuildContext).not.toHaveBeenCalled();
    expect(mockFetchOaInstances).toHaveBeenCalledTimes(1);
  });

  it('无 deadline_at 的实例被过滤', async () => {
    mockFetchOaInstances.mockResolvedValue([
      { id: 1, instance_no: 'OA-001', status: 'pending', submitted_at: new Date('2026-06-01'), form_data: { consumerName: 'A客户', totalAmount: 50000 }, current_node_order: 1, role_code: 'marketer', node_name: '营销师催收', node_status: 'pending', deadline_at: null },
    ] as any[]);

    const result = await getPipelineTimeoutDetails('collecting');
    expect(result).toHaveLength(0);
  });
});
