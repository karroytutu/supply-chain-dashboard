/**
 * 目标管理查询服务单元测试
 * @module services/sales-target/sales-target-query.spec.ts
 */

jest.mock('../../utils/logger', () => ({
  createLogger: () => ({ warn: jest.fn(), info: jest.fn(), error: jest.fn(), debug: jest.fn() }),
}));
jest.mock('./sales-target.repository', () => ({
  listTargets: jest.fn(),
  getTargetById: jest.fn(),
  getTargetItems: jest.fn(),
}));

import { queryTargetList, queryTargetDetail } from './sales-target-query.service';
import { listTargets, getTargetById, getTargetItems } from './sales-target.repository';
import type { SalesTargetItem } from './sales-target.types';

const mockListTargets = listTargets as jest.MockedFunction<typeof listTargets>;
const mockGetTargetById = getTargetById as jest.MockedFunction<typeof getTargetById>;
const mockGetTargetItems = getTargetItems as jest.MockedFunction<typeof getTargetItems>;

beforeEach(() => jest.clearAllMocks());

describe('queryTargetList', () => {
  it('透传 query 参数到 listTargets', async () => {
    const rows = [{ id: 1, marketer_id: 100, marketer_name: '张三', year: 2026, month: 7 }];
    mockListTargets.mockResolvedValue(rows as any);

    const result = await queryTargetList({ marketer_id: 100 });

    expect(result).toEqual(rows);
    expect(mockListTargets).toHaveBeenCalledWith({ marketer_id: 100 });
  });
});

