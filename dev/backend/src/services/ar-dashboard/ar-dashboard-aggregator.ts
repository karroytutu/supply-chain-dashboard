/**
 * 应收账款全景看板 - 聚合函数共享模块
 * 纯函数：输入 DashboardContext，输出各板块 DTO
 * 供 service（用户请求）和 warmup（定时预热）共用同一套计算规则
 */
import { AR_TIMEOUT_WARNING_HOURS } from '../../utils/constants';
import { formatDateOnly } from '../../utils/dateFormat';
import type {
  ArDashboardPopupData,
  KpiCardDTO,
  PipelineNodeDTO,
  LegalProgressDTO,
  MarketerStatsDTO,
  ArDetailRowDTO,
  UpcomingExpiryCustomerDTO,
  PipelineExpiryDetailDTO,
  PipelineTimeoutDetailDTO,
  LegalProgressDetailDTO,
  CollectionTaskStatus,
  DashboardContext,
  OaCollectionInstanceRow,
  CollectionFormData,
} from './ar-dashboard.types';

// ============================================
// 共享工具函数
// ============================================

/** 安全解包 form_data 为类型化对象 */
export const fd = (row: OaCollectionInstanceRow): CollectionFormData =>
  (row.form_data ?? {}) as CollectionFormData;

/** 管道节点配置（顺序、标签、颜色、角色） */
export const PIPELINE_CONFIG: Array<{
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
    match: r => ['current_accountant'].includes(r.role_code ?? ''),
  },
];

/** 根据逾期天数计算账龄区间 */
export function calcAgingBucket(overdueDays: number): string {
  if (overdueDays <= 0) return '未逾期';
  if (overdueDays <= 30) return '1-30天';
  if (overdueDays <= 60) return '31-60天';
  if (overdueDays <= 90) return '61-90天';
  return '90天以上';
}

/** 将 OA 实例映射为催收状态 */
export function mapInstanceToStatus(inst: OaCollectionInstanceRow): { status: CollectionTaskStatus; escalationLevel?: 1 | 2 } {
  const roleCode = inst.role_code ?? '';
  const action = fd(inst).action;
  const nodeName = inst.node_name ?? '';

  if (action === 'extension') return { status: 'extension' };
  if (roleCode === 'marketing_manager') return { status: 'escalated', escalationLevel: 1 };
  if (nodeName.includes('差异')) return { status: 'difference_processing' };
  if (['current_accountant'].includes(roleCode)) return { status: 'escalated', escalationLevel: 2 };
  return { status: 'collecting' };
}

/** 生成管道状态 key，与前端保持一致 */
export function pipelineKey(status: CollectionTaskStatus, escalationLevel?: 1 | 2): string {
  return escalationLevel ? `${status}:L${escalationLevel}` : status;
}

// ============================================
// KPI 卡片
// ============================================

