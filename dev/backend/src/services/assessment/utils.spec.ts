/**
 * 考核管理工具函数单元测试
 */

jest.mock('../../utils/logger', () => ({
  createLogger: () => ({ info: jest.fn(), error: jest.fn(), warn: jest.fn() }),
}));

jest.mock('../../db/appPool', () => ({
  appQuery: jest.fn(),
}));

jest.mock('../erp-client/erp-inventory.service', () => ({
  getCostPriceByNameMap: jest.fn(),
}));

import { appQuery } from '../../db/appPool';
import { mockQueryResult } from '../../__tests__/helpers/mockDb';
import { getCostPriceByNameMap } from '../erp-client/erp-inventory.service';
import {
  getUsersByRole,
  findUserByName,
  getPurchasePrice,
  getDingtalkUserIdMap,
} from './utils';

const mockAppQuery = appQuery as jest.MockedFunction<typeof appQuery>;
const mockGetCostPrice = getCostPriceByNameMap as jest.MockedFunction<typeof getCostPriceByNameMap>;

describe('assessment.utils', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('getUsersByRole', () => {
    it('根据角色编码查询用户列表', async () => {
      const users = [
        { id: 1, name: '张三', dingtalk_user_id: 'dt_001' },
        { id: 2, name: '李四', dingtalk_user_id: 'dt_002' },
      ];
      mockAppQuery.mockResolvedValueOnce(mockQueryResult(users));

      const result = await getUsersByRole('marketing_manager');

      expect(result).toEqual(users);
      expect(mockAppQuery).toHaveBeenCalledWith(
        expect.stringContaining("r.code = $1"),
        ['marketing_manager']
      );
    });

    it('带部门筛选时传递 departmentId', async () => {
      mockAppQuery.mockResolvedValueOnce(mockQueryResult([]));

      await getUsersByRole('marketer', 5);

      expect(mockAppQuery).toHaveBeenCalledWith(
        expect.stringContaining('department_id = $2'),
        ['marketer', 5]
      );
    });
  });

  describe('findUserByName', () => {
    it('找到时返回用户信息', async () => {
      const user = { id: 1, name: '张三', dingtalk_user_id: 'dt_001' };
      mockAppQuery.mockResolvedValueOnce(mockQueryResult([user]));

      const result = await findUserByName('张三');

      expect(result).toEqual(user);
    });

    it('空名字时返回 null', async () => {
      const result = await findUserByName('');

      expect(result).toBeNull();
      expect(mockAppQuery).not.toHaveBeenCalled();
    });

    it('未找到时返回 null', async () => {
      mockAppQuery.mockResolvedValueOnce(mockQueryResult([]));

      const result = await findUserByName('不存在');

      expect(result).toBeNull();
    });
  });

  describe('getPurchasePrice', () => {
    it('从 ERP 获取商品进价', async () => {
      const costMap = new Map([['商品A', 25.5]]);
      mockGetCostPrice.mockResolvedValueOnce(costMap);

      const result = await getPurchasePrice('商品A');

      expect(result).toBe(25.5);
    });

    it('商品不存在时返回 0', async () => {
      mockGetCostPrice.mockResolvedValueOnce(new Map());

      const result = await getPurchasePrice('不存在商品');

      expect(result).toBe(0);
    });

    it('API 调用失败时返回 0', async () => {
      mockGetCostPrice.mockRejectedValueOnce(new Error('ERP error'));

      const result = await getPurchasePrice('商品A');

      expect(result).toBe(0);
    });

    it('进价为负数时返回 0', async () => {
      const costMap = new Map([['商品A', -5]]);
      mockGetCostPrice.mockResolvedValueOnce(costMap);

      const result = await getPurchasePrice('商品A');

      expect(result).toBe(0);
    });
  });

  describe('getDingtalkUserIdMap', () => {
    it('返回用户ID到钉钉ID的映射', async () => {
      const rows = [
        { id: 1, dingtalk_user_id: 'dt_001' },
        { id: 2, dingtalk_user_id: 'dt_002' },
      ];
      mockAppQuery.mockResolvedValueOnce(mockQueryResult(rows));

      const result = await getDingtalkUserIdMap([1, 2]);

      expect(result.size).toBe(2);
      expect(result.get(1)).toBe('dt_001');
      expect(result.get(2)).toBe('dt_002');
    });

    it('空数组时返回空 Map', async () => {
      const result = await getDingtalkUserIdMap([]);

      expect(result.size).toBe(0);
      expect(mockAppQuery).not.toHaveBeenCalled();
    });

    it('过滤 dev_admin 用户', async () => {
      const rows = [
        { id: 1, dingtalk_user_id: 'dt_001' },
        { id: 2, dingtalk_user_id: 'dev_admin' },
      ];
      mockAppQuery.mockResolvedValueOnce(mockQueryResult(rows));

      const result = await getDingtalkUserIdMap([1, 2]);

      expect(result.size).toBe(1);
      expect(result.has(2)).toBe(false);
    });

    it('过滤 null dingtalk_user_id', async () => {
      const rows = [
        { id: 1, dingtalk_user_id: 'dt_001' },
        { id: 2, dingtalk_user_id: null },
      ];
      mockAppQuery.mockResolvedValueOnce(mockQueryResult(rows));

      const result = await getDingtalkUserIdMap([1, 2]);

      expect(result.size).toBe(1);
    });
  });
});
