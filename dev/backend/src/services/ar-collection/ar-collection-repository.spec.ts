/**
 * 催收 Repository 纯函数单元测试
 * 测试 hasCollectionFullAccess、buildRoleFilter、checkTaskAccess
 * 无需 mock：这三个函数都是纯函数，不访问数据库
 */

jest.mock('../../utils/logger', () => ({
  createLogger: () => ({ warn: jest.fn(), info: jest.fn(), error: jest.fn() }),
}));
jest.mock('../../db/appPool', () => ({ appQuery: jest.fn() }));
jest.mock('../../utils/cache', () => ({ cache: { get: jest.fn(), set: jest.fn(), invalidate: jest.fn() } }));

import {
  hasCollectionFullAccess,
  buildRoleFilter,
  checkTaskAccess,
} from './ar-collection.repository';

// ==================== hasCollectionFullAccess ====================

describe('hasCollectionFullAccess', () => {
  it.each([
    ['admin', true],
    ['manager', true],
    ['marketing_manager', true],
    ['marketing_supervisor', true],
    ['marketer', false],
    ['cashier', false],
    ['finance_staff', false],
    ['current_accountant', false],
    ['', false],
    ['unknown_role', false],
  ] as const)('%s → %s', (role, expected) => {
    expect(hasCollectionFullAccess(role)).toBe(expected);
  });
});

// ==================== buildRoleFilter ====================

describe('buildRoleFilter', () => {
  describe('marketer 角色', () => {
    it('生成 manager_user_id 过滤条件', () => {
      const result = buildRoleFilter('marketer', 42, 1);
      expect(result.sql).toContain('manager_user_id');
      expect(result.sql).toContain('$1');
      expect(result.params).toEqual([42]);
      expect(result.nextIndex).toBe(2);
    });

    it('paramIndex 正确传递', () => {
      const result = buildRoleFilter('marketer', 10, 5);
      expect(result.sql).toContain('$5');
      expect(result.params).toEqual([10]);
      expect(result.nextIndex).toBe(6);
    });
  });

  describe('finance_staff 角色', () => {
    it('返回差异处理或二级升级条件', () => {
      const result = buildRoleFilter('finance_staff', 1, 1);
      expect(result.sql).toContain('difference_processing');
      expect(result.sql).toContain('escalation_level = 2');
      expect(result.params).toHaveLength(0);
      expect(result.nextIndex).toBe(1);
    });
  });

  describe('current_accountant 角色', () => {
    it('与 finance_staff 逻辑相同', () => {
      const result = buildRoleFilter('current_accountant', 1, 1);
      expect(result.sql).toContain('difference_processing');
      expect(result.params).toHaveLength(0);
    });
  });

  describe('cashier 角色', () => {
    it('返回待核销状态条件', () => {
      const result = buildRoleFilter('cashier', 1, 1);
      expect(result.sql).toContain('pending_verify');
      expect(result.params).toHaveLength(0);
    });
  });

  describe('marketing_supervisor 角色', () => {
    it('返回全量访问条件', () => {
      const result = buildRoleFilter('marketing_supervisor', 1, 1);
      expect(result.sql).toBe('1=1');
      expect(result.params).toHaveLength(0);
    });
  });

  describe('marketing_manager 角色', () => {
    it('返回全量访问条件', () => {
      const result = buildRoleFilter('marketing_manager', 1, 1);
      expect(result.sql).toBe('1=1');
    });
  });

  describe('未知角色', () => {
    it('默认返回全量访问条件', () => {
      const result = buildRoleFilter('unknown', 1, 1);
      expect(result.sql).toBe('1=1');
      expect(result.params).toHaveLength(0);
    });
  });
});

// ==================== checkTaskAccess ====================

describe('checkTaskAccess', () => {
  const baseTask = {
    manager_user_id: 10,
    status: 'collecting',
    escalation_level: 0,
  };

  it('admin 角色有完整权限', () => {
    expect(checkTaskAccess(baseTask, 999, 'admin')).toBe(true);
  });

  it('manager 角色有完整权限', () => {
    expect(checkTaskAccess(baseTask, 999, 'manager')).toBe(true);
  });

  it('marketing_manager 角色有完整权限', () => {
    expect(checkTaskAccess(baseTask, 999, 'marketing_manager')).toBe(true);
  });

  it('marketing_supervisor 角色有完整权限', () => {
    expect(checkTaskAccess(baseTask, 999, 'marketing_supervisor')).toBe(true);
  });

  describe('marketer 角色', () => {
    it('只能访问自己管理的任务', () => {
      expect(checkTaskAccess(baseTask, 10, 'marketer')).toBe(true);
    });

    it('不能访问他人管理的任务', () => {
      expect(checkTaskAccess(baseTask, 20, 'marketer')).toBe(false);
    });
  });

  describe('finance_staff 角色', () => {
    it('可以访问差异处理状态的任务', () => {
      const task = { ...baseTask, status: 'difference_processing' };
      expect(checkTaskAccess(task, 999, 'finance_staff')).toBe(true);
    });

    it('可以访问二级升级状态的任务', () => {
      const task = { ...baseTask, status: 'escalated', escalation_level: 2 };
      expect(checkTaskAccess(task, 999, 'finance_staff')).toBe(true);
    });

    it('不能访问普通收集中的任务', () => {
      expect(checkTaskAccess(baseTask, 999, 'finance_staff')).toBe(false);
    });

    it('不能访问一级升级的任务', () => {
      const task = { ...baseTask, status: 'escalated', escalation_level: 1 };
      expect(checkTaskAccess(task, 999, 'finance_staff')).toBe(false);
    });
  });

  describe('current_accountant 角色', () => {
    it('逻辑与 finance_staff 相同', () => {
      const task = { ...baseTask, status: 'difference_processing' };
      expect(checkTaskAccess(task, 999, 'current_accountant')).toBe(true);
    });
  });

  describe('cashier 角色', () => {
    it('只能访问待核销任务', () => {
      const task = { ...baseTask, status: 'pending_verify' };
      expect(checkTaskAccess(task, 999, 'cashier')).toBe(true);
    });

    it('不能访问非待核销任务', () => {
      expect(checkTaskAccess(baseTask, 999, 'cashier')).toBe(false);
    });
  });

  describe('未知角色', () => {
    it('默认允许访问', () => {
      expect(checkTaskAccess(baseTask, 999, 'unknown')).toBe(true);
    });
  });
});