export function buildKpiCards(ctx: DashboardContext): KpiCardDTO[] {
  const { enrichedDebts, oaInstances, upcomingWarnings, dsoValue } = ctx;

  let totalReceivable = 0;
  let overdueAmount = 0;
  const customerSet = new Set<string>();
  for (const d of enrichedDebts) {
    const amt = Number(d.leftAmount);
    totalReceivable += amt;
    if (d.isOverdue) overdueAmount += amt;
    customerSet.add(d.consumerName);
  }

  const collectingTasks = oaInstances.filter(i => i.status === 'pending').length;
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

export function buildPipelineNodes(ctx: DashboardContext): PipelineNodeDTO[] {
  const { oaInstances } = ctx;
  const now = Date.now();
  const warningMs = AR_TIMEOUT_WARNING_HOURS * 3600000;

  return PIPELINE_CONFIG.map(cfg => {
    const matched = oaInstances.filter(cfg.match);
    const count = matched.length;
    const amount = matched.reduce((s, r) => {
      return s + (Number(fd(r).totalAmount) || 0);
    }, 0);

    let upcomingTimeoutCount = 0;
    let overdueTimeoutCount = 0;
    for (const inst of matched) {
      if (!inst.deadline_at) continue;
      const remaining = new Date(inst.deadline_at).getTime() - now;
      if (remaining < 0) {
        overdueTimeoutCount++;
      } else if (remaining <= warningMs) {
        upcomingTimeoutCount++;
      }
    }

    const node: PipelineNodeDTO = {
      status: cfg.status,
      label: cfg.label,
      count,
      amount: Math.round(amount),
      pendingRole: cfg.pendingRole,
    };
    if (cfg.escalationLevel) node.escalationLevel = cfg.escalationLevel;
    if (upcomingTimeoutCount > 0) node.upcomingTimeoutCount = upcomingTimeoutCount;
    if (overdueTimeoutCount > 0) node.overdueTimeoutCount = overdueTimeoutCount;
    return node;
  });
}

// ============================================
// 法律进度
// ============================================

export function buildLegalProgress(ctx: DashboardContext): LegalProgressDTO {
  const instances = ctx.oaInstances;
  const noticeSent = instances.filter(i => fd(i).action === 'send_letter').length;
  const lawsuitInstances = instances.filter(i => fd(i).action === 'lawsuit');
  const lawsuitFiled = lawsuitInstances.length;
  const lawsuitInProgress = lawsuitInstances.filter(i => i.status === 'pending').length;
  const lawsuitCompleted = lawsuitInstances.filter(i => i.status === 'approved').length;

  return { noticeSent, lawsuitFiled, lawsuitInProgress, lawsuitCompleted };
}

// ============================================
// 营销师维度
// ============================================

export function buildMarketerStats(ctx: DashboardContext): MarketerStatsDTO[] {
  const { enrichedDebts, oaInstances, dsoValue } = ctx;

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

  const collectingByManager = new Map<string, number>();
  for (const inst of oaInstances) {
    if (inst.status !== 'pending') continue;
    const mgr = fd(inst).managerName || '未知';
    collectingByManager.set(mgr, (collectingByManager.get(mgr) ?? 0) + 1);
  }

  const allManagers = new Set([...debtByManager.keys(), ...collectingByManager.keys()]);
  const result: MarketerStatsDTO[] = [];
  for (const name of allManagers) {
    const debt = debtByManager.get(name);
    result.push({
      marketerId: null,
      marketerName: name,
      debtCustomerCount: debt?.customers.size ?? 0,
      debtAmount: Math.round(debt?.amount ?? 0),
      overdueCustomerCount: debt?.overdueCustomers.size ?? 0,
      overdueAmount: Math.round(debt?.overdueAmount ?? 0),
      dso: dsoValue,
      collectingCount: collectingByManager.get(name) ?? 0,
    });
  }

  result.sort((a, b) => b.debtAmount - a.debtAmount);
  return result;
}

// ============================================
// 明细表
// ============================================

export function buildDetailRows(ctx: DashboardContext): ArDetailRowDTO[] {
  const { enrichedDebts, oaInstances } = ctx;

  const oaStatusByConsumer = new Map<string, {
    status: CollectionTaskStatus; escalationLevel?: 1 | 2;
    oaInstanceId: number; oaInstanceNo: string;
    collectionStartDate: string; deadlineAt: string | null;
  }>();
  for (const inst of oaInstances) {
    const consumer = fd(inst).consumerName;
    if (!consumer) continue;
    const mapped = mapInstanceToStatus(inst);
    oaStatusByConsumer.set(consumer, {
      ...mapped,
      oaInstanceId: inst.id,
      oaInstanceNo: inst.instance_no,
      collectionStartDate: formatDateOnly(inst.submitted_at),
      deadlineAt: inst.deadline_at ? formatDateOnly(inst.deadline_at) : null,
    });
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
      oaInstanceId: oaInfo?.oaInstanceId,
      oaInstanceNo: oaInfo?.oaInstanceNo,
      collectionStartDate: oaInfo?.collectionStartDate,
      deadlineAt: oaInfo?.deadlineAt ?? undefined,
    };
  });
}

