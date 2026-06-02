import { describe, it, expect } from 'vitest';
import { tabToApiParams, getCollectionRole, getDefaultStatusTab } from './collectionFilterUtils';
import { ROLES } from '@/constants/permissions';

describe('tabToApiParams', () => {
  it('maps escalated_l1 to escalated status with escalationLevel 1', () => {
    expect(tabToApiParams('escalated_l1')).toEqual({ status: 'escalated', escalationLevel: 1 });
  });

  it('maps escalated_l2 to escalated status with escalationLevel 2', () => {
    expect(tabToApiParams('escalated_l2')).toEqual({ status: 'escalated', escalationLevel: 2 });
  });

  it('maps collecting tab directly to status', () => {
    expect(tabToApiParams('collecting')).toEqual({ status: 'collecting' });
  });

  it('maps pending_verify tab directly to status', () => {
    expect(tabToApiParams('pending_verify')).toEqual({ status: 'pending_verify' });
  });

  it('maps difference_processing tab directly to status', () => {
    expect(tabToApiParams('difference_processing')).toEqual({ status: 'difference_processing' });
  });

  it('maps closed tab directly to status', () => {
    expect(tabToApiParams('closed')).toEqual({ status: 'closed' });
  });
});

describe('getCollectionRole', () => {
  it('returns admin for admin role', () => {
    expect(getCollectionRole([ROLES.ADMIN])).toBe('admin');
  });

  it('returns admin for manager role', () => {
    expect(getCollectionRole([ROLES.MANAGER])).toBe('admin');
  });

  it('returns admin for marketing_manager role', () => {
    expect(getCollectionRole([ROLES.MARKETING_MANAGER])).toBe('admin');
  });

  it('returns admin for marketing_supervisor role', () => {
    expect(getCollectionRole([ROLES.MARKETING_SUPERVISOR])).toBe('admin');
  });

  it('returns finance for current_accountant role', () => {
    expect(getCollectionRole([ROLES.CURRENT_ACCOUNTANT])).toBe('finance');
  });

  it('returns finance for finance_staff role', () => {
    expect(getCollectionRole([ROLES.FINANCE_STAFF])).toBe('finance');
  });

  it('returns cashier for cashier role', () => {
    expect(getCollectionRole([ROLES.CASHIER])).toBe('cashier');
  });

  it('returns marketer for marketer role', () => {
    expect(getCollectionRole([ROLES.MARKETER])).toBe('marketer');
  });

  it('returns marketer as default for unknown roles', () => {
    expect(getCollectionRole(['unknown_role'])).toBe('marketer');
  });

  it('returns marketer for empty roles array', () => {
    expect(getCollectionRole([])).toBe('marketer');
  });

  it('prioritizes admin over finance when both roles present', () => {
    expect(getCollectionRole([ROLES.FINANCE_STAFF, ROLES.ADMIN])).toBe('admin');
  });

  it('prioritizes finance over cashier when both present', () => {
    expect(getCollectionRole([ROLES.CASHIER, ROLES.CURRENT_ACCOUNTANT])).toBe('finance');
  });
});

describe('getDefaultStatusTab', () => {
  it('returns pending_verify for cashier', () => {
    expect(getDefaultStatusTab('cashier')).toBe('pending_verify');
  });

  it('returns difference_processing for finance', () => {
    expect(getDefaultStatusTab('finance')).toBe('difference_processing');
  });

  it('returns escalated_l1 for supervisor', () => {
    expect(getDefaultStatusTab('supervisor')).toBe('escalated_l1');
  });

  it('returns collecting for admin (default case)', () => {
    expect(getDefaultStatusTab('admin')).toBe('collecting');
  });

  it('returns collecting for marketer (default case)', () => {
    expect(getDefaultStatusTab('marketer')).toBe('collecting');
  });
});
