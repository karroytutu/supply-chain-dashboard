/**
 * 工作台聚合服务
 * 聚合各业务模块待办数据，供首页工作台展示
 */

import { getApprovalStats, getCollectionOaStats } from '../oa/oa.query';
import { getStats as getReturnOrderStats } from '../return-order/return-order.repository';
import { getStats as getStrategicProductStats } from '../strategic-product/strategic-product.repository';
import { getStats as getAssessmentStats } from '../assessment/assessment.repository';
import { cache, CACHE_TTL } from '../../utils/cache';
import { CACHE_KEY } from '../../utils/cache-keys';

/** 工作台模块待办数据 */
export interface WorkspaceModule {
  code: string;
  name: string;
  icon: string;
  /** 该模块待办总数 */
  totalPending: number;
  /** 子项列表 */
  items: WorkspaceItem[];
}

export interface WorkspaceItem {
  label: string;
  count: number;
  /** urgent / warning / normal */
  level: 'urgent' | 'warning' | 'normal';
}

/** 工作台汇总 */
export interface WorkspaceSummary {
  totalPending: number;
  urgentCount: number;
  todayNew: number;
  todayDone: number;
}

export interface WorkspaceData {
  summary: WorkspaceSummary;
  modules: WorkspaceModule[];
}

/**
 * 获取工作台聚合数据
 * 按用户权限过滤模块，无权限的模块不返回
 */
export async function getWorkspaceData(
  userId: number,
  permissions: string[],
  roles: string[]
): Promise<WorkspaceData> {
  const cacheKey = CACHE_KEY.WORKSPACE_DATA(userId);
  const cached = cache.get<WorkspaceData>(cacheKey);
  if (cached) return cached;

  const modules: WorkspaceModule[] = [];
  let totalPending = 0;
  let urgentCount = 0;
  let todayNew = 0;
  let todayDone = 0;

  // 并行获取各模块数据，各模块独立容错
  const [oaData, collectionData, returnData, strategicData, assessmentData] =
    await Promise.allSettled([
      hasPermission(permissions, roles, 'oa:read') ? fetchOaModule(userId) : Promise.resolve(null),
      hasPermission(permissions, roles, 'ar:collection:read')
        ? fetchCollectionModule(userId, roles)
        : Promise.resolve(null),
      hasPermission(permissions, roles, 'return:read')
        ? fetchReturnModule()
        : Promise.resolve(null),
      hasPermission(permissions, roles, 'strategic:read')
        ? fetchStrategicModule()
        : Promise.resolve(null),
      hasPermission(permissions, roles, 'assessment:read')
        ? fetchAssessmentModule()
        : Promise.resolve(null),
    ]);

  // 收集结果（强制 Number() 防止 pg bigint string 导致字符串拼接）
  const results = [oaData, collectionData, returnData, strategicData, assessmentData];
  for (const result of results) {
    if (result.status === 'fulfilled' && result.value) {
      const mod = result.value;
      modules.push(mod);
      totalPending += Number(mod.totalPending) || 0;
      urgentCount += mod.items
        .filter(i => i.level === 'urgent')
        .reduce((s, i) => s + (Number(i.count) || 0), 0);
    }
  }

  // 今日新增 / 今日已处理：从考核模块取
  if (assessmentData.status === 'fulfilled' && assessmentData.value) {
    const val = assessmentData.value;
    if ('_todayNew' in val) {
      todayNew += val._todayNew || 0;
      todayDone += val._todayDone || 0;
    }
  }

  const data: WorkspaceData = {
    summary: { totalPending, urgentCount, todayNew, todayDone },
    modules,
  };

  cache.set(cacheKey, data, CACHE_TTL.HIGH_FREQUENCY);
  return data;
}

// ==================== 各模块数据获取 ====================

async function fetchOaModule(userId: number): Promise<WorkspaceModule> {
  const stats = await getApprovalStats(userId);
  // pg COUNT 返回 bigint(string)，必须转 number，否则 += 会变成字符串拼接
  const pending = Number(stats.pending) || 0;
  const my = Number(stats.my) || 0;
  const cc = Number(stats.cc) || 0;

  return {
    code: 'oa',
    name: 'OA系统',
    icon: 'AuditOutlined',
    totalPending: pending,
    items: [
      { label: '待我处理', count: pending, level: pending > 0 ? 'urgent' : 'normal' },
      { label: '我发起的（处理中）', count: my, level: 'normal' },
      { label: '抄送给我', count: cc, level: 'normal' },
    ],
  };
}

