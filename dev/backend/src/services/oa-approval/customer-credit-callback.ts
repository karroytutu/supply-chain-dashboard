/**
 * 客户授信申请 - 回调逻辑
 * beforeSubmit: 注入提交者角色、分级审批字段到 formData，用于动态审批流
 * onApproved: 审批通过后调用 ERP API 更新授信信息
 * @module services/oa-approval/customer-credit-callback
 */

import { getUserRolesAndPermissions } from '../auth.service';
import { erpUploadBusinessLicense, erpUpdateCustomerProfile } from '../erp-client/erp-credit-update.service';
import type { CreditUpdateFields } from '../erp-client/erp-credit-update.service';
import { erpMarkHoldOrders, searchErpSettlementOrders } from '../erp-client/erp-settlement.service';
import { getCustomerLicenseInfo, getErpCustomerProfile } from '../erp-client/erp-customer.service';
import { updateErpMetaStatus, markErpFailed } from '../fixed-asset/erp-meta-utils';
import { resolveLicenseFilePath } from '../../middleware/credit-upload';
import { cache } from '../../utils/cache';
import { reconcileHoardDetailsByCustomer } from '../ar-collection/ar-hoard-reconcile';
import {
  CREDIT_OVERDUE_ACCOUNTANT_DAYS,
  CREDIT_OVERDUE_GM_DAYS,
  CREDIT_HOLD_AMOUNT_ACCOUNTANT,
  CREDIT_HOLD_AMOUNT_GM,
  CREDIT_SETTLE_METHOD_ON_ACCOUNT,
} from '../../utils/constants';
import type { OaApprovalInstanceRow, PreviewContextResult } from './oa-approval.types';

/** 允许提交客户授信申请的角色（admin 可提交所有表单） */
const ALLOWED_ROLES = ['admin', 'marketer', 'marketing_manager', 'current_accountant'];

// =====================================================
// 分级审批规则配置（结构化，参照 PENALTY_RULES 范例）
// =====================================================

/** 审批分级结果 */
interface ApprovalTierResult {
  /** 分级名称：low / medium / high */
  tier: 'low' | 'medium' | 'high';
  /** 是否需要营销经理审批 */
  needsManagerApproval: boolean;
  /** 是否需要往来会计审批（含提交人自跳过逻辑） */
  needsAccountantApproval: boolean;
  /** 是否需要总经理审批 */
  needsGmApproval: boolean;
  /** 该级别的抄送角色列表 */
  ccRoles: string[];
}

/**
 * 根据授信类型、业务指标和提交人角色，确定审批分级
 * 分级规则：
 *   账期/滚单：≤30天=low, 30-60天=medium, >60天=high
 *   压单：≤500元=low, 500-1000元=medium, >1000元=high
 * 提交人自跳过：marketing_manager 跳过节点1，current_accountant 跳过节点2
 */
function resolveApprovalTier(params: {
  creditType: string;
  metric: number;
  submitterRole: string;
}): ApprovalTierResult {
  const { creditType, metric, submitterRole } = params;

  // 根据授信类型选择阈值
  const isHoldOrder = creditType === 'hold_order';
  const accountantThreshold = isHoldOrder ? CREDIT_HOLD_AMOUNT_ACCOUNTANT : CREDIT_OVERDUE_ACCOUNTANT_DAYS;
  const gmThreshold = isHoldOrder ? CREDIT_HOLD_AMOUNT_GM : CREDIT_OVERDUE_GM_DAYS;

  // 确定分级
  let tier: 'low' | 'medium' | 'high';
  let tierCcRoles: string[];

  if (metric > gmThreshold) {
    tier = 'high';
    tierCcRoles = []; // 全部为审批人，无需抄送
  } else if (metric > accountantThreshold) {
    tier = 'medium';
    tierCcRoles = ['general_manager'];
  } else {
    tier = 'low';
    tierCcRoles = ['current_accountant', 'general_manager'];
  }

  // 计算节点可见性（含提交人自跳过）
  const needsManagerApproval = submitterRole !== 'marketing_manager';
  const needsAccountantApproval = tier !== 'low' && submitterRole !== 'current_accountant';
  const needsGmApproval = tier === 'high';

  return { tier, needsManagerApproval, needsAccountantApproval, needsGmApproval, ccRoles: tierCcRoles };
}

