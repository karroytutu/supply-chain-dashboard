/**
 * 应收账款全景看板 - 聚合服务
 * 参照 workspace.service.ts 模式：单文件聚合，私有函数分板块
 * 数据来源：ERP 欠款 + OA 催收实例 + 预警查询
 *
 * 聚合纯函数已提取到 ar-dashboard-aggregator.ts，供 service 和 warmup 共享
 */
import { createLogger } from '../../utils/logger';
const log = createLogger('ArDashboard');

import { cache, CACHE_TTL } from '../../utils/cache';
import { CACHE_KEY } from '../../utils/cache-keys';
import { AR_TIMEOUT_WARNING_HOURS } from '../../utils/constants';
import { formatDateOnly } from '../../utils/dateFormat';
import { getUpcomingWarnings } from '../ar-collection/ar-warning.query';
import { buildDashboardContext, fetchCollectionOaInstances } from './ar-dashboard-data';
import {
  buildKpiCards,
  buildPipelineNodes,
  buildLegalProgress,
  buildMarketerStats,
  buildDetailRows,
  buildPopupData,
  fd,
  mapInstanceToStatus,
} from './ar-dashboard-aggregator';
import type {
  ArDashboardOverview,
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

/** 安全解包 form_data 为类型化对象（本地复用 aggregator 导出） */
// fd 已从 aggregator 导入

// ============================================
// 主聚合入口
// ============================================

// 兑底去重：防止并发请求触发多次 ERP 刷新
let inFlightRefresh: Promise<ArDashboardOverview> | null = null;

/**
 * 获取看板完整数据（stale-while-revalidate 模式）
 *
 * 定时预热模块每 2 分钟自动刷新缓存，因此用户请求 99% 场景直接命中缓存（<1ms）。
 * 缓存过期时先返回旧数据（带 isStale 标记），后台异步刷新，避免用户等待 10-30 秒。
 * 仅在服务刚启动且预热未完成时，才触发 ERP 数据拉取（兑底逻辑）。
 */
export async function getArDashboardOverview(): Promise<ArDashboardOverview> {
  const cacheKey = CACHE_KEY.AR_DASHBOARD_OVERVIEW;
  const cachedMeta = cache.getWithMeta<ArDashboardOverview>(cacheKey);

  // 缓存命中：注入新鲜度指标后返回（99% 场景，<1ms）
  if (cachedMeta) {
    const cacheAge = Math.round((Date.now() - cachedMeta.timestamp) / 1000);
    return {
      ...cachedMeta.data,
      cacheAge,
      isStale: cacheAge > 300, // 超过 5 分钟视为陈旧
    };
  }

  // stale-while-revalidate 兜底：缓存过期时先返回旧数据，后台异步刷新
  const staleData = cache.getStale<ArDashboardOverview>(cacheKey);
  if (staleData) {
    // 后台异步刷新（不阻塞当前请求）
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
          popupData: buildPopupData(ctx),
          updatedAt: new Date().toISOString(),
          cacheAge: 0,
          isStale: false,
        };
        cache.set(cacheKey, result, CACHE_TTL.ERP_SLOW);
        return result;
      }).finally(() => {
        inFlightRefresh = null;
      });
    }
    // 立即返回旧数据，标记为陈旧
    return { ...staleData, isStale: true };
  }

  // 缓存完全未命中：兑底拉取（仅在服务刚启动且预热未完成时触发）
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
        popupData: buildPopupData(ctx),
        updatedAt: new Date().toISOString(),
        cacheAge: 0,
        isStale: false,
      };
      cache.set(cacheKey, result, CACHE_TTL.ERP_SLOW);
      return result;
    }).finally(() => {
      inFlightRefresh = null;
    });
  }

  return inFlightRefresh;
}

// ============================================
// KPI 卡片 / 催收管道 / 法律进度 / 营销师 / 明细表 / 弹窗
// 以上纯函数已提取到 ar-dashboard-aggregator.ts
// ============================================

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

/**
 * 获取诉讼进度明细（诉讼进度弹窗）
 * 从 OA 实例中筛选 send_letter / lawsuit 类型
 */
export async function getLegalProgressDetails(category: string): Promise<LegalProgressDetailDTO[]> {
  const cacheKey = CACHE_KEY.AR_DASHBOARD_LEGAL_PROGRESS(category);
  const cached = cache.get<LegalProgressDetailDTO[]>(cacheKey);
  if (cached) return cached;

  // 诉讼进度只用 OA 实例数据，不需要 ERP 欠款数据
  const instances = await fetchCollectionOaInstances();

  // 根据 category 筛选不同阶段的实例
  let filtered: OaCollectionInstanceRow[];
  switch (category) {
    case 'noticeSent':
      filtered = instances.filter(i => fd(i).action === 'send_letter');
      break;
    case 'lawsuitFiled':
      // 已起诉：所有 lawsuit 类型（包含在途和已完成的）
      filtered = instances.filter(i => fd(i).action === 'lawsuit');
      break;
    case 'lawsuitInProgress':
      filtered = instances.filter(i => fd(i).action === 'lawsuit' && i.status === 'pending');
      break;
    case 'lawsuitCompleted':
      filtered = instances.filter(i => fd(i).action === 'lawsuit' && i.status === 'approved');
      break;
    default:
      filtered = [];
  }

  const result: LegalProgressDetailDTO[] = filtered.map(inst => ({
    instanceId: inst.id,
    instanceNo: inst.instance_no,
    action: fd(inst).action || '',
    status: inst.status,
    consumerName: fd(inst).consumerName || '',
    totalAmount: Number(fd(inst).totalAmount) || 0,
    submittedAt: formatDateOnly(inst.submitted_at),
    currentApprover: inst.node_name || '',
  }));

  cache.set(cacheKey, result, CACHE_TTL.HIGH_FREQUENCY);
  return result;
}

/**
 * 获取管道节点超时明细（催收进度弹窗 — 时限维度）
 * 从 OA 实例中筛选匹配管道状态的实例，计算剩余处理时限
 */
export async function getPipelineTimeoutDetails(
  status: string,
  escalationLevel?: number
): Promise<PipelineTimeoutDetailDTO[]> {
  const cacheKey = CACHE_KEY.AR_DASHBOARD_PIPELINE_TIMEOUT(status, escalationLevel);
  const cached = cache.get<PipelineTimeoutDetailDTO[]>(cacheKey);
  if (cached) return cached;

  // 催收超时只用 OA 实例数据，不需要 ERP 欠款数据
  const oaInstances = await fetchCollectionOaInstances();
  const now = Date.now();
  const warningMs = AR_TIMEOUT_WARNING_HOURS * 3600000;

  const matched = oaInstances.filter(inst => {
    const mapped = mapInstanceToStatus(inst);
    if (mapped.status !== status) return false;
    if (escalationLevel && mapped.escalationLevel !== escalationLevel) return false;
    return true;
  });

  const result: PipelineTimeoutDetailDTO[] = matched
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

  result.sort((a, b) => a.remainingHours - b.remainingHours);
  cache.set(cacheKey, result, CACHE_TTL.HIGH_FREQUENCY);
  return result;
}
