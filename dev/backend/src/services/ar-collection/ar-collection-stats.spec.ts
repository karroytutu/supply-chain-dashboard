/**
 * 催收统计服务单元测试
 * 测试 buildStatsRoleFilter 纯函数（角色权限 WHERE 条件构建）
 */

jest.mock('../../utils/logger', () => ({
  createLogger: () => ({ warn: jest.fn(), info: jest.fn(), error: jest.fn() }),
}));
jest.mock('../../db/appPool', () => ({ appQuery: jest.fn() }));

import { buildStatsRoleFilter } from './ar-collection.stats';

describe('buildStatsRoleFilter', () => {
  describe('marketer 角色', () => {
    it('生成 manager_user_id 过滤条件', () => {
      const result = buildStatsRoleFilter('marketer', 42, 1);
      expect(result.sql).toContain('manager_user_id');
      expect(result.sql).toContain('$1');
      expect(result.params).toEqual([42]);
      expect(result.nextIndex).toBe(2);
    });

    it('paramIndex 正确传递', () => {
      const result = buildStatsRoleFilter('marketer', 10, 5);
      expect(result.sql).toContain('$5');
      expect(result.params).toEqual([10]);
      expect(result.nextIndex).toBe(6);
    });
  });

  describe('finance_staff 角色', () => {
    it('返回差异处理或二级升级条件', () => {
      const result = buildStatsRoleFilter('finance_staff', 1, 1);
      expect(result.sql).toContain('difference_processing');
      expect(result.sql).toContain('escalation_level = 2');
      expect(result.params).toHaveLength(0);
      expect(result.nextIndex).toBe(1);
    });
  });

  describe('current_accountant 角色', () => {
    it('与 finance_staff 逻辑相同', () => {
      const result = buildStatsRoleFilter('current_accountant', 1, 1);
      expect(result.sql).toContain('difference_processing');
      expect(result.params).toHaveLength(0);
    });
  });

  describe('cashier 角色', () => {
    it('返回待核销状态条件', () => {
      const result = buildStatsRoleFilter('cashier', 1, 1);
      expect(result.sql).toContain('pending_verify');
      expect(result.params).toHaveLength(0);
    });
  });

  describe('默认角色（admin/manager/marketing_manager）', () => {
    it.each(['admin', 'manager', 'marketing_manager', 'marketing_supervisor'])(
      '%s → 全量访问',
      (role) => {
        const result = buildStatsRoleFilter(role, 1, 1);
        expect(result.sql).toBe('1=1');
        expect(result.params).toHaveLength(0);
      }
    );
  });

  describe('未知角色', () => {
    it('默认返回全量访问条件', () => {
      const result = buildStatsRoleFilter('unknown', 1, 1);
      expect(result.sql).toBe('1=1');
      expect(result.params).toHaveLength(0);
    });
  });
});
