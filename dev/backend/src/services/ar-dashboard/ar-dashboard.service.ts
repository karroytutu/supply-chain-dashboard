/**
 * 应收账款全景看板 - 聚合服务
 * 参照 workspace.service.ts 模式：单文件聚合，私有函数分板块
 * 数据来源：ERP 欠款 + OA 催收实例 + 预警查询
 */
import { createLogger } from '../../utils/logger';
const log = createLogger('ArDashboard');

import { cache, CACHE_TTL } from '../../utils/cache';
import { CACHE_KEY } from '../../utils/cache-keys';
import { getUpcomingWarnings } from '../ar-collection/ar-warning.query';
import { buildDashboardContext } from './ar-dashboard-data';
import type {
  ArDashboardOverview,
  KpiCardDTO,
  PipelineNodeDTO,
  LegalProgressDTO,
  MarketerStatsDTO,
  ArDetailRowDTO,
  UpcomingExpiryCustomerDTO,
  PipelineExpiryDetailDTO,
  CollectionTaskStatus,
  DashboardContext,
  OaCollectionInstanceRow,
  CollectionFormData,
} from './ar-dashboard.types';

/** 安全解包 form_data 为类型化对象 */
const fd = (row: OaCollectionInstanceRow): CollectionFormData =>
  (row.form_data ?? {}) as CollectionFormData;

// ============================================
// 主聚合入口
// ============================================

// stale-while-revalidate 去重：避免并发请求触发多次 ERP 刷新
let inFlightRefresh: Promise<ArDashboardOverview> | null = null;

/**
 * 获取看板完整数据（支持 stale-while-revalidate）
 * 缓存 60s，过期时先返回旧数据再异步刷新
 */
export async function getArDashboardOverview(): Promise<ArDashboardOverview> {
  const cacheKey = CACHE_KEY.AR_DASHBOARD_OVERVIEW;
  const cached = cache.getStale<ArDashboardOverview>(cacheKey);

  if (cached && cache.isFresh(cacheKey)) return cached;

  // 复用进行中的刷新 Promise，避免并发请求重复调用 ERP
  if (!inFlightRefresh) {
    inFlightRefresh = buildDashboardContext().then(ctx => {
      const marketers = buildMarketerStats(ctx);
      const result: ArDashboardOverview = {
        kpiCards: buildKpiCards(ctx),
        pipeline: {
          nodes: buildPipelineNodes(ctx),
          legalProgress: buildLegalProgress(ctx),
        },
        marketers,
        details: buildDetailRows(ctx),
        marketerOptions: marketers
          .filter(m => m.marketerName)
          .map(m => ({ value: m.marketerName, label: m.marketerName })),
        updatedAt: new Date().toISOString(),
      };
      cache.set(cacheKey, result, CACHE_TTL.DASHBOARD);
      return result;
    }).finally(() => {
      inFlightRefresh = null;
    });
  }

  // stale-while-revalidate：有旧数据立即返回，后台刷新
  if (cached) {
    inFlightRefresh.catch(err => log.error('异步刷新看板缓存失败:', err));
    return cached;
  }
  // 无缓存：等待刷新完成
  return inFlightRefresh;
}

// ============================================
// KPI 卡片
// ============================================

function buildKpiCards(ctx: DashboardContext): KpiCardDTO[] {
  const { enrichedDebts, oaInstances, upcomingWarnings, dsoValue } = ctx;

  // 应收总额 + 逾期总额 + 客户数
  let totalReceivable = 0;
  let overdueAmount = 0;
  const customerSet = new Set<string>();
  for (const d of enrichedDebts) {
    const amt = Number(d.leftAmount);
    totalReceivable += amt;
    if (d.isOverdue) overdueAmount += amt;
    customerSet.add(d.consumerName);
  }

  // 催收中任务数（OA 实例 pending 状态）
  const collectingTasks = oaInstances.filter(i => i.status === 'pending').length;

  // 即将逾期统计
  const upcomingCount = upcomingWarnings.length;
  const upcomingAmount = upcomingWarnings.reduce((s, w) => s + w.leftAmount, 0);
  const upcomingCustomers = new Set(upcomingWarnings.map(w => w.consumerName)).size;

  return [
    { key: 'totalReceivable', title: '应收总额', value: Math.round(totalReceivable), unit: '元' },
    { key: 'overdueAmount', title: '逾期总额', value: Math.round(overdueAmount), unit: '元' },
    { key: 'customerCount', title: '应收客户数', value: customerSet.size, unit: '家' },
    { key: 'dso', title: 'DSO · 应收周转天数', value: dsoValue, unit: '天' },
    { key: 'collectingTasks', title: '催收中任务', value: collectingTasks, unit: '笔' },
    {
      key: 'upcomingExpiry', title: '即将逾期 · 5天内', value: upcomingCount, unit: '笔',
      auxiliary: [
        { label: '涉及金额', value: `¥${Math.round(upcomingAmount).toLocaleString()}` },
        { label: '涉及客户', value: `${upcomingCustomers} 家` },
      ],
    },
  ];
}