// ============================================
// 弹窗预计算
// ============================================

export function buildPopupData(ctx: DashboardContext): ArDashboardPopupData {
  return {
    upcomingExpiryCustomers: computeUpcomingExpiryCustomers(ctx.upcomingWarnings),
    pipelineTimeoutDetails: computeAllPipelineTimeoutDetails(ctx),
    legalProgressDetails: computeAllLegalProgressDetails(ctx),
  };
}

export function computeUpcomingExpiryCustomers(
  warnings: DashboardContext['upcomingWarnings']
): UpcomingExpiryCustomerDTO[] {
  const byConsumer = new Map<string, UpcomingExpiryCustomerDTO>();
  for (const w of warnings) {
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
  return Array.from(byConsumer.values());
}

export function computeAllPipelineTimeoutDetails(ctx: DashboardContext): Record<string, PipelineTimeoutDetailDTO[]> {
  const result: Record<string, PipelineTimeoutDetailDTO[]> = {};
  const now = Date.now();
  const warningMs = AR_TIMEOUT_WARNING_HOURS * 3600000;

  for (const cfg of PIPELINE_CONFIG) {
    const key = pipelineKey(cfg.status, cfg.escalationLevel);
    const matched = ctx.oaInstances.filter(cfg.match);
    const details: PipelineTimeoutDetailDTO[] = matched
      .filter(inst => inst.deadline_at)
      .map(inst => {
        const deadlineMs = new Date(inst.deadline_at!).getTime();
        const remainingMs = deadlineMs - now;
        const remainingHours = Math.round(remainingMs / 3600000 * 10) / 10;
        return {
          instanceId: inst.id,
          instanceNo: inst.instance_no,
          consumerName: fd(inst).consumerName || '',
          totalAmount: Number(fd(inst).totalAmount) || 0,
          collectionStartDate: formatDateOnly(inst.submitted_at),
          deadlineAt: formatDateOnly(inst.deadline_at!),
          remainingHours,
          managerUserName: fd(inst).managerName || '',
          isOverdue: remainingMs < 0,
        };
      });
    details.sort((a, b) => a.remainingHours - b.remainingHours);
    result[key] = details;
  }
  return result;
}

export function computeAllLegalProgressDetails(ctx: DashboardContext): Record<string, LegalProgressDetailDTO[]> {
  const instances = ctx.oaInstances;
  const categories = ['noticeSent', 'lawsuitFiled', 'lawsuitInProgress', 'lawsuitCompleted'] as const;
  const result: Record<string, LegalProgressDetailDTO[]> = {};

  for (const category of categories) {
    let filtered: OaCollectionInstanceRow[];
    switch (category) {
      case 'noticeSent':
        filtered = instances.filter(i => fd(i).action === 'send_letter');
        break;
      case 'lawsuitFiled':
        filtered = instances.filter(i => fd(i).action === 'lawsuit');
        break;
      case 'lawsuitInProgress':
        filtered = instances.filter(i => fd(i).action === 'lawsuit' && i.status === 'pending');
        break;
      case 'lawsuitCompleted':
        filtered = instances.filter(i => fd(i).action === 'lawsuit' && i.status === 'approved');
        break;
    }
    result[category] = filtered.map(inst => ({
      instanceId: inst.id,
      instanceNo: inst.instance_no,
      action: fd(inst).action || '',
      status: inst.status,
      consumerName: fd(inst).consumerName || '',
      totalAmount: Number(fd(inst).totalAmount) || 0,
      submittedAt: formatDateOnly(inst.submitted_at),
      currentApprover: inst.node_name || '',
    }));
  }
  return result;
}