/**
 * 获取客户授信审批的动态抄送角色
 * 供 FormTypeDefinition.getCCRoles 回调使用
 */
export function getCustomerCreditCCRoles(formData: Record<string, unknown>): string[] {
  const roles = formData._ccRoles;
  return Array.isArray(roles) ? roles : [];
}

/**
 * 共享分级计算函数：查询提交者角色、计算分级指标、解析审批分级
 * 供 beforeSubmit（提交校验+数据增强）和 resolvePreviewContext（流程预览）复用
 *
 * @returns 提交者角色、分级指标、分级结果；无有效角色时返回 null
 */
async function computeCustomerCreditTier(
  formData: Record<string, unknown>,
  userId: number
): Promise<{ submitterRole: string; metric: number; tierResult: ApprovalTierResult } | null> {
  const { roles } = await getUserRolesAndPermissions(userId);
  const submitterRole = roles.find(r => ALLOWED_ROLES.includes(r.code));
  if (!submitterRole) return null;

  const creditType = formData.creditType as string;

  // 计算分级指标
  let metric: number;
  if (creditType === 'hold_order') {
    const customerId = Number(formData.customer);
    metric = await computeHoldOrderAmount(customerId, formData.holdSettlementOrders);
  } else if (creditType === 'rolling_order') {
    metric = Number(formData.rollingMaxOverdueDays) || 0;
  } else {
    metric = Number(formData.maxOverdueDays) || 0;
  }

  const tierResult = resolveApprovalTier({
    creditType,
    metric,
    submitterRole: submitterRole.code,
  });

  return { submitterRole: submitterRole.code, metric, tierResult };
}

/**
 * 流程预览上下文解析：根据当前表单数据动态注入计算字段
 * 与 beforeSubmit 共享 computeCustomerCreditTier 分级逻辑，但无校验、无副作用
 * 出错时返回空上下文，不影响流程预览展示
 */
export async function resolveCustomerCreditPreviewContext(
  formData: Record<string, unknown>,
  userId: number
): Promise<PreviewContextResult> {
  try {
    const tierData = await computeCustomerCreditTier(formData, userId);
    if (!tierData) return { contextFields: {} };

    return {
      contextFields: {
        _submitterRole: tierData.submitterRole,
        _approvalTier: tierData.tierResult.tier,
        _needsManagerApproval: tierData.tierResult.needsManagerApproval ? 'yes' : 'no',
        _needsAccountantApproval: tierData.tierResult.needsAccountantApproval ? 'yes' : 'no',
        _needsGmApproval: tierData.tierResult.needsGmApproval ? 'yes' : 'no',
      },
    };
  } catch {
    // 预览场景：ERP 查询失败等不影响用户填写表单，返回空上下文
    return { contextFields: {} };
  }
}

/**
 * beforeSubmit: 注入提交者角色和分级审批字段到 formData
 * 用于动态审批流中条件节点判断和 CC 角色解析
 */
