/**
 * 催收欠款富化服务单元测试
 * 测试 enrichDebtRecords 的计算逻辑和 filterHoardDebts 纯函数
 */

jest.mock('../../utils/logger', () => ({
  createLogger: () => ({ warn: jest.fn(), info: jest.fn(), error: jest.fn() }),
}));
jest.mock('../../db/appPool', () => ({ appQuery: jest.fn() }));
jest.mock('../../utils/cache', () => ({
  cache: { get: jest.fn(), set: jest.fn(), invalidate: jest.fn() },
  CACHE_TTL: { HIGH_FREQUENCY: 30000, DASHBOARD: 60000, LOW_FREQUENCY: 300000 },
}));
jest.mock('../../utils/cache-keys', () => ({
  CACHE_KEY: { CUSTOMER_NAME_MAP: 'erp:customer:nameMap', CUSTOMER_LIMITS: 'erp:customer:limits' },
}));
jest.mock('../erp-client/erp-customer.service', () => ({
  searchErpCustomers: jest.fn(),
}));
jest.mock('../erp-client/erp-settlement.service', () => ({
  searchErpSettlementOrders: jest.fn(),
}));

import { enrichDebtRecords, filterHoardDebts } from './erp-debt-enrichment.service';
import { cache } from '../../utils/cache';
import { appQuery } from '../../db/appPool';
import { searchErpCustomers } from '../erp-client/erp-customer.service';
import { searchErpSettlementOrders } from '../erp-client/erp-settlement.service';
import { AR_HOARD_TAG_HOARD, AR_HOARD_TAG_NORMAL } from '../../utils/constants';
import type { ERPDebtRecord, EnrichedDebtRecord } from './erp-debt.types';

const mockCache = cache as jest.Mocked<typeof cache>;
const mockSearchCustomers = searchErpCustomers as jest.MockedFunction<typeof searchErpCustomers>;
const mockSearchSettlement = searchErpSettlementOrders as jest.MockedFunction<typeof searchErpSettlementOrders>;

function createERPDebt(overrides: Partial<ERPDebtRecord> = {}): ERPDebtRecord {
  return {
    billId: 'BILL-001',
    bizOrderStr: 'ORDER-001',
    consumerName: '测试客户',
    managerUsers: '张三',
    totalAmount: 1000,
    leftAmount: 800,
    settleMethod: 1,
    consumerExpireDay: 30,
    billTypeName: '销售单',
    workTime: '2026-05-01',
    hoardTag: null,
    writeOffAmount: 200,
    billNote: 'ORDER-001访销订单',
    ...overrides,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  // 默认缓存命中：客户映射 + 限额
  mockCache.get.mockImplementation((key: string) => {
    if (key.includes('nameMap')) {
      return new Map([['测试客户', 100]]);
    }
    if (key.includes('limits')) {
      return new Map([['测试客户', { traderId: 100, maxDebtOrderNum: 5, maxDebtDays: 60, maxDebtAmount: 100000 }]]);
    }
    return null;
  });
  // 结算单查询默认返回空（无压单标记）
  mockSearchSettlement.mockResolvedValue([]);
  // appQuery 默认返回空（无本地 hold 记录）
  (appQuery as jest.Mock).mockResolvedValue({ rows: [], rowCount: 0 });
});

// ==================== filterHoardDebts（纯函数） ====================

describe('filterHoardDebts', () => {
  it('排除 hoardTag=HOARD 的欠款', () => {
    const debts = [
      { hoardTag: AR_HOARD_TAG_HOARD } as EnrichedDebtRecord,
      { hoardTag: AR_HOARD_TAG_NORMAL } as EnrichedDebtRecord,
      { hoardTag: null } as EnrichedDebtRecord,
    ];
    const result = filterHoardDebts(debts);
    expect(result).toHaveLength(2);
    expect(result.every(d => d.hoardTag !== AR_HOARD_TAG_HOARD)).toBe(true);
  });

  it('空数组返回空', () => {
    expect(filterHoardDebts([])).toEqual([]);
  });

  it('全部 HOARD 时返回空', () => {
    const debts = [
      { hoardTag: AR_HOARD_TAG_HOARD } as EnrichedDebtRecord,
      { hoardTag: AR_HOARD_TAG_HOARD } as EnrichedDebtRecord,
    ];
    expect(filterHoardDebts(debts)).toHaveLength(0);
  });
});

// ==================== enrichDebtRecords ====================

describe('enrichDebtRecords', () => {
  it('空输入返回空数组', async () => {
    const result = await enrichDebtRecords([], new Date('2026-06-01'));
    expect(result).toEqual([]);
  });

  it('正确计算逾期天数', async () => {
    const debts = [createERPDebt({
      workTime: '2026-04-01', // 61天前（假设 now=2026-06-01）
      settleMethod: 1,        // 非消费者到期
      consumerExpireDay: 30,
    })];

    const now = new Date('2026-06-01');
    const result = await enrichDebtRecords(debts, now);

    expect(result).toHaveLength(1);
    // settleMethod=1（非2），maxAllowedDays = AR_DEFAULT_EXPIRE_DAYS = 7
    expect(result[0].maxAllowedDays).toBe(7);
    // ageDays = 61, overdueDays = max(0, 61-7) = 54
    expect(result[0].overdueDays).toBe(54);
    expect(result[0].isOverdue).toBe(true);
  });

  it('settleMethod=2 使用 consumerExpireDay', async () => {
    const debts = [createERPDebt({
      workTime: '2026-05-01',
      settleMethod: 2,         // 消费者到期
      consumerExpireDay: 15,
    })];

    const now = new Date('2026-06-01');
    const result = await enrichDebtRecords(debts, now);

    expect(result[0].maxAllowedDays).toBe(15);
    // ageDays = 31, overdueDays = max(0, 31-15) = 16
    expect(result[0].overdueDays).toBe(16);
    expect(result[0].isOverdue).toBe(true);
  });

  it('未逾期欠款 isOverdue=false', async () => {
    const debts = [createERPDebt({
      workTime: '2026-05-30', // 仅2天前
      settleMethod: 1,
    })];

    const now = new Date('2026-06-01');
    const result = await enrichDebtRecords(debts, now);

    expect(result[0].overdueDays).toBe(0);
    expect(result[0].isOverdue).toBe(false);
  });

  it('填充客户限额数据', async () => {
    const debts = [createERPDebt()];
    const result = await enrichDebtRecords(debts, new Date('2026-06-01'));

    expect(result[0].customerMaxDebtOrderNum).toBe(5);
    expect(result[0].customerMaxDebtDays).toBe(60);
    expect(result[0].customerMaxDebtAmount).toBe(100000);
  });

  it('traderId 从缓存映射中获取', async () => {
    const debts = [createERPDebt()];
    const result = await enrichDebtRecords(debts, new Date('2026-06-01'));

    expect(result[0].traderId).toBe(100);
  });

  it('overdueDateStr 格式正确', async () => {
    const debts = [createERPDebt({
      workTime: '2026-05-01',
      settleMethod: 2,
      consumerExpireDay: 15,
    })];

    const result = await enrichDebtRecords(debts, new Date('2026-06-01'));
    // overdueDate = workTime + maxAllowedDays = 2026-05-01 + 15 = 2026-05-16
    expect(result[0].overdueDateStr).toBe('2026-05-16');
  });
});
