/**
 * 目标管理 ERP 编排服务单元测试
 * @module services/sales-target/sales-target-erp.spec.ts
 */

jest.mock('../../utils/logger', () => ({
  createLogger: () => ({ warn: jest.fn(), info: jest.fn(), error: jest.fn(), debug: jest.fn() }),
}));
jest.mock('../../db/appPool', () => ({ appQuery: jest.fn() }));
jest.mock('../../utils/cache', () => ({
  cache: { get: jest.fn(), set: jest.fn(), invalidate: jest.fn() },
  CACHE_TTL: { DASHBOARD: 60000, HIGH_FREQUENCY: 30000, LOW_FREQUENCY: 300000 },
}));
jest.mock('../erp-client/erp-customer.service', () => ({
  searchErpCustomers: jest.fn(),
}));
jest.mock('../erp-client/erp-product.service', () => ({
  fetchAllProducts: jest.fn(),
}));
jest.mock('../erp-client/erp-inventory.service', () => ({
  getStockSummaryMap: jest.fn(() => new Map()),
}));
jest.mock('../fixed-asset/fixed-asset.query', () => ({
  getErpStaff: jest.fn(),
}));
jest.mock('./sales-target.repository', () => ({
  listTargets: jest.fn(),
  getTargetItems: jest.fn(),
  getTargetItemsByTargetIds: jest.fn(),
}));

import {
  getMarketerErpStaffIds,
} from './sales-target-marketer.service';
import { getCustomerList } from './sales-target-customer.service';
import { getProductCatalog } from './sales-target-product.service';
import { getHistoricalSales } from './sales-target-historical.service';
import { buildInitialTargetData } from './sales-target-init.service';
import { getOverviewData } from './sales-target-overview.service';
import { appQuery } from '../../db/appPool';
import { cache } from '../../utils/cache';
import { searchErpCustomers } from '../erp-client/erp-customer.service';
import { fetchAllProducts } from '../erp-client/erp-product.service';
import { getErpStaff } from '../fixed-asset/fixed-asset.query';
import { listTargets, getTargetItems, getTargetItemsByTargetIds } from './sales-target.repository';

const mockAppQuery = appQuery as jest.MockedFunction<typeof appQuery>;
const mockCache = cache as jest.Mocked<typeof cache>;
const mockSearchCustomers = searchErpCustomers as jest.MockedFunction<typeof searchErpCustomers>;
const mockFetchProducts = fetchAllProducts as jest.MockedFunction<typeof fetchAllProducts>;
const mockGetErpStaff = getErpStaff as jest.MockedFunction<typeof getErpStaff>;
const mockListTargets = listTargets as jest.MockedFunction<typeof listTargets>;
const mockGetTargetItems = getTargetItems as jest.MockedFunction<typeof getTargetItems>;
const mockGetTargetItemsByTargetIds = getTargetItemsByTargetIds as jest.MockedFunction<typeof getTargetItemsByTargetIds>;

beforeEach(() => {
  jest.clearAllMocks();
  mockCache.get.mockReturnValue(null);
});

// =====================================================
// getMarketerErpStaffIds
// =====================================================

describe('getMarketerErpStaffIds', () => {
  it('无 marketer 用户 → 返回空 Set', async () => {
    mockAppQuery.mockResolvedValue({ rows: [] } as any);

    const result = await getMarketerErpStaffIds();
    expect(result.size).toBe(0);
  });

  it('按姓名匹配 ERP staff，返回匹配到的 staff ID Set', async () => {
    mockAppQuery.mockResolvedValue({ rows: [{ name: '张三' }, { name: '李四' }] } as any);
    mockGetErpStaff.mockResolvedValue([
      { id: 101, name: '张三' },
      { id: 102, name: '王五' }, // 不在系统中
    ] as any);

    const result = await getMarketerErpStaffIds();

    expect(result.has(101)).toBe(true);
    expect(result.has(102)).toBe(false);
    expect(result.size).toBe(1);
  });

  it('缓存命中 → 直接返回', async () => {
    const cachedSet = new Set([201]);
    mockCache.get.mockReturnValue(cachedSet as any);

    const result = await getMarketerErpStaffIds();

    expect(result).toBe(cachedSet);
    expect(mockAppQuery).not.toHaveBeenCalled();
  });
});

// =====================================================
// getCustomerList
// =====================================================