describe('queryTargetDetail', () => {
  it('目标不存在 → 返回 null', async () => {
    mockGetTargetById.mockResolvedValue(null);

    const result = await queryTargetDetail(999);

    expect(result).toBeNull();
    expect(mockGetTargetItems).not.toHaveBeenCalled();
  });

  it('正确构建三级客户树：customer → category → product', async () => {
    mockGetTargetById.mockResolvedValue({
      id: 1, marketer_id: 100, marketer_name: '张三',
      year: 2026, month: 7, created_at: '2026-07-01', updated_at: '2026-07-01',
    } as any);

    const items: SalesTargetItem[] = [
      {
        id: 1, target_id: 1, erp_consumer_id: 1001, consumer_name: '客户A',
        is_planned_new: false, erp_goods_id: 101, goods_name: '商品A',
        category_name: '品类1', unit: '箱', unit_price: 10, target_amount: 500, remark: '',
        created_at: '2026-07-01',
      },
      {
        id: 2, target_id: 1, erp_consumer_id: 1001, consumer_name: '客户A',
        is_planned_new: false, erp_goods_id: 102, goods_name: '商品B',
        category_name: '品类1', unit: '箱', unit_price: 20, target_amount: 300, remark: '',
        created_at: '2026-07-01',
      },
      {
        id: 3, target_id: 1, erp_consumer_id: 1002, consumer_name: '客户B',
        is_planned_new: true, erp_goods_id: 201, goods_name: '商品C',
        category_name: '品类2', unit: '瓶', unit_price: 15, target_amount: 200, remark: '备注',
        created_at: '2026-07-01',
      },
    ];
    mockGetTargetItems.mockResolvedValue(items);

    const result = await queryTargetDetail(1);

    expect(result).not.toBeNull();
    expect(result!.id).toBe(1);
    expect(result!.marketer_name).toBe('张三');
    expect(result!.customers).toHaveLength(2);

    // 客户A：1个品类，2个商品
    const custA = result!.customers.find(c => c.consumer_name === '客户A');
    expect(custA).toBeDefined();
    expect(custA!.is_planned_new).toBe(false);
    expect(custA!.categories).toHaveLength(1);
    expect(custA!.categories[0].category_name).toBe('品类1');
    expect(custA!.categories[0].products).toHaveLength(2);
    expect(custA!.categories[0].target_amount).toBe(800); // 500+300

    // 客户B：1个品类，1个商品
    const custB = result!.customers.find(c => c.consumer_name === '客户B');
    expect(custB).toBeDefined();
    expect(custB!.is_planned_new).toBe(true);
    expect(custB!.categories[0].products[0].remark).toBe('备注');
  });

  it('category_name 为 null → 归入 "未分类"', async () => {
    mockGetTargetById.mockResolvedValue({
      id: 1, marketer_id: 100, marketer_name: '张三',
      year: 2026, month: 7, created_at: '', updated_at: '',
    } as any);

    mockGetTargetItems.mockResolvedValue([{
      id: 1, target_id: 1, erp_consumer_id: 1001, consumer_name: '客户A',
      is_planned_new: false, erp_goods_id: 101, goods_name: '商品A',
      category_name: null, unit: '箱', unit_price: 10, target_amount: 100, remark: '',
      created_at: '',
    } as any]);

    const result = await queryTargetDetail(1);

    expect(result!.customers[0].categories[0].category_name).toBe('未分类');
  });

  it('target_amount 精度：Math.round(x * 100) / 100', async () => {
    mockGetTargetById.mockResolvedValue({
      id: 1, marketer_id: 100, marketer_name: '张三',
      year: 2026, month: 7, created_at: '', updated_at: '',
    } as any);

    // 3 个商品金额各为 33.33 → 品类合计 99.99，不应出现浮点误差
    mockGetTargetItems.mockResolvedValue([
      { id: 1, target_id: 1, erp_consumer_id: 1001, consumer_name: 'A', is_planned_new: false, erp_goods_id: 1, goods_name: 'P1', category_name: 'C', unit: 'x', unit_price: 0, target_amount: 33.33, remark: '', created_at: '' },
      { id: 2, target_id: 1, erp_consumer_id: 1001, consumer_name: 'A', is_planned_new: false, erp_goods_id: 2, goods_name: 'P2', category_name: 'C', unit: 'x', unit_price: 0, target_amount: 33.33, remark: '', created_at: '' },
      { id: 3, target_id: 1, erp_consumer_id: 1001, consumer_name: 'A', is_planned_new: false, erp_goods_id: 3, goods_name: 'P3', category_name: 'C', unit: 'x', unit_price: 0, target_amount: 33.33, remark: '', created_at: '' },
    ] as any);

    const result = await queryTargetDetail(1);

    // 33.33 + 33.33 + 33.33 = 99.99 (not 99.99000000000001)
    expect(result!.customers[0].categories[0].target_amount).toBe(99.99);
  });

  it('同一 consumer_name 不同 erp_consumer_id → 分为不同客户组', async () => {
    mockGetTargetById.mockResolvedValue({
      id: 1, marketer_id: 100, marketer_name: '张三',
      year: 2026, month: 7, created_at: '', updated_at: '',
    } as any);

    mockGetTargetItems.mockResolvedValue([
      { id: 1, target_id: 1, erp_consumer_id: 1001, consumer_name: '同名客户', is_planned_new: false, erp_goods_id: 1, goods_name: 'P1', category_name: 'C', unit: 'x', unit_price: 0, target_amount: 100, remark: '', created_at: '' },
      { id: 2, target_id: 1, erp_consumer_id: 1002, consumer_name: '同名客户', is_planned_new: false, erp_goods_id: 2, goods_name: 'P2', category_name: 'C', unit: 'x', unit_price: 0, target_amount: 200, remark: '', created_at: '' },
    ] as any);

    const result = await queryTargetDetail(1);

    // 两个不同的 erp_consumer_id 应该分为两个客户
    expect(result!.customers).toHaveLength(2);
    const cust1 = result!.customers.find(c => c.erp_consumer_id === 1001);
    const cust2 = result!.customers.find(c => c.erp_consumer_id === 1002);
    expect(cust1?.categories[0].products[0].target_amount).toBe(100);
    expect(cust2?.categories[0].products[0].target_amount).toBe(200);
  });

  it('空明细时返回空 customers', async () => {
    mockGetTargetById.mockResolvedValue({
      id: 1, marketer_id: 100, marketer_name: '张三',
      year: 2026, month: 7, created_at: '', updated_at: '',
    } as any);
    mockGetTargetItems.mockResolvedValue([]);

    const result = await queryTargetDetail(1);

    expect(result!.customers).toHaveLength(0);
  });
});
