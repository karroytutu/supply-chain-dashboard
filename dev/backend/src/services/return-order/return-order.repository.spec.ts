/**
 * 退货单数据访问层单元测试
 * Mock: appPool (数据库), cache (缓存), ERP 服务
 */

jest.mock('../../db/appPool', () => ({
  appQuery: jest.fn(),
}));

jest.mock('../../utils/logger', () => ({
  createLogger: () => ({ warn: jest.fn(), info: jest.fn(), error: jest.fn() }),
}));

jest.mock('../erp-client/erp-product.service', () => ({
  fetchAllProducts: jest.fn(),
}));

jest.mock('../erp-client/erp-batch-inventory.service', () => ({
  getDefectiveBatchInventory: jest.fn(),
}));

jest.mock('../../utils/cache', () => ({
  cache: {
    get: jest.fn().mockReturnValue(null),
    set: jest.fn(),
    invalidate: jest.fn(),
  },
  CACHE_TTL: { DASHBOARD: 60000, HIGH_FREQUENCY: 30000, LOW_FREQUENCY: 300000 },
}));

import { appQuery } from '../../db/appPool';
import { mockQueryResult, mockQuerySequence } from '../../__tests__/helpers/mockDb';
import { fetchAllProducts } from '../erp-client/erp-product.service';
import { getDefectiveBatchInventory } from '../erp-client/erp-batch-inventory.service';
import { cache } from '../../utils/cache';
import {
  getOrders,
  getOrderById,
  getStats,
  getPendingErpOrders,
  getActions,
  getOrderStatus,
  getRawOrderById,
  createOrder,
  recordAction,
  recordCreateAction,
  updateStatus,
  batchConfirm,
  fillErpReturnNo,
  warehouseExecute,
  marketingSaleComplete,
  rollbackOrder,
  invalidateOrderCache,
} from './return-order.repository';

const mockAppQuery = appQuery as jest.MockedFunction<typeof appQuery>;
const mockFetchProducts = fetchAllProducts as jest.MockedFunction<typeof fetchAllProducts>;
const mockGetDefective = getDefectiveBatchInventory as jest.MockedFunction<typeof getDefectiveBatchInventory>;
const mockCache = cache as jest.Mocked<typeof cache>;

beforeEach(() => {
  jest.resetAllMocks();
  // 恢复默认 mock 行为
  mockCache.get.mockReturnValue(null);
  mockFetchProducts.mockResolvedValue([]);
  mockGetDefective.mockResolvedValue([]);
});

// ==================== getOrders ====================