describe('getCustomerList', () => {
  it('公海判定：managerId=null → is_public_sea=true', async () => {
    mockSearchCustomers.mockResolvedValue([
      { id: 1, name: '客户A', consumerManagerId: null },
    ] as any);

    const result = await getCustomerList(null, new Set([101]));

    expect(result[0].is_public_sea).toBe(true);
  });

  it('公海判定：managerId 不在 marketerErpStaffIds 中 → is_public_sea=true', async () => {
    mockSearchCustomers.mockResolvedValue([
      { id: 1, name: '客户A', consumerManagerId: 999 },
    ] as any);

    const result = await getCustomerList(null, new Set([101, 102]));

    expect(result[0].is_public_sea).toBe(true);
  });

  it('非公海：managerId 在 marketerErpStaffIds 中 → is_public_sea=false', async () => {
    mockSearchCustomers.mockResolvedValue([
      { id: 1, name: '客户A', consumerManagerId: 101 },
    ] as any);

    const result = await getCustomerList(101, new Set([101, 102]));

    expect(result[0].is_public_sea).toBe(false);
    expect(result[0].consumer_name).toBe('客户A');
  });
});

// =====================================================
// getProductCatalog
// =====================================================

describe('getProductCatalog', () => {
  it('按 categoryChainName 分组，空值归入 "未分类"', async () => {
    mockFetchProducts.mockResolvedValue([
      { goodsId: 1, name: '商品A', categoryChainName: '饮料', pkgUnitName: '箱', baseUnitName: '瓶', pkgWholesale: 10, baseWholesale: 8 },
      { goodsId: 2, name: '商品B', categoryChainName: '', pkgUnitName: null, baseUnitName: '个', pkgWholesale: null, baseWholesale: 5 },
    ] as any);

    const result = await getProductCatalog();

    expect(result).toHaveLength(2);
    const beverage = result.find(c => c.category_name === '饮料');
    const uncategorized = result.find(c => c.category_name === '未分类');
    expect(beverage).toBeDefined();
    expect(uncategorized).toBeDefined();
    expect(uncategorized!.products[0].unit).toBe('个'); // baseUnitName fallback
    expect(uncategorized!.products[0].unit_price).toBe(5); // baseWholesale fallback
  });

  it('结果按 category_name localeCompare 排序', async () => {
    mockFetchProducts.mockResolvedValue([
      { goodsId: 1, name: 'Z', categoryChainName: '零食' },
      { goodsId: 2, name: 'A', categoryChainName: '饮料' },
    ] as any);

    const result = await getProductCatalog();

    expect(result[0].category_name).toBe('零食');
    expect(result[1].category_name).toBe('饮料');
  });
});

// =====================================================
// getHistoricalSales
// =====================================================

describe('getHistoricalSales', () => {
  it('上月+上上月并行聚合', async () => {
    const lastMonthRows = [
      { consumer_id: 1, consumer_name: 'A', goods_id: 101, goods_name: 'P1', finance_sales_amount: '100' },
      { consumer_id: 1, consumer_name: 'A', goods_id: 101, goods_name: 'P1', finance_sales_amount: '50' },
    ];
    const prevMonthRows = [
      { consumer_id: 1, consumer_name: 'A', goods_id: 101, goods_name: 'P1', finance_sales_amount: '80' },
    ];
    mockAppQuery
      .mockResolvedValueOnce({ rows: lastMonthRows } as any)
      .mockResolvedValueOnce({ rows: prevMonthRows } as any);

    const result = await getHistoricalSales(2026, 7);

    expect(result).toHaveLength(1);
    expect(result[0].actual_amount_last_month).toBe(150); // 100+50
    expect(result[0].actual_amount_prev_month).toBe(80);
  });

  it('上上月有但上月无 → 补充记录', async () => {
    mockAppQuery
      .mockResolvedValueOnce({ rows: [] } as any) // 上月空
      .mockResolvedValueOnce({ rows: [
        { consumer_id: 2, consumer_name: 'B', goods_id: 201, goods_name: 'P2', finance_sales_amount: '60' },
      ] } as any);

    const result = await getHistoricalSales(2026, 7);

    const record = result.find(r => r.erp_consumer_id === 2);
    expect(record).toBeDefined();
    expect(record!.actual_amount_last_month).toBe(0);
    expect(record!.actual_amount_prev_month).toBe(60);
  });

  it('NaN 金额 → 0', async () => {
    mockAppQuery
      .mockResolvedValueOnce({ rows: [
        { consumer_id: 1, consumer_name: 'A', goods_id: 101, goods_name: 'P1', finance_sales_amount: 'NaN' },
      ] } as any)
      .mockResolvedValueOnce({ rows: [] } as any);

    const result = await getHistoricalSales(2026, 7);

    expect(result[0].actual_amount_last_month).toBe(0);
  });
});