// ============================================
// 催收管道
// ============================================

/** 管道节点配置（顺序、标签、颜色、角色） */
const PIPELINE_CONFIG: Array<{
  status: CollectionTaskStatus;
  label: string;
  pendingRole: 'marketer' | 'supervisor' | 'finance';
  escalationLevel?: 1 | 2;
  match: (row: OaCollectionInstanceRow) => boolean;
}> = [
  {
    status: 'collecting', label: '催收中', pendingRole: 'marketer',
    match: r => r.role_code === 'marketer' && !fd(r).action,
  },
  {
    status: 'extension', label: '延期', pendingRole: 'marketer',
    match: r => fd(r).action === 'extension',
  },
  {
    status: 'escalated', label: '已升级·经理', pendingRole: 'supervisor', escalationLevel: 1,
    match: r => r.role_code === 'marketing_manager',
  },
  {
    status: 'difference_processing', label: '差异处理', pendingRole: 'finance',
    match: r => (r.node_name ?? '').includes('差异'),
  },
  {
    status: 'escalated', label: '已升级·财务', pendingRole: 'finance', escalationLevel: 2,
    match: r => ['current_accountant', 'finance_staff'].includes(r.role_code ?? ''),
  },
];

function buildPipelineNodes(ctx: DashboardContext): PipelineNodeDTO[] {
  const { oaInstances, upcomingWarnings } = ctx;

  // 构建即将逾期按 OA 实例的匹配（通过 billNo/consumerName 关联）
  const upcomingByConsumer = new Map<string, number>();
  for (const w of upcomingWarnings) {
    upcomingByConsumer.set(w.consumerName, (upcomingByConsumer.get(w.consumerName) ?? 0) + 1);
  }

  return PIPELINE_CONFIG.map(cfg => {
    const matched = oaInstances.filter(cfg.match);
    const count = matched.length;
    const amount = matched.reduce((s, r) => {
      return s + (Number(fd(r).totalAmount) || 0);
    }, 0);

    // 即将逾期笔数：匹配实例的消费者在 upcomingByConsumer 中的计数
    let upcomingExpiryCount = 0;
    for (const inst of matched) {
      const consumer = fd(inst).consumerName;
      if (consumer) upcomingExpiryCount += upcomingByConsumer.get(consumer) ?? 0;
    }

    const node: PipelineNodeDTO = {
      status: cfg.status,
      label: cfg.label,
      count,
      amount: Math.round(amount),
      pendingRole: cfg.pendingRole,
    };
    if (cfg.escalationLevel) node.escalationLevel = cfg.escalationLevel;
    if (upcomingExpiryCount > 0) node.upcomingExpiryCount = upcomingExpiryCount;
    return node;
  });
}

// ============================================
// 法律进度
// ============================================

function buildLegalProgress(ctx: DashboardContext): LegalProgressDTO {
  // 法律进度需要从 OA 审批动作历史统计
  // 由于是聚合统计且调用频率低，这里返回基于 OA 实例的近似值
  // send_letter 和 lawsuit 是 OA 表单中的 action 选项
  const instances = ctx.oaInstances;
  const noticeSent = instances.filter(
    i => fd(i).action === 'send_letter'
  ).length;
  const lawsuitInstances = instances.filter(
    i => fd(i).action === 'lawsuit'
  );
  const lawsuitFiled = lawsuitInstances.length;
  const lawsuitInProgress = lawsuitInstances.filter(i => i.status === 'pending').length;
  const lawsuitCompleted = lawsuitInstances.filter(i => i.status === 'approved').length;

  return { noticeSent, lawsuitFiled, lawsuitInProgress, lawsuitCompleted };
}