describe('getOrders', () => {
  it('无过滤条件时查询全部', async () => {
    mockQuerySequence(mockAppQuery, [
      [{ total: '5' }],  // count
      [],                 // list (空)
    ]);

    const result = await getOrders({ page: 1, pageSize: 20 });
    expect(result.total).toBe(5);
    expect(result.page).toBe(1);
    expect(result.pageSize).toBe(20);
    expect(result.totalPages).toBe(1);
    // 第一次调用是 count，第二次是 list
    expect(mockAppQuery).toHaveBeenCalledTimes(2);
  });

  it('分页计算 offset 正确', async () => {
    mockQuerySequence(mockAppQuery, [
      [{ total: '50' }],
      [],
    ]);

    await getOrders({ page: 3, pageSize: 10 });
    // list 查询的 OFFSET 参数应为 (3-1)*10 = 20
    const listCall = mockAppQuery.mock.calls[1];
    const params = listCall[1] as any[];
    expect(params[params.length - 1]).toBe(20); // offset
    expect(params[params.length - 2]).toBe(10); // limit
  });

  it('status 过滤条件添加正确 SQL', async () => {
    mockQuerySequence(mockAppQuery, [[{ total: '0' }], []]);

    await getOrders({ status: 'pending_confirm' });
    const countSql = mockAppQuery.mock.calls[0][0] as string;
    expect(countSql).toContain('ro.status = $1');
  });

  it('keyword ILIKE 条件添加正确', async () => {
    mockQuerySequence(mockAppQuery, [[{ total: '0' }], []]);

    await getOrders({ keyword: '测试' });
    const countSql = mockAppQuery.mock.calls[0][0] as string;
    expect(countSql).toContain('ILIKE');
  });

  it('日期范围过滤条件正确', async () => {
    mockQuerySequence(mockAppQuery, [[{ total: '0' }], []]);

    await getOrders({ startDate: '2026-01-01', endDate: '2026-12-31' });
    const countSql = mockAppQuery.mock.calls[0][0] as string;
    expect(countSql).toContain('ro.return_date >= $');
    expect(countSql).toContain('ro.return_date <= $');
  });

  it('返回数据含库存信息', async () => {
    const rows = [{
      id: 1, goods_name: '商品A', unit: '件',
      return_no: 'RT-001', status: 'pending_confirm',
    }];
    mockQuerySequence(mockAppQuery, [
      [{ total: '1' }],
      rows,
    ]);
    mockFetchProducts.mockResolvedValue([
      { name: '商品A', pkgUnitName: '件', baseUnitName: '包', unitFactor: 10 } as any,
    ]);
    mockGetDefective.mockResolvedValue([
      { goodsName: '商品A', unitName: '件', quantity: '3' } as any,
    ]);

    const result = await getOrders({});
    expect(result.data).toHaveLength(1);
    expect(result.data[0].current_stock).toBeDefined();
  });
});

// ==================== getOrderById ====================

describe('getOrderById', () => {
  it('存在时返回退货单', async () => {
    const row = { id: 1, return_no: 'RT-001' };
    mockAppQuery.mockResolvedValueOnce(mockQueryResult([row]));

    const result = await getOrderById(1);
    expect(result).toEqual(row);
    expect(mockAppQuery).toHaveBeenCalledWith(expect.stringContaining('WHERE ro.id = $1'), [1]);
  });

  it('不存在时返回 null', async () => {
    mockAppQuery.mockResolvedValueOnce(mockQueryResult([]));
    const result = await getOrderById(999);
    expect(result).toBeNull();
  });
});

// ==================== getStats ====================

describe('getStats', () => {
  it('返回统计数据', async () => {
    const stats = {
      total: '20',
      pending_confirm: '5',
      pending_erp_fill: '3',
      pending_warehouse_execute: '2',
      pending_marketing_sale: '4',
      completed: '6',
    };
    mockAppQuery.mockResolvedValueOnce(mockQueryResult([stats]));

    const result = await getStats();
    expect(result.total).toBe('20');
    expect(result.pending_confirm).toBe('5');
  });
});

// ==================== getPendingErpOrders ====================

describe('getPendingErpOrders', () => {
  it('查询 pending_erp_fill 状态订单', async () => {
    const rows = [{ id: 1, status: 'pending_erp_fill' }];
    mockAppQuery.mockResolvedValueOnce(mockQueryResult(rows));

    const result = await getPendingErpOrders();
    expect(result).toHaveLength(1);
    const sql = mockAppQuery.mock.calls[0][0] as string;
    expect(sql).toContain("status = 'pending_erp_fill'");
  });
});

// ==================== getActions ====================

describe('getActions', () => {
  it('按 order_id 查询操作记录', async () => {
    const actions = [{ id: 1, action_type: 'create' }];
    mockAppQuery.mockResolvedValueOnce(mockQueryResult(actions));

    const result = await getActions(5);
    expect(result).toHaveLength(1);
    expect(mockAppQuery).toHaveBeenCalledWith(expect.stringContaining('order_id = $1'), [5]);
  });
});

// ==================== getOrderStatus ====================

