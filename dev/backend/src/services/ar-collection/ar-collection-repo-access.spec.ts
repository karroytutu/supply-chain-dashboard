jest.mock('../../utils/cache', () => ({
  cache: { invalidate: jest.fn() },
  CACHE_TTL: { MEDIUM: 300 },
}));

jest.mock('../../db/appPool', () => ({
  appQuery: jest.fn(),
}));

import {
  hasCollectionFullAccess,
  buildRoleFilter,
  checkTaskAccess,
  invalidateTaskCache,
  invalidateStatsCache,
} from './ar-collection.repository';

describe('ar-collection.repository access control', () => {
  describe('hasCollectionFullAccess', () => {
    it('returns true for admin', () => {
      expect(hasCollectionFullAccess('admin')).toBe(true);
    });

    it('returns true for manager', () => {
      expect(hasCollectionFullAccess('manager')).toBe(true);
    });

    it('returns true for marketing_manager', () => {
      expect(hasCollectionFullAccess('marketing_manager')).toBe(true);
    });

    it('returns true for marketing_supervisor', () => {
      expect(hasCollectionFullAccess('marketing_supervisor')).toBe(true);
    });

    it('returns false for marketer', () => {
      expect(hasCollectionFullAccess('marketer')).toBe(false);
    });

    it('returns false for cashier', () => {
      expect(hasCollectionFullAccess('cashier')).toBe(false);
    });
  });

  describe('buildRoleFilter', () => {
    it('builds marketer filter', () => {
      const result = buildRoleFilter('marketer', 42, 1);
      expect(result.sql).toContain('manager_user_id');
      expect(result.params).toEqual([42]);
      expect(result.nextIndex).toBe(2);
    });

    it('builds finance_staff filter', () => {
      const result = buildRoleFilter('finance_staff', 1, 1);
      expect(result.sql).toContain('difference_processing');
      expect(result.params).toEqual([]);
      expect(result.nextIndex).toBe(1);
    });

    it('builds current_accountant filter', () => {
      const result = buildRoleFilter('current_accountant', 1, 1);
      expect(result.sql).toContain('difference_processing');
    });

    it('builds cashier filter', () => {
      const result = buildRoleFilter('cashier', 1, 1);
      expect(result.sql).toContain('pending_verify');
    });

    it('builds marketing_manager filter (no restriction)', () => {
      const result = buildRoleFilter('marketing_manager', 1, 1);
      expect(result.sql).toBe('1=1');
    });

    it('builds marketing_supervisor filter (no restriction)', () => {
      const result = buildRoleFilter('marketing_supervisor', 1, 1);
      expect(result.sql).toBe('1=1');
    });

    it('defaults to no restriction for unknown role', () => {
      const result = buildRoleFilter('unknown', 1, 1);
      expect(result.sql).toBe('1=1');
    });
  });

  describe('checkTaskAccess', () => {
    it('grants access for admin', () => {
      expect(checkTaskAccess({}, 1, 'admin')).toBe(true);
    });

    it('checks marketer access by manager_user_id', () => {
      expect(checkTaskAccess({ manager_user_id: 10 }, 10, 'marketer')).toBe(true);
      expect(checkTaskAccess({ manager_user_id: 20 }, 10, 'marketer')).toBe(false);
    });

    it('checks finance_staff access by status', () => {
      expect(checkTaskAccess({ status: 'difference_processing' }, 1, 'finance_staff')).toBe(true);
      expect(checkTaskAccess({ status: 'escalated', escalation_level: 2 }, 1, 'finance_staff')).toBe(true);
      expect(checkTaskAccess({ status: 'collecting' }, 1, 'finance_staff')).toBe(false);
    });

    it('checks cashier access by pending_verify status', () => {
      expect(checkTaskAccess({ status: 'pending_verify' }, 1, 'cashier')).toBe(true);
      expect(checkTaskAccess({ status: 'collecting' }, 1, 'cashier')).toBe(false);
    });

    it('grants access for unknown role (default)', () => {
      expect(checkTaskAccess({}, 1, 'some_role')).toBe(true);
    });
  });

  describe('invalidateTaskCache', () => {
    it('invalidates without error', () => {
      expect(() => invalidateTaskCache()).not.toThrow();
      expect(() => invalidateTaskCache(1)).not.toThrow();
    });
  });

  describe('invalidateStatsCache', () => {
    it('invalidates without error', () => {
      expect(() => invalidateStatsCache()).not.toThrow();
    });
  });
});
