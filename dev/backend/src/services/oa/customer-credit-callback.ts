/**
 * 客户授信申请 - 回调逻辑
 * beforeSubmit: 校验提交者角色、检测营业执照状态、补全客户名称
 * onApproved: 审批通过后调用 ERP API 更新授信信息
 * @module services/oa/customer-credit-callback
 */
import { createLogger } from '../../utils/logger';
const log = createLogger('OA');

import { getUserRolesAndPermissions } from '../auth.service';
import {
  erpUploadBusinessLicense,
  erpUpdateCustomerProfile,
  type CreditUpdateFields,
} from '../erp-client/erp-credit-update.service';
import { erpMarkHoldOrders } from '../erp-client/erp-settlement.service';
import { getCustomerLicenseInfo, getErpCustomerProfile } from '../erp-client/erp-customer.service';
import { updateErpMetaStatus, markErpFailed } from '../fixed-asset/erp-meta-utils';
import { resolveLicenseFilePath } from '../../middleware/credit-upload';
import { cache } from '../../utils/cache';
import { detectHoardChangesByCustomer } from '../ar-collection/ar-hoard-detect';
import fs from 'fs';
import {
  CREDIT_SETTLE_METHOD_ON_ACCOUNT,
  AR_HOLD_TYPE_LONG_TERM,
  AR_HOLD_TYPE_TIME_LIMITED,
} from '../../utils/constants';
import type { OaInstanceRow, PreviewContextResult } from './oa.types';

/** 允许提交客户授信申请的角色（admin 可提交所有表单） */
const ALLOWED_ROLES = ['admin', 'marketer', 'marketing_manager', 'current_accountant'];

/**
 * 获取客户授信审批的抄送角色（固定抄送总经理）
 * 供 FormTypeDefinition.getCCRoles 回调使用
 */
export function getCustomerCreditCCRoles(_formData: Record<string, unknown>): string[] {
  return ['general_manager'];
}

/**
 * 流程预览上下文：当前无需注入额外字段，返回空上下文
 */
export async function resolveCustomerCreditPreviewContext(
  _formData: Record<string, unknown>,
  _userId: number
): Promise<PreviewContextResult> {
  return { contextFields: {} };
}

/**
 * beforeSubmit: 校验提交者角色、检测营业执照状态、补全客户名称
 */
export async function beforeSubmitCustomerCredit(
  formData: Record<string, unknown>,
  userId: number
): Promise<Record<string, unknown>> {
  // 校验提交者角色
  const { roles } = await getUserRolesAndPermissions(userId);
  const hasAllowedRole = roles.some(r => ALLOWED_ROLES.includes(r.code));
  if (!hasAllowedRole) {
    throw new Error('当前用户无权提交客户授信申请');
  }

  const extraData: Record<string, unknown> = {};

  // 安全校验：检测营业执照状态，标记是否需要后补上传
  const customerId = Number(formData.customer);
  if (customerId) {
    try {
      const licenseInfo = await getCustomerLicenseInfo(customerId);
      const hasNewUpload =
        formData.businessLicensePhotos &&
        Array.isArray(formData.businessLicensePhotos) &&
        formData.businessLicensePhotos.length > 0;
      // ERP 无执照且本次也未上传 → 标记为延期补交
      extraData._licenseDeferred = !licenseInfo.hasLicense && !hasNewUpload;
      // 将 ERP 执照图片 URL 注入 formData，供审批详情展示
      extraData._erpLicenseUrls =
        licenseInfo.hasLicense && licenseInfo.attachedPicUrls.length > 0
          ? licenseInfo.attachedPicUrls
          : [];
    } catch (error) {
      // ERP 查询失败 — 标记为延期补交（允许提交，审批通过后补交）
      log.warn('ERP执照查询失败，标记为延期补交:', error instanceof Error ? error.message : error);
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

  return extraData;
}

/**
 * onApproved: 审批通过后调用 ERP API 更新授信信息
 * 在 ERP 调用前后更新 erp_meta 状态，便于前端追踪和重试
 */
export async function onApprovedCustomerCredit(
  instance: OaInstanceRow,
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
        log.warn(`未知的授信类型: ${creditType}`);
    }

    // 上传营业执照 + 更新授信字段
    // 如果有营业执照需要上传，将授信字段一并传入 erpUploadBusinessLicense，
    // 通过同一次 update-consumer 调用同时更新 attachedPicIds 和授信字段，
    // 避免 update-consumer 用旧快照覆盖之前的 batch-edit 结果
    const hasLicenseUpload =
      formData.businessLicensePhotos &&
      Array.isArray(formData.businessLicensePhotos) &&
      (formData.businessLicensePhotos as Array<{ url?: string }>).some(p => p.url);

    if (hasLicenseUpload) {
      const photos = formData.businessLicensePhotos as Array<{ url?: string }>;
      const filePaths = photos
        .map(p => p.url)
        .filter((url): url is string => !!url)
        .map(url => resolveLicenseFilePath(url))
        // 预检：过滤不存在的文件，避免上传时抛异常（TOCTOU 可接受，实际概率极低）
        .filter(fp => {
          if (!fs.existsSync(fp)) {
            log.warn(`营业执照文件不存在，跳过上传: ${fp}`);
            return false;
          }
          return true;
        });
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

      // 压单审批通过后：清除 ERP 缓存 + 即时检测催收任务
      cache.invalidate('erp:settlement:hoard:');
      cache.invalidate('erp:customer:limits');
      cache.invalidate('erp:customer:debt-name-map');

      // 提取压单类型和天数，传递给检测函数
      const rawHoardType = formData.hoardType as string;
      const hoardType =
        rawHoardType === AR_HOLD_TYPE_TIME_LIMITED
          ? AR_HOLD_TYPE_TIME_LIMITED
          : AR_HOLD_TYPE_LONG_TERM;
      const holdDays =
        hoardType === AR_HOLD_TYPE_TIME_LIMITED ? Number(formData.holdDays) || null : null;

      const consumerName = (formData._customerName || formData.customerName) as string;
      if (consumerName) {
        await detectHoardChangesByCustomer(consumerName, { holdType: hoardType, holdDays }).catch(
          err => {
            log.error('压单即时检测失败（兜底会在06:00执行）:', err);
          }
        );
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
          instance.applicant_name
        );
        log.info(`已创建营业执照延期补交记录(instance=${instanceId})`);
      } catch (err) {
        // 延期记录创建失败不影响主流程
        log.error('营业执照延期记录创建失败:', err);
      }
    }
  } catch (error) {
    log.error('ERP更新失败:', error);
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