export async function beforeSubmitCustomerCredit(
  formData: Record<string, unknown>,
  userId: number
): Promise<Record<string, unknown>> {
  // 通过共享函数获取分级数据
  const tierData = await computeCustomerCreditTier(formData, userId);
  if (!tierData) {
    throw new Error('当前用户无权提交客户授信申请');
  }

  // 注入额外数据到 formData
  const extraData: Record<string, unknown> = { _submitterRole: tierData.submitterRole };

  // 安全校验：检测营业执照状态，标记是否需要后补上传
  const customerId = Number(formData.customer);
  if (customerId) {
    try {
      const licenseInfo = await getCustomerLicenseInfo(customerId);
      const hasNewUpload = formData.businessLicensePhotos
        && Array.isArray(formData.businessLicensePhotos)
        && formData.businessLicensePhotos.length > 0;
      // ERP 无执照且本次也未上传 → 标记为延期补交
      extraData._licenseDeferred = !licenseInfo.hasLicense && !hasNewUpload;
      // 将 ERP 执照图片 URL 注入 formData，供审批详情展示
      extraData._erpLicenseUrls = licenseInfo.hasLicense && licenseInfo.attachedPicUrls.length > 0
        ? licenseInfo.attachedPicUrls
        : [];
    } catch (error) {
      // ERP 查询失败 — 标记为延期补交（允许提交，审批通过后补交）
      console.warn('[CustomerCredit] ERP执照查询失败，标记为延期补交:', error instanceof Error ? error.message : error);
      extraData._licenseDeferred = true;
      extraData._erpLicenseUrls = [];
    }
  }

  // 兜底：如果前端未正确存入 customerName，后端补全
  if (customerId && !formData.customerName && !formData._customerName) {
    try {
      const profile = await getErpCustomerProfile(customerId);
      extraData._customerName = profile?.name || '';
    } catch {
      // ERP 不可用时跳过，不影响提交流程
    }
  }

  // === 分级审批字段注入 ===
  extraData._approvalTier = tierData.tierResult.tier;
  extraData._needsManagerApproval = tierData.tierResult.needsManagerApproval ? 'yes' : 'no';
  extraData._needsAccountantApproval = tierData.tierResult.needsAccountantApproval ? 'yes' : 'no';
  extraData._needsGmApproval = tierData.tierResult.needsGmApproval ? 'yes' : 'no';
  extraData._ccRoles = tierData.tierResult.ccRoles;

  // 压单类型额外注入金额合计
  if ((formData.creditType as string) === 'hold_order') {
    extraData._holdOrderTotalAmount = tierData.metric;
  }

  return extraData;
}

/**
 * 计算压单结算单金额合计
 * 从 ERP 查询客户的所有结算单，筛选出用户选择的结算单，求和 totalAmount
 */
async function computeHoldOrderAmount(
  customerId: number,
  holdSettlementOrders: unknown
): Promise<number> {
  const orderIds = Array.isArray(holdSettlementOrders)
    ? holdSettlementOrders.map(Number)
    : [];

  if (orderIds.length === 0) {
    return 0;
  }

  try {
    // 请求足够多的记录以确保覆盖所有选中的订单
    // ERP API 每页最多 100 条，设置 maxRecords 确保分页获取
    const orders = await searchErpSettlementOrders({
      traderId: customerId,
      maxRecords: Math.max(100, orderIds.length + 50),
    });
    const selectedIds = new Set(orderIds);
    const selectedOrders = orders.filter(o => selectedIds.has(o.id));

    if (selectedOrders.length < orderIds.length) {
      console.warn(
        `[CustomerCredit] 压单结算单查询不完整：选中 ${orderIds.length} 条，仅匹配 ${selectedOrders.length} 条`
      );
    }

    const totalAmount = selectedOrders.reduce(
      (sum, o) => sum + parseFloat(o.totalAmount || '0'), 0
    );
    return Math.abs(totalAmount);
  } catch (error) {
    throw new Error('无法获取压单结算单金额信息，请稍后重试');
  }
}

/**
 * onApproved: 审批通过后调用 ERP API 更新授信信息
 * 在 ERP 调用前后更新 erp_meta 状态，便于前端追踪和重试
 */
