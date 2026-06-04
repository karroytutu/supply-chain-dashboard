/**
 * 催收筛选 - 工具函数与类型定义
 * 纯函数，无 React 依赖
 */
import type { CollectionTaskStatus, EscalationLevel } from '@/types/ar-collection';
import { ROLES } from '@/constants/permissions';

/** 角色类型 */
export type RoleView = 'marketer' | 'supervisor' | 'finance' | 'cashier' | 'admin';

/** 升级子 Tab 类型 */
export type EscalationTab = 'escalated_l1' | 'escalated_l2';

/** 状态 Tab 类型 */
export type StatusTab = Exclude<CollectionTaskStatus, 'escalated'> | EscalationTab;

/** 将 Tab key 映射为 API 查询参数 */
export function tabToApiParams(tab: StatusTab): { status?: CollectionTaskStatus; escalationLevel?: EscalationLevel } {
  if (tab === 'escalated_l1') return { status: 'escalated', escalationLevel: 1 };
  if (tab === 'escalated_l2') return { status: 'escalated', escalationLevel: 2 };
  return { status: tab };
}

/** 根据用户真实角色映射到催收业务角色视图 */
export function getCollectionRole(roles: string[]): RoleView {
  if (roles.includes(ROLES.ADMIN) || roles.includes(ROLES.MANAGER) || roles.includes(ROLES.MARKETING_MANAGER)) return 'admin';
  if (roles.includes(ROLES.MARKETING_SUPERVISOR)) return 'admin';
  if (roles.includes(ROLES.CURRENT_ACCOUNTANT) || roles.includes(ROLES.FINANCE_STAFF)) return 'finance';
  if (roles.includes(ROLES.CASHIER)) return 'cashier';
  if (roles.includes(ROLES.MARKETER)) return 'marketer';
  return 'marketer';
}

/** 根据催收业务角色返回默认状态 Tab */
export function getDefaultStatusTab(role: RoleView): StatusTab {
  switch (role) {
    case 'cashier':
      return 'pending_verify';
    case 'finance':
      return 'difference_processing';
    case 'supervisor':
      return 'escalated_l1';
    default:
      return 'collecting';
  }
}

export interface CollectionFilters {
  page: number;
  pageSize: number;
  statusTab: StatusTab;
  searchKeyword: string;
  handlerId: number | null;
  dateRange: [import('dayjs').Dayjs | null, import('dayjs').Dayjs | null] | null;
}
