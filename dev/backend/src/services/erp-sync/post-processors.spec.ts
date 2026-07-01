/**
 * 后置处理器单元测试
 * @module services/erp-sync/post-processors.spec.ts
 */

jest.mock('../../utils/logger', () => ({
  createLogger: () => ({ warn: jest.fn(), info: jest.fn(), error: jest.fn(), debug: jest.fn() }),
}));
jest.mock('../../db/appPool', () => ({
  appQuery: jest.fn(),
}));
jest.mock('../../utils/beijingTime', () => ({
  beijingDate: jest.fn(() => '2026-07-01'),
}));

import { processDebtChangelog } from './post-processors/changelog.processor';
import { processDebtDailySummary, processSalesDailySummary } from './post-processors/daily-summary.processor';
import { processInventorySnapshot } from './post-processors/snapshot.processor';
import { appQuery } from '../../db/appPool';

const mockAppQuery = appQuery as jest.MockedFunction<typeof appQuery>;

beforeEach(() => jest.clearAllMocks());

// =====================================================
// processDebtChangelog（新签名：oldDebts + newDebts）
// =====================================================

describe('processDebtChangelog', () => {
  it('新增欠款 → change_type=new', async () => {
    mockAppQuery.mockResolvedValue({ rows: [], rowCount: 1 } as any);

    const result = await processDebtChangelog(
      [], // 旧数据为空
      [{ bill_id: 'B001', left_amount: 1000 }],
    );

    expect(result.added).toBe(1);
    expect(result.removed).toBe(0);
    expect(result.changed).toBe(0);
    // 验证批量 INSERT 含 change_type='new'
    const insertCall = mockAppQuery.mock.calls.find(
      (call) => typeof call[0] === 'string' && (call[0] as string).includes('erp_debt_changes'),
    );
    expect(insertCall).toBeDefined();
    expect(insertCall![1]).toContain('new');
  });

  it('金额变化超过 0.01 → change_type=changed', async () => {
    mockAppQuery.mockResolvedValue({ rows: [], rowCount: 1 } as any);

    const result = await processDebtChangelog(
      [{ bill_id: 'B001', left_amount: 1000 }],
      [{ bill_id: 'B001', left_amount: 1010 }], // 变化 10 > 0.01
    );

    expect(result.changed).toBe(1);
    expect(result.added).toBe(0);
  });

  it('金额变化不超过 0.01 → 不生成变更记录', async () => {
    const result = await processDebtChangelog(
      [{ bill_id: 'B001', left_amount: 1000.005 }],
      [{ bill_id: 'B001', left_amount: 1000.01 }], // |1000.005 - 1000.01| = 0.005 <= 0.01
    );

    expect(result.changed).toBe(0);
    // 不应有 INSERT 调用
    const insertCalls = mockAppQuery.mock.calls.filter(
      (call) => typeof call[0] === 'string' && (call[0] as string).includes('erp_debt_changes'),
    );
    expect(insertCalls.length).toBe(0);
  });

  it('旧欠款消失 → change_type=gone', async () => {
    mockAppQuery.mockResolvedValue({ rows: [], rowCount: 1 } as any);

    const result = await processDebtChangelog(
      [{ bill_id: 'B001', left_amount: 1000 }],
      [], // 新数据为空
    );

    expect(result.removed).toBe(1);
    expect(result.added).toBe(0);
  });

  it('数据完全无变化时 → 不产生任何记录', async () => {
    const result = await processDebtChangelog(
      [{ bill_id: 'B001', left_amount: 1000 }],
      [{ bill_id: 'B001', left_amount: 1000 }],
    );

    expect(result.added).toBe(0);
    expect(result.removed).toBe(0);
    expect(result.changed).toBe(0);
    // 不应有任何数据库调用
    expect(mockAppQuery).not.toHaveBeenCalled();
  });

  it('空新旧数据 → 不产生任何记录', async () => {
    const result = await processDebtChangelog([], []);

    expect(result.added).toBe(0);
    expect(result.removed).toBe(0);
    expect(result.changed).toBe(0);
    expect(mockAppQuery).not.toHaveBeenCalled();
  });

  it('批量 INSERT（多条变更合并为单次 VALUES 语句）', async () => {
    mockAppQuery.mockResolvedValue({ rows: [], rowCount: 3 } as any);

    const result = await processDebtChangelog(
      [{ bill_id: 'B001', left_amount: 1000 }],
      [
        { bill_id: 'B001', left_amount: 1100 }, // changed
        { bill_id: 'B002', left_amount: 500 },   // new
        { bill_id: 'B003', left_amount: 200 },   // new
      ],
    );

    expect(result.changed).toBe(1);
    expect(result.added).toBe(2);
    // 应该只有一次 INSERT 调用（批量）
    const insertCalls = mockAppQuery.mock.calls.filter(
      (call) => typeof call[0] === 'string' && (call[0] as string).includes('erp_debt_changes'),
    );
    expect(insertCalls.length).toBe(1);
    // VALUES 子句应包含 3 个占位组
    expect(insertCalls[0][0]).toContain('($1');
    expect(insertCalls[0][0]).toContain('($7');
    expect(insertCalls[0][0]).toContain('($13');
  });

  it('config.postProcessors 为空时不报错（由 runPostProcessors 保护）', async () => {
    // processDebtChangelog 本身不检查 config，由 runPostProcessors 保护
    // 此处验证函数在极端输入下的健壮性
    const result = await processDebtChangelog(
      [{ bill_id: null, left_amount: null }] as any,
      [],
    );
    expect(result.removed).toBe(1); // null bill_id 作为 key 仍可工作
  });
});