// =====================================================
// buildInitialTargetData
// =====================================================

describe('buildInitialTargetData', () => {
  it('营销师不存在 → 抛异常', async () => {
    mockAppQuery.mockResolvedValue({ rows: [] } as any);

    await expect(buildInitialTargetData(999, 2026, 7)).rejects.toThrow('营销师不存在');
  });

  it('默认 target_amount = 上月实际达成', async () => {
    mockAppQuery
      .mockResolvedValueOnce({ rows: [{ name: '张三' }] } as any) // user
      .mockResolvedValueOnce({ rows: [{ name: '张三', id: 101 }] } as any) // getMarketerStaffId
      .mockResolvedValueOnce({ rows: [ // sales details
        { consumer_id: 1, consumer_name: '客户A', goods_id: 101, goods_name: '商品A', category_name: '品类1', finance_sales_amount: '500' },
      ] } as any);
    mockGetErpStaff.mockResolvedValue([{ id: 101, name: '张三' }] as any);
    mockSearchCustomers.mockResolvedValue([
      { id: 1, name: '客户A', consumerManagerId: 101 },
    ] as any);

    const result = await buildInitialTargetData(1, 2026, 7);

    expect(result.is_saved).toBe(false);
    expect(result.marketer_name).toBe('张三');
    expect(result.customers).toHaveLength(1);
    expect(result.customers[0].categories[0].products[0].target_amount).toBe(500);
    expect(result.customers[0].categories[0].products[0].actual_amount_last_month).toBe(500);
  });
});

// =====================================================
// getOverviewData
// =====================================================

describe('getOverviewData', () => {
  it('lastMonthActual=0 → growthRate=null（不除零）', async () => {
    // Promise.all 中 appQuery 调用顺序：1.getMarketerUsers(内部appQuery) 2.margin查询 3.客户聚合查询
    mockAppQuery
      .mockResolvedValueOnce({ rows: [{ id: 1, name: '张三' }] } as any) // getMarketerUsers
      .mockResolvedValueOnce({ rows: [] } as any) // margin query
      .mockResolvedValueOnce({ rows: [] } as any); // consumer agg query
    mockGetErpStaff.mockResolvedValue([{ id: 101, name: '张三' }] as any);
    mockListTargets.mockResolvedValue([{ id: 1, marketer_id: 1, status: 'approved' }] as any);
    mockGetTargetItemsByTargetIds.mockResolvedValue(new Map([[1, [{ target_amount: 1000 }]]]) as any);
    mockSearchCustomers.mockResolvedValue([] as any);

    const result = await getOverviewData(2026, 7);

    // 有目标但无上月实际 → growth_rate=null
    const marketer = result.marketers[0];
    expect(marketer.growth_rate).toBeNull();
    expect(marketer.has_saved).toBe(true);
  });

  it('marketerOverviews 包含概览汇总信息', async () => {
    mockAppQuery
      .mockResolvedValueOnce({ rows: [{ id: 1, name: 'A' }] } as any) // getMarketerUsers
      .mockResolvedValueOnce({ rows: [] } as any) // margin query
      .mockResolvedValueOnce({ rows: [] } as any); // consumer agg query
    mockGetErpStaff.mockResolvedValue([{ id: 101, name: 'A' }] as any);
    mockListTargets.mockResolvedValue([{ id: 1, marketer_id: 1, status: 'approved' }] as any);
    mockGetTargetItemsByTargetIds.mockResolvedValue(new Map([[1, [{ target_amount: 1000 }]]]) as any);
    mockSearchCustomers.mockResolvedValue([
      { id: 1, name: 'C1', consumerManagerId: 101 },
    ] as any);

    try {
      const result = await getOverviewData(2026, 7);
      expect(result).toHaveProperty('summary');
      expect(result).toHaveProperty('marketers');
      expect(result.summary).toHaveProperty('marketer_count');
      expect(result.summary).toHaveProperty('growth_rate');
    } catch (e) {
      console.error('getOverviewData error:', e);
      throw e;
    }
  });
});