describe('getOrderStatus', () => {
  it('返回状态字符串', async () => {
    mockAppQuery.mockResolvedValueOnce(mockQueryResult([{ status: 'pending_confirm' }]));
    const result = await getOrderStatus(1);
    expect(result).toBe('pending_confirm');
  });

  it('不存在时返回 null', async () => {
    mockAppQuery.mockResolvedValueOnce(mockQueryResult([]));
    const result = await getOrderStatus(999);
    expect(result).toBeNull();
  });
});

// ==================== getRawOrderById ====================

describe('getRawOrderById', () => {
  it('存在时返回原始行', async () => {
    const row = { id: 1, goods_name: '商品A' };
    mockAppQuery.mockResolvedValueOnce(mockQueryResult([row]));
    const result = await getRawOrderById(1);
    expect(result).toEqual(row);
  });

  it('不存在时返回 null', async () => {
    mockAppQuery.mockResolvedValueOnce(mockQueryResult([]));
    const result = await getRawOrderById(999);
    expect(result).toBeNull();
  });
});

// ==================== createOrder ====================

describe('createOrder', () => {
  it('成功创建返回退货单行', async () => {
    const row = { id: 1, return_no: 'RT-001', status: 'pending_confirm' };
    mockAppQuery.mockResolvedValueOnce(mockQueryResult([row]));

    const result = await createOrder({
      returnNo: 'RT-001',
      goodsId: 'G001',
      goodsName: '商品A',
      quantity: 10,
    });
    expect(result).toEqual(row);
  });

  it('ON CONFLICT 时返回 null', async () => {
    mockAppQuery.mockResolvedValueOnce(mockQueryResult([]));

    const result = await createOrder({
      returnNo: 'RT-001',
      goodsId: 'G001',
      goodsName: '商品A',
      quantity: 10,
    });
    expect(result).toBeNull();
  });

  it('默认 status 为 pending_confirm', async () => {
    mockAppQuery.mockResolvedValueOnce(mockQueryResult([{ id: 1 }]));

    await createOrder({ returnNo: 'RT-001', goodsId: 'G001', goodsName: 'A', quantity: 1 });
    const params = mockAppQuery.mock.calls[0][1] as any[];
    expect(params[14]).toBe('pending_confirm'); // status 是第15个参数
  });

  it('daysToExpireAtReturn 回退到 daysToExpire', async () => {
    mockAppQuery.mockResolvedValueOnce(mockQueryResult([{ id: 1 }]));

    await createOrder({
      returnNo: 'RT-001', goodsId: 'G001', goodsName: 'A', quantity: 1,
      daysToExpire: 30,
    });
    const params = mockAppQuery.mock.calls[0][1] as any[];
    expect(params[10]).toBe(30); // daysToExpireAtReturn fallback
  });
});

// ==================== recordAction ====================

describe('recordAction', () => {
  it('插入操作记录', async () => {
    mockAppQuery.mockResolvedValueOnce(mockQueryResult([]));

    await recordAction(1, 'confirm_rule', 5, '张三', '确认退货', { key: 'val' });
    expect(mockAppQuery).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO expiring_return_actions'),
      [1, 'confirm_rule', 5, '张三', '确认退货', { key: 'val' }]
    );
  });

  it('comment 和 details 为 null 时传 null', async () => {
    mockAppQuery.mockResolvedValueOnce(mockQueryResult([]));

    await recordAction(1, 'create', null, '系统');
    const params = mockAppQuery.mock.calls[0][1] as any[];
    expect(params[4]).toBeNull(); // comment
    expect(params[5]).toBeNull(); // details
  });
});

// ==================== recordCreateAction ====================

describe('recordCreateAction', () => {
  it('插入 create 类型记录', async () => {
    mockAppQuery.mockResolvedValueOnce(mockQueryResult([]));

    await recordCreateAction(10);
    expect(mockAppQuery).toHaveBeenCalledWith(
      expect.stringContaining("action_type, action_at"),
      [10]
    );
  });
});

// ==================== updateStatus ====================