export async function onApprovedCustomerCredit(
  instance: OaApprovalInstanceRow,
  formData: Record<string, unknown>
): Promise<void> {
  const creditType = formData.creditType as string;
  const customerId = Number(formData.customer);
  const instanceId = instance.id;

  // 标记 ERP 处理中
  await updateErpMetaStatus(instanceId, 'processing');

  try {
    // 计算授信字段（所有类型都需将结算方式改为挂账）
    let creditFields: CreditUpdateFields | undefined;
    switch (creditType) {
      case 'payment_period':
        creditFields = {
          maxDebtDays: formData.maxOverdueDays as number,
          settleMethod: CREDIT_SETTLE_METHOD_ON_ACCOUNT,
        };
        break;
      case 'rolling_order':
        creditFields = {
          maxDebtDays: formData.rollingMaxOverdueDays as number,
          maxDebtOrderNum: formData.rollingMaxOverdueOrders as number,
          settleMethod: CREDIT_SETTLE_METHOD_ON_ACCOUNT,
        };
        break;
      case 'hold_order':
        creditFields = { settleMethod: CREDIT_SETTLE_METHOD_ON_ACCOUNT };
        break;
      default:
        console.warn(`[CustomerCredit] 未知的授信类型: ${creditType}`);
    }

    // 上传营业执照 + 更新授信字段
    // 如果有营业执照需要上传，将授信字段一并传入 erpUploadBusinessLicense，
    // 通过同一次 update-consumer 调用同时更新 attachedPicIds 和授信字段，
    // 避免 update-consumer 用旧快照覆盖之前的 batch-edit 结果
    const hasLicenseUpload = formData.businessLicensePhotos
      && Array.isArray(formData.businessLicensePhotos)
      && (formData.businessLicensePhotos as Array<{ url?: string }>).some(p => p.url);

    if (hasLicenseUpload) {
      const photos = formData.businessLicensePhotos as Array<{ url?: string }>;
      const filePaths = photos
        .map(p => p.url)
        .filter((url): url is string => !!url)
        .map(url => resolveLicenseFilePath(url));
      if (filePaths.length > 0) {
        await erpUploadBusinessLicense(customerId, filePaths, creditFields);
        // 授信字段已随 update-consumer 一并更新，清除标记避免重复调用
        creditFields = undefined;
      }
    }

    // 如果没有执照上传，通过 update-consumer 原子更新所有授信字段
    // 使用 erpUpdateCustomerProfile 而非 batch-edit API，避免 update-consumer 用旧快照覆盖
    if (creditFields) {
      await erpUpdateCustomerProfile(customerId, creditFields);
    }

    // 压单：标记压单结算单
    if (creditType === 'hold_order') {
      await erpMarkHoldOrders(formData.holdSettlementOrders as number[], customerId);

      // 压单审批通过后：清除 ERP 缓存 + 即时对账催收任务
      cache.invalidate('erp:settlement:hoard:');
      cache.invalidate('erp:customer:limits');
      cache.invalidate('erp:customer:debt-name-map');

      const consumerName = (formData._customerName || formData.customerName) as string;
      if (consumerName) {
        await reconcileHoardDetailsByCustomer(consumerName).catch(err => {
          console.error('[CustomerCredit] 压单即时对账失败（兜底会在06:00执行）:', err);
        });
      }
    }

    // 标记 ERP 处理成功
    await updateErpMetaStatus(instanceId, 'erp_completed');

    // 营业执照延期补交：如果未上传执照，创建延期追踪记录
    if (formData._licenseDeferred) {
      try {
        const { createDeferredUploadAfterApproval } = await import('../credit-license');
        await createDeferredUploadAfterApproval(
          instanceId,
          customerId,
          (formData._customerName || formData.customerName) as string,
          instance.applicant_id,
          instance.applicant_name,
        );
        console.log(`[CustomerCredit] 已创建营业执照延期补交记录(instance=${instanceId})`);
      } catch (err) {
        // 延期记录创建失败不影响主流程
        console.error('[CustomerCredit] 营业执照延期记录创建失败:', err);
      }
    }
  } catch (error) {
    console.error('[CustomerCredit] ERP更新失败:', error);
    // 记录错误到 erp_meta，便于前端展示和重试
    await markErpFailed(instanceId, {
      error: error instanceof Error ? error.message : String(error),
      creditType,
      customerId,
      timestamp: new Date().toISOString(),
    });
    throw error;
  }
}