// =====================================================
// processDebtDailySummary
// =====================================================

describe('processDebtDailySummary', () => {
  it('按 consumer_name 聚合 left_amount > 0 的欠款', async () => {
    mockAppQuery.mockResolvedValue({ rowCount: 5 } as any);

    const count = await processDebtDailySummary();

    expect(count).toBe(5);
    const [sql, params] = mockAppQuery.mock.calls[0];
    expect(sql).toContain('erp_debt_daily_summary');
    expect(sql).toContain('left_amount > 0');
    expect(sql).toContain('GROUP BY consumer_name');
    expect(params).toContain('2026-07-01');
  });

  it('UPSERT 冲突时更新 total_debt 和 bill_count', async () => {
    mockAppQuery.mockResolvedValue({ rowCount: 0 } as any);

    await processDebtDailySummary();

    const [sql] = mockAppQuery.mock.calls[0];
    expect(sql).toContain('ON CONFLICT');
    expect(sql).toContain('total_debt');
    expect(sql).toContain('bill_count');
  });
});

// =====================================================
// processSalesDailySummary
// =====================================================

describe('processSalesDailySummary', () => {
  it('按 settle_time::date + goods_name 聚合', async () => {
    mockAppQuery.mockResolvedValue({ rowCount: 10 } as any);

    const count = await processSalesDailySummary();

    expect(count).toBe(10);
    const [sql] = mockAppQuery.mock.calls[0];
    expect(sql).toContain('erp_daily_sales_summary');
    expect(sql).toContain('settle_time::date');
    expect(sql).toContain('GROUP BY settle_time::date, goods_name');
  });
});

// =====================================================
// processInventorySnapshot
// =====================================================

describe('processInventorySnapshot', () => {
  it('从 erp_inventory 生成当日快照', async () => {
    mockAppQuery.mockResolvedValue({ rowCount: 20 } as any);

    const count = await processInventorySnapshot();

    expect(count).toBe(20);
    const [sql, params] = mockAppQuery.mock.calls[0];
    expect(sql).toContain('erp_inventory_snapshots_v2');
    expect(sql).toContain('erp_inventory');
    expect(params).toContain('2026-07-01');
  });

  it('UPSERT 冲突时更新已有快照', async () => {
    mockAppQuery.mockResolvedValue({ rowCount: 0 } as any);

    await processInventorySnapshot();

    const [sql] = mockAppQuery.mock.calls[0];
    expect(sql).toContain('ON CONFLICT');
    expect(sql).toContain('available_base_quantity');
  });
});
