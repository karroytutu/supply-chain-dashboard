/**
 * OA 工作流与审批人解析工具单元测试
 */

jest.mock('../../utils/logger', () => ({
  createLogger: () => ({ info: jest.fn(), error: jest.fn(), warn: jest.fn() }),
}));

jest.mock('../../db/appPool', () => ({
  appQuery: jest.fn(),
}));

jest.mock('./oa-form-utils', () => ({
  checkCondition: jest.fn(),
}));

import { appQuery } from '../../db/appPool';
import { mockQueryResult } from '../../__tests__/helpers/mockDb';
import { checkCondition } from './oa-form-utils';
import {
  filterNodesByCondition,
  resolveApproverId,
  findUserIdsByRoleCodes,
} from './oa-workflow-utils';
import type { WorkflowNodeDef } from './oa.types';

const mockAppQuery = appQuery as jest.MockedFunction<typeof appQuery>;
const mockCheckCondition = checkCondition as jest.MockedFunction<typeof checkCondition>;

describe('oa-workflow-utils', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('filterNodesByCondition', () => {
    it('无条件的节点全部保留', () => {
      const nodes: WorkflowNodeDef[] = [
        { order: 1, name: '主管', type: 'role', roleCode: 'manager' },
        { order: 2, name: '总经理', type: 'role', roleCode: 'ceo' },
      ];

      const result = filterNodesByCondition(nodes, { amount: 1000 });

      expect(result).toHaveLength(2);
    });

    it('有条件节点根据 checkCondition 结果过滤', () => {
      const nodes: WorkflowNodeDef[] = [
        { order: 1, name: '主管', type: 'role', roleCode: 'manager' },
        {
          order: 2,
          name: '总经理',
          type: 'role',
          roleCode: 'ceo',
          condition: { field: 'amount', operator: '>', value: 50000 },
        },
      ];
      mockCheckCondition.mockReturnValueOnce(false);

      const result = filterNodesByCondition(nodes, { amount: 1000 });

      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('主管');
    });

    it('条件满足时保留条件节点', () => {
      const nodes: WorkflowNodeDef[] = [
        {
          order: 1,
          name: '总经理',
          type: 'role',
          roleCode: 'ceo',
          condition: { field: 'amount', operator: '>', value: 50000 },
        },
      ];
      mockCheckCondition.mockReturnValueOnce(true);

      const result = filterNodesByCondition(nodes, { amount: 100000 });

      expect(result).toHaveLength(1);
    });
  });

  describe('resolveApproverId', () => {
    it('specific_user 类型直接返回 userId', async () => {
      const node: WorkflowNodeDef = {
        order: 1,
        name: '指定人',
        type: 'specific_user',
        userId: 42,
      };

      const result = await resolveApproverId(node, 1);

      expect(result).toBe(42);
      expect(mockAppQuery).not.toHaveBeenCalled();
    });

    it('role 类型查询角色用户', async () => {
      const node: WorkflowNodeDef = {
        order: 1,
        name: '管理员',
        type: 'role',
        roleCode: 'admin',
      };
      mockAppQuery.mockResolvedValueOnce(mockQueryResult([{ user_id: 10 }]));

      const result = await resolveApproverId(node, 1);

      expect(result).toBe(10);
    });

    it('role 类型无匹配用户时返回 null', async () => {
      const node: WorkflowNodeDef = {
        order: 1,
        name: '不存在的角色',
        type: 'role',
        roleCode: 'nonexistent',
      };
      mockAppQuery.mockResolvedValueOnce(mockQueryResult([]));

      const result = await resolveApproverId(node, 1);

      expect(result).toBeNull();
    });

    it('dynamic_supervisor 类型查询同部门主管', async () => {
      const node: WorkflowNodeDef = {
        order: 1,
        name: '直属主管',
        type: 'dynamic_supervisor',
      };
      mockAppQuery.mockResolvedValueOnce(mockQueryResult([{ manager_id: 5 }]));

      const result = await resolveApproverId(node, 10);

      expect(result).toBe(5);
    });

    it('dynamic_supervisor 无主管时返回 null', async () => {
      const node: WorkflowNodeDef = {
        order: 1,
        name: '直属主管',
        type: 'dynamic_supervisor',
      };
      mockAppQuery.mockResolvedValueOnce(mockQueryResult([]));

      const result = await resolveApproverId(node, 10);

      expect(result).toBeNull();
    });

    it('未知类型返回 null', async () => {
      const node = { order: 1, name: '未知', type: 'unknown' } as any;

      const result = await resolveApproverId(node, 1);

      expect(result).toBeNull();
    });
  });

  describe('findUserIdsByRoleCodes', () => {
    it('返回匹配角色的用户ID列表', async () => {
      mockAppQuery.mockResolvedValueOnce(mockQueryResult([{ user_id: 1 }, { user_id: 2 }]));

      const result = await findUserIdsByRoleCodes(['admin', 'manager']);

      expect(result).toEqual([1, 2]);
    });

    it('空数组时返回空', async () => {
      const result = await findUserIdsByRoleCodes([]);

      expect(result).toEqual([]);
      expect(mockAppQuery).not.toHaveBeenCalled();
    });

    it('null/undefined 时返回空', async () => {
      const result = await findUserIdsByRoleCodes(null as any);

      expect(result).toEqual([]);
    });
  });
});
