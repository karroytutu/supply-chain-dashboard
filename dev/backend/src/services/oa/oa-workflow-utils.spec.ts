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
  resolveHandlerRule,
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
        { order: 1, name: '主管', type: 'approval', handler: { roleCode: 'department_manager' } },
        { order: 2, name: '总经理', type: 'approval', handler: { roleCode: 'ceo' } },
      ];

      const result = filterNodesByCondition(nodes, { amount: 1000 });

      expect(result).toHaveLength(2);
    });

    it('有条件节点根据 checkCondition 结果过滤', () => {
      const nodes: WorkflowNodeDef[] = [
        { order: 1, name: '主管', type: 'approval', handler: { roleCode: 'department_manager' } },
        {
          order: 2,
          name: '总经理',
          type: 'approval',
          handler: { roleCode: 'ceo' },
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
          type: 'approval',
          handler: { roleCode: 'ceo' },
          condition: { field: 'amount', operator: '>', value: 50000 },
        },
      ];
      mockCheckCondition.mockReturnValueOnce(true);

      const result = filterNodesByCondition(nodes, { amount: 100000 });

      expect(result).toHaveLength(1);
    });
  });

  describe('resolveHandlerRule', () => {
    it('handler.userId 直接返回指定用户', async () => {
      const node: WorkflowNodeDef = {
        order: 1,
        name: '指定人',
        type: 'approval',
        handler: { userId: 42 },
      };

      const result = await resolveHandlerRule(node, 1);

      expect(result.userIds).toEqual([42]);
      expect(result.signMode).toBe('or');
      expect(mockAppQuery).not.toHaveBeenCalled();
    });

    it('handler.roleCode 查询角色下所有用户', async () => {
      const node: WorkflowNodeDef = {
        order: 1,
        name: '管理员',
        type: 'approval',
        handler: { roleCode: 'admin' },
        signMode: 'or',
      };
      mockAppQuery.mockResolvedValueOnce(mockQueryResult([{ user_id: 10 }, { user_id: 20 }]));

      const result = await resolveHandlerRule(node, 1);

      expect(result.userIds).toEqual([10, 20]);
      expect(result.signMode).toBe('or');
    });

    it('handler.roleCode 无匹配用户时返回空数组', async () => {
      const node: WorkflowNodeDef = {
        order: 1,
        name: '不存在的角色',
        type: 'approval',
        handler: { roleCode: 'nonexistent' },
      };
      mockAppQuery.mockResolvedValueOnce(mockQueryResult([]));

      const result = await resolveHandlerRule(node, 1);

      expect(result.userIds).toEqual([]);
    });

    it('handler.useSupervisor 查询同部门主管', async () => {
      const node: WorkflowNodeDef = {
        order: 1,
        name: '直属主管',
        type: 'approval',
        handler: { useSupervisor: true },
      };
      mockAppQuery.mockResolvedValueOnce(mockQueryResult([{ id: 5 }]));

      const result = await resolveHandlerRule(node, 10);

      expect(result.userIds).toEqual([5]);
    });

    it('handler.useSupervisor 无主管时返回空数组', async () => {
      const node: WorkflowNodeDef = {
        order: 1,
        name: '直属主管',
        type: 'approval',
        handler: { useSupervisor: true },
      };
      mockAppQuery.mockResolvedValueOnce(mockQueryResult([]));

      const result = await resolveHandlerRule(node, 10);

      expect(result.userIds).toEqual([]);
    });

    it('无 handler 时返回空数组', async () => {
      const node: WorkflowNodeDef = {
        order: 1,
        name: '自动环节',
        type: 'auto',
      };

      const result = await resolveHandlerRule(node, 1);

      expect(result.userIds).toEqual([]);
      expect(result.signMode).toBe('or');
    });

    it('多人时去重', async () => {
      const node: WorkflowNodeDef = {
        order: 1,
        name: '组合找人',
        type: 'approval',
        handler: { roleCode: 'admin', userId: 10 },
      };
      // roleCode 查询返回 [10, 20]，userId 再加 10 → 去重后 [10, 20]
      mockAppQuery.mockResolvedValueOnce(mockQueryResult([{ user_id: 10 }, { user_id: 20 }]));

      const result = await resolveHandlerRule(node, 1);

      expect(result.userIds).toEqual([10, 20]);
    });

    it('signMode 默认 or', async () => {
      const node: WorkflowNodeDef = {
        order: 1,
        name: '测试',
        type: 'approval',
        handler: { userId: 1 },
      };

      const result = await resolveHandlerRule(node, 1);

      expect(result.signMode).toBe('or');
    });

    it('signMode 可设为 and', async () => {
      const node: WorkflowNodeDef = {
        order: 1,
        name: '会签测试',
        type: 'approval',
        handler: { userId: 1 },
        signMode: 'and',
      };

      const result = await resolveHandlerRule(node, 1);

      expect(result.signMode).toBe('and');
    });

    it('useApplicant 返回申请人ID', async () => {
      const node: WorkflowNodeDef = {
        order: 1,
        name: '发起人确认',
        type: 'handle',
        handler: { useApplicant: true },
      };

      const result = await resolveHandlerRule(node, 42);

      expect(result.userIds).toEqual([42]);
    });

    it('useApplicant 与其他规则组合时去重', async () => {
      const node: WorkflowNodeDef = {
        order: 1,
        name: '组合测试',
        type: 'handle',
        handler: { useApplicant: true, userId: 42 },
      };

      const result = await resolveHandlerRule(node, 42);

      expect(result.userIds).toEqual([42]);
    });
  });

  describe('findUserIdsByRoleCodes', () => {
    it('返回匹配角色的用户ID列表', async () => {
      mockAppQuery.mockResolvedValueOnce(mockQueryResult([{ user_id: 1 }, { user_id: 2 }]));

      const result = await findUserIdsByRoleCodes(['admin', 'department_manager']);

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