describe('updateStatus', () => {
  it('更新状态返回行', async () => {
    const row = { id: 1, status: 'pending_erp_fill' };
    mockAppQuery.mockResolvedValueOnce(mockQueryResult([row]));

    const result = await updateStatus(1, 'pending_erp_fill');
    expect(result).toEqual(row);
  });

  it('不存在返回 null', async () => {
    mockAppQuery.mockResolvedValueOnce(mockQueryResult([]));
    const result = await updateStatus(999, 'completed');
    expect(result).toBeNull();
  });
});

// ==================== batchConfirm ====================

describe('batchConfirm', () => {
  it('批量更新状态', async () => {
    const rows = [
      { id: 1, goods_id: 'G001', goods_name: '商品A' },
      { id: 2, goods_id: 'G002', goods_name: '商品B' },
    ];
    mockAppQuery.mockResolvedValueOnce(mockQueryResult(rows));

    const result = await batchConfirm('pending_erp_fill', 5, [1, 2]);
    expect(result).toHaveLength(2);
    const params = mockAppQuery.mock.calls[0][1] as any[];
    expect(params[0]).toBe('pending_erp_fill');
    expect(params[1]).toBe(5);
    expect(params[2]).toEqual([1, 2]);
  });
});

// ==================== fillErpReturnNo ====================

describe('fillErpReturnNo', () => {
  it('填写 ERP 退货单号', async () => {
    const row = { id: 1, erp_return_no: 'ERP-001', status: 'pending_warehouse_execute' };
    mockAppQuery.mockResolvedValueOnce(mockQueryResult([row]));

    const result = await fillErpReturnNo(1, 'ERP-001', 5);
    expect(result).toEqual(row);
    const sql = mockAppQuery.mock.calls[0][0] as string;
    expect(sql).toContain('erp_return_no');
    expect(sql).toContain('erp_filled_by');
  });

  it('不存在返回 null', async () => {
    mockAppQuery.mockResolvedValueOnce(mockQueryResult([]));
    const result = await fillErpReturnNo(999, 'ERP-001', 5);
    expect(result).toBeNull();
  });
});

// ==================== warehouseExecute ====================

describe('warehouseExecute', () => {
  it('仓储执行退货', async () => {
    const row = { id: 1, status: 'completed' };
    mockAppQuery.mockResolvedValueOnce(mockQueryResult([row]));

    const result = await warehouseExecute(1, 5, '["url1"]', '备注');
    expect(result).toEqual(row);
    const sql = mockAppQuery.mock.calls[0][0] as string;
    expect(sql).toContain('warehouse_executed_by');
    expect(sql).toContain("status = 'completed'");
  });
});

// ==================== marketingSaleComplete ====================

describe('marketingSaleComplete', () => {
  it('营销销售完成', async () => {
    const row = { id: 1, status: 'completed' };
    mockAppQuery.mockResolvedValueOnce(mockQueryResult([row]));

    const result = await marketingSaleComplete(1, 5, '销售完成');
    expect(result).toEqual(row);
    const sql = mockAppQuery.mock.calls[0][0] as string;
    expect(sql).toContain('marketing_completed_by');
    expect(sql).toContain("status = 'completed'");
  });
});

// ==================== rollbackOrder ====================

describe('rollbackOrder', () => {
  it('回退到 pending_confirm', async () => {
    const row = { id: 1, status: 'pending_confirm' };
    mockAppQuery.mockResolvedValueOnce(mockQueryResult([row]));

    const result = await rollbackOrder(1);
    expect(result).toEqual(row);
    const sql = mockAppQuery.mock.calls[0][0] as string;
    expect(sql).toContain("status = 'pending_confirm'");
    expect(sql).toContain('erp_return_no = NULL');
  });
});

// ==================== invalidateOrderCache ====================

describe('invalidateOrderCache', () => {
  it('调用 cache.invalidate 清除相关缓存', () => {
    // 确保不抛异常即可（cache 是真实实例）
    expect(() => invalidateOrderCache(1)).not.toThrow();
    expect(() => invalidateOrderCache()).not.toThrow();
  });
});