async function fetchCollectionModule(userId: number, roles: string[]): Promise<WorkspaceModule> {
  // 按角色优先级选取最合适的角色进行查询
  const role = pickCollectionRole(roles);
  const stats = await getCollectionOaStats(userId, role);
  const pending = Number(stats.pending?.count) || 0;
  const approved = Number(stats.approved?.count) || 0;
  const attention = Number(stats.attention?.count) || 0;

  return {
    code: 'collection',
    name: '催收管理',
    icon: 'AlertOutlined',
    totalPending: pending,
    items: [
      { label: '待审批', count: pending, level: pending > 0 ? 'urgent' : 'normal' },
      { label: '已通过', count: approved, level: 'normal' },
      { label: '需关注（差异处理）', count: attention, level: attention > 0 ? 'warning' : 'normal' },
    ],
  };
}

async function fetchReturnModule(): Promise<WorkspaceModule> {
  const stats = await getReturnOrderStats();
  const pendingConfirm = Number(stats?.pending_confirm) || 0;
  const pendingErp = Number(stats?.pending_erp_fill) || 0;
  const pendingWarehouse = Number(stats?.pending_warehouse_execute) || 0;

  return {
    code: 'return-order',
    name: '采购退货',
    icon: 'ShoppingOutlined',
    totalPending: pendingConfirm + pendingErp + pendingWarehouse,
    items: [
      {
        label: '退货单待确认',
        count: pendingConfirm,
        level: pendingConfirm > 0 ? 'urgent' : 'normal',
      },
      { label: '待ERP填写', count: pendingErp, level: pendingErp > 0 ? 'warning' : 'normal' },
      { label: '待仓储执行', count: pendingWarehouse, level: 'normal' },
    ],
  };
}

async function fetchStrategicModule(): Promise<WorkspaceModule> {
  const stats = await getStrategicProductStats();
  const pending = Number(stats?.pending) || 0;

  return {
    code: 'strategic-product',
    name: '战略商品',
    icon: 'StarOutlined',
    totalPending: pending,
    items: [{ label: '待确认商品', count: pending, level: pending > 0 ? 'warning' : 'normal' }],
  };
}

async function fetchAssessmentModule(): Promise<
  WorkspaceModule & { _todayNew: number; _todayDone: number }
> {
  const stats = await getAssessmentStats();
  const pendingCount = Number(stats?.pending_count) || 0;
  const todayNew = Number(stats?.today_new) || 0;
  // 使用今日确认数（而非全量确认数），反映当日处理进度
  const todayConfirmed = Number(stats?.today_confirmed) || 0;

  return {
    code: 'assessment',
    name: '考核中心',
    icon: 'AuditOutlined',
    totalPending: pendingCount,
    items: [
      { label: '待处理考核', count: pendingCount, level: pendingCount > 0 ? 'warning' : 'normal' },
    ],
    _todayNew: todayNew,
    _todayDone: todayConfirmed,
  };
}

// ==================== 工具函数 ====================

/**
 * 权限检查：支持 admin 角色绕过和具体权限码匹配
 */
function hasPermission(permissions: string[], roles: string[], code: string): boolean {
  if (!permissions || permissions.length === 0) return false;
  if (roles?.includes('admin')) return true;
  return permissions.includes(code);
}

/**
 * 从用户角色列表中选取催收查询角色
 * 优先级：marketer > current_accountant > cashier > 默认（admin/manager 看全量）
 */
function pickCollectionRole(roles: string[]): string {
  if (!roles || roles.length === 0) return 'viewer';
  if (roles.includes('marketer')) return 'marketer';
  if (roles.includes('current_accountant')) return 'current_accountant';
  if (roles.includes('cashier')) return 'cashier';
  // admin / manager / marketing_manager 等角色使用默认全量视图
  return 'admin';
}