// ============================================
// 营销师维度
// ============================================

function buildMarketerStats(ctx: DashboardContext): MarketerStatsDTO[] {
  const { enrichedDebts, oaInstances, dsoValue } = ctx;

  // 1. ERP 欠款按 managerUsers 分组
  const debtByManager = new Map<string, {
    customers: Set<string>; amount: number;
    overdueCustomers: Set<string>; overdueAmount: number;
  }>();

  for (const d of enrichedDebts) {
    const mgr = d.managerUsers || '未知';
    let entry = debtByManager.get(mgr);
    if (!entry) {
      entry = { customers: new Set(), amount: 0, overdueCustomers: new Set(), overdueAmount: 0 };
      debtByManager.set(mgr, entry);
    }
    entry.customers.add(d.consumerName);
    entry.amount += Number(d.leftAmount);
    if (d.isOverdue) {
      entry.overdueCustomers.add(d.consumerName);
      entry.overdueAmount += Number(d.leftAmount);
    }
  }

  // 2. OA 实例按 managerName 统计 collectingCount
  const collectingByManager = new Map<string, number>();
  for (const inst of oaInstances) {
    if (inst.status !== 'pending') continue;
    const mgr = fd(inst).managerName || '未知';
    collectingByManager.set(mgr, (collectingByManager.get(mgr) ?? 0) + 1);
  }

  // 3. 合并结果
  const allManagers = new Set([...debtByManager.keys(), ...collectingByManager.keys()]);
  const result: MarketerStatsDTO[] = [];
  for (const name of allManagers) {
    const debt = debtByManager.get(name);
    result.push({
      marketerId: null, // 后续从 users 表查
      marketerName: name,
      debtCustomerCount: debt?.customers.size ?? 0,
      debtAmount: Math.round(debt?.amount ?? 0),
      overdueCustomerCount: debt?.overdueCustomers.size ?? 0,
      overdueAmount: Math.round(debt?.overdueAmount ?? 0),
      dso: dsoValue,
      collectingCount: collectingByManager.get(name) ?? 0,
    });
  }

  // 按欠款总额降序
  result.sort((a, b) => b.debtAmount - a.debtAmount);
  return result;
}

// ============================================
// 明细表
// ============================================

function buildDetailRows(ctx: DashboardContext): ArDetailRowDTO[] {
  const { enrichedDebts, oaInstances } = ctx;

  // 构建 OA 实例按 consumerName 的状态映射（取最新/活跃的）
  const oaStatusByConsumer = new Map<string, { status: CollectionTaskStatus; escalationLevel?: 1 | 2 }>();
  for (const inst of oaInstances) {
    const consumer = fd(inst).consumerName;
    if (!consumer) continue;
    const mapped = mapInstanceToStatus(inst);
    oaStatusByConsumer.set(consumer, mapped);
  }

  return enrichedDebts.map(d => {
    const oaInfo = oaStatusByConsumer.get(d.consumerName);
    return {
      billNo: d.bizOrderStr || d.billId,
      consumerName: d.consumerName,
      billTypeName: d.billTypeName || '',
      totalAmount: Number(d.totalAmount),
      leftAmount: Number(d.leftAmount),
      billOrderTime: d.workTime?.slice(0, 10) ?? '',
      expireTime: d.overdueDateStr ?? '',
      overdueDays: d.overdueDays,
      agingBucket: calcAgingBucket(d.overdueDays),
      creditLimit: d.customerMaxDebtAmount,
      status: oaInfo?.status ?? null,
      escalationLevel: oaInfo?.escalationLevel,
      managerUserName: d.managerUsers || '',
    };
  });
}

/** 根据逾期天数计算账龄区间 */
function calcAgingBucket(overdueDays: number): string {
  if (overdueDays <= 0) return '未逾期';
  if (overdueDays <= 30) return '1-30天';
  if (overdueDays <= 60) return '31-60天';
  if (overdueDays <= 90) return '61-90天';
  return '90天以上';
}

