/**
 * 商品退货规则服务单元测试
 */

jest.mock('../../utils/logger', () => ({
  createLogger: () => ({ warn: jest.fn(), info: jest.fn(), error: jest.fn() }),
}));

jest.mock('../../db/appPool', () => ({
  appQuery: jest.fn(),
}));

jest.mock('../../utils/sqlHelpers', () => ({
  escapeLikePattern: (s: string) => s,
}));

import { appQuery } from '../../db/appPool';
import { mockQueryResult } from '../../__tests__/helpers/mockDb';
import {
  getGoodsReturnRules,
  getGoodsReturnRuleStats,
  createGoodsReturnRule,
} from './goods-return-rules.service';

const mockAppQuery = appQuery as jest.MockedFunction<typeof appQuery>;

beforeEach(() => {
  jest.resetAllMocks();
});

describe('getGoodsReturnRules', () => {
  it('无过滤条件查询全部', async () => {
    mockAppQuery
      .mockResolvedValueOnce(mockQueryResult([{ total: '5' }]))
      .mockResolvedValueOnce(mockQueryResult([
        { id: 1, goods_id: 'G001', goods_name: '商品A', can_return_to_supplier: true,
          is_active: true, created_at: new Date(), updated_at: new Date() },
      ]));

    const result = await getGoodsReturnRules({ page: 1, pageSize: 20 });
    expect(result.total).toBe(5);
    expect(result.data).toHaveLength(1);
    expect(result.data[0].goodsId).toBe('G001');
  });

  it('keyword 过滤添加 ILIKE 条件', async () => {
    mockAppQuery
      .mockResolvedValueOnce(mockQueryResult([{ total: '0' }]))
      .mockResolvedValueOnce(mockQueryResult([]));

    await getGoodsReturnRules({ keyword: '测试' });
    const countSql = mockAppQuery.mock.calls[0][0] as string;
    expect(countSql).toContain('ILIKE');
  });

  it('canReturnToSupplier 过滤', async () => {
    mockAppQuery
      .mockResolvedValueOnce(mockQueryResult([{ total: '0' }]))
      .mockResolvedValueOnce(mockQueryResult([]));

    await getGoodsReturnRules({ canReturnToSupplier: true });
    const countSql = mockAppQuery.mock.calls[0][0] as string;
    expect(countSql).toContain('can_return_to_supplier');
  });
});

describe('getGoodsReturnRuleStats', () => {
  it('返回统计数据', async () => {
    const stats = { can_return: '10', cannot_return: '5', total: '15' };
    mockAppQuery.mockResolvedValueOnce(mockQueryResult([stats]));

    const result = await getGoodsReturnRuleStats();
    expect(result.canReturn).toBe(10);
    expect(result.cannotReturn).toBe(5);
    expect(result.total).toBe(15);
  });
});

describe('createGoodsReturnRule', () => {
  it('创建规则并返回结果', async () => {
    const row = {
      id: 1, goods_id: 'G001', goods_name: '商品A',
      can_return_to_supplier: true, is_active: true,
      created_at: new Date(), updated_at: new Date(),
    };
    // 第一个 appQuery: UPDATE 旧规则
    mockAppQuery.mockResolvedValueOnce(mockQueryResult([], 0));
    // 第二个 appQuery: INSERT 新规则
    mockAppQuery.mockResolvedValueOnce(mockQueryResult([row]));

    const result = await createGoodsReturnRule({
      goodsId: 'G001',
      goodsName: '商品A',
      canReturnToSupplier: true,
      userId: 5,
      comment: '可退货',
    });

    expect(result).toBeDefined();
    expect(result.goodsId).toBe('G001');
    expect(mockAppQuery).toHaveBeenCalledTimes(2);
  });
});