/** 将 OA 实例映射为催收状态 */
function mapInstanceToStatus(inst: OaCollectionInstanceRow): { status: CollectionTaskStatus; escalationLevel?: 1 | 2 } {
  const roleCode = inst.role_code ?? '';
  const action = fd(inst).action;
  const nodeName = inst.node_name ?? '';

  if (action === 'extension') return { status: 'extension' };
  if (roleCode === 'marketing_manager') return { status: 'escalated', escalationLevel: 1 };
  if (nodeName.includes('差异')) return { status: 'difference_processing' };
  if (['current_accountant', 'finance_staff'].includes(roleCode)) return { status: 'escalated', escalationLevel: 2 };
  return { status: 'collecting' };
}

// ============================================
// 弹窗服务
// ============================================

/**
 * 获取即将逾期客户维度数据（KPI 卡片弹窗）
 * 复用 getUpcomingWarnings 后按客户聚合
 */
export async function getUpcomingExpiryCustomers(): Promise<UpcomingExpiryCustomerDTO[]> {
  const cacheKey = CACHE_KEY.AR_DASHBOARD_UPCOMING_EXPIRY;
  const cached = cache.get<UpcomingExpiryCustomerDTO[]>(cacheKey);
  if (cached) return cached;

  const warnings = await getUpcomingWarnings({ pageSize: 9999 });
  const byConsumer = new Map<string, UpcomingExpiryCustomerDTO>();

  for (const w of warnings.details) {
    const existing = byConsumer.get(w.consumerName);
    if (existing) {
      existing.billCount++;
      existing.totalAmount += w.leftAmount;
      if (w.expireDate < existing.nearestExpireDate) existing.nearestExpireDate = w.expireDate;
    } else {
      byConsumer.set(w.consumerName, {
        consumerName: w.consumerName,
        billCount: 1,
        totalAmount: w.leftAmount,
        nearestExpireDate: w.expireDate,
        managerUserName: w.managerUserName,
      });
    }
  }

  const result = Array.from(byConsumer.values());
  cache.set(cacheKey, result, CACHE_TTL.HIGH_FREQUENCY);
  return result;
}

/**
 * 获取管道节点即将逾期明细（管道节点弹窗）
 * 从 ERP 欠款中筛选即将到期的记录，交叉引用 OA 实例状态
 */
export async function getPipelineExpiryDetails(
  status: string,
  escalationLevel?: number
): Promise<PipelineExpiryDetailDTO[]> {
  const cacheKey = CACHE_KEY.AR_DASHBOARD_PIPELINE_EXPIRY(status, escalationLevel);
  const cached = cache.get<PipelineExpiryDetailDTO[]>(cacheKey);
  if (cached) return cached;

  const ctx = await buildDashboardContext();
  const now = new Date();
  const fiveDaysLater = new Date(now.getTime() + 5 * 86400000);

  // 找出匹配指定管道状态的 OA 实例对应的消费者
  const matchedConsumers = new Set<string>();
  for (const inst of ctx.oaInstances) {
    const mapped = mapInstanceToStatus(inst);
    if (mapped.status !== status) continue;
    if (escalationLevel && mapped.escalationLevel !== escalationLevel) continue;
    const consumer = fd(inst).consumerName;
    if (consumer) matchedConsumers.add(consumer);
  }

  // 从 ERP 欠款中筛选这些消费者的即将到期记录
  const result: PipelineExpiryDetailDTO[] = [];
  for (const d of ctx.enrichedDebts) {
    if (!matchedConsumers.has(d.consumerName)) continue;
    if (d.isOverdue) continue; // 只取未逾期但即将到期的
    const expireDate = new Date(d.overdueDateStr);
    if (expireDate >= now && expireDate <= fiveDaysLater) {
      const daysToExpire = Math.ceil((expireDate.getTime() - now.getTime()) / 86400000);
      result.push({
        billNo: d.bizOrderStr || d.billId,
        consumerName: d.consumerName,
        leftAmount: Number(d.leftAmount),
        expireTime: d.overdueDateStr,
        daysToExpire,
        managerUserName: d.managerUsers || '',
      });
    }
  }

  result.sort((a, b) => a.daysToExpire - b.daysToExpire);
  cache.set(cacheKey, result, CACHE_TTL.HIGH_FREQUENCY);
  return result;
}
