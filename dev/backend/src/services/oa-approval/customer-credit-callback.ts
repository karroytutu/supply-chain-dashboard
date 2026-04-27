/**
 * 客户授信申请 - 回调逻辑
 * beforeSubmit: 注入提交者角色到 formData，用于动态审批流
 * onApproved: 审批通过后调用 ERP API 更新授信信息
 * @module services/oa-approval/customer-credit-callback
 */

import { getUserRolesAndPermissions } from '../auth.service';
import { erpUpdateMaxDebtDays, erpUpdateMaxDebtOrderNum, erpUploadBusinessLicense } from '../erp-client/erp-credit-update.service';
import type { CreditUpdateFields } from '../erp-client/erp-credit-update.service';
import { erpMarkHoldOrders } from '../erp-client/erp-settlement.service';
import { getCustomerLicenseInfo, getErpCustomerProfile } from '../erp-client/erp-customer.service';
import { updateErpMetaStatus, markErpFailed } from '../fixed-asset/erp-meta-utils';
import { resolveLicenseFilePath } from '../../middleware/credit-upload';
import type { OaApprovalInstanceRow } from './oa-approval.types';

/** 允许提交客户授信申请的角色（admin 可提交所有表单） */
const ALLOWED_ROLES = ['admin', 'marketer', 'marketing_manager', 'current_accountant'];

/**
 * beforeSubmit: 注入提交者角色到 formData
 * 用于动态审批流中条件节点判断
 */
export async function beforeSubmitCustomerCredit(
  formData: Record<string, unknown>,
  userId: number
): Promise<Record<string, unknown>> {
  // 查询提交者的角色
  const { roles } = await getUserRolesAndPermissions(userId);
  const submitterRole = roles.find(r => ALLOWED_ROLES.includes(r.code));

  if (!submitterRole) {
    throw new Error('当前用户无权提交客户授信申请');
  }

  // 注入额外数据到 formData
  const extraData: Record<string, unknown> = { _submitterRole: submitterRole.code };

  // 安全校验：验证营业执照是否已提供
  // 防止前端篡改 _hasExistingLicense 绕过必填校验
  const customerId = Number(formData.customer);
  if (customerId) {
    try {
      const licenseInfo = await getCustomerLicenseInfo(customerId);
      const hasNewUpload = formData.businessLicensePhotos
        && Array.isArray(formData.businessLicensePhotos)
        && formData.businessLicensePhotos.length > 0;
      // ERP 无执照且本次也未上传 → 拒绝提交
      if (!licenseInfo.hasLicense && !hasNewUpload) {
        throw new Error('客户营业执照不能为空');
      }
      // 将 ERP 执照图片 URL 注入 formData，供审批详情展示
      extraData._erpLicenseUrls = licenseInfo.hasLicense && licenseInfo.attachedPicUrls.length > 0
        ? licenseInfo.attachedPicUrls
        : [];
    } catch (error) {
      // "营业执照不能为空"错误直接抛出
      if (error instanceof Error && error.message === '客户营业执照不能为空') {
        throw error;
      }
      // ERP 查询失败 — fail-safe：不信任前端 _hasExistingLicense，强制要求上传
      console.warn('[CustomerCredit] ERP执照查询失败，强制要求上传:', error instanceof Error ? error.message : error);
      const hasNewUpload = formData.businessLicensePhotos
        && Array.isArray(formData.businessLicensePhotos)
        && formData.businessLicensePhotos.length > 0;
      if (!hasNewUpload) {
        throw new Error('无法验证客户执照信息，请上传营业执照照片');
      }
      // ERP 不可用时无法获取执照 URL，置空
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
  instance: OaApprovalInstanceRow,
  formData: Record<string, unknown>
): Promise<void> {
  const creditType = formData.creditType as string;
  const customerId = Number(formData.customer);
  const instanceId = instance.id;

  // 标记 ERP 处理中
  await updateErpMetaStatus(instanceId, 'processing');

  try {
    // 计算授信字段
    let creditFields: CreditUpdateFields | undefined;
    switch (creditType) {
      case 'payment_period':
        creditFields = { maxDebtDays: formData.maxOverdueDays as number };
        break;
      case 'rolling_order':
        creditFields = {
          maxDebtDays: formData.rollingMaxOverdueDays as number,
          maxDebtOrderNum: formData.rollingMaxOverdueOrders as number,
        };
        break;
      case 'hold_order':
        // 压单不涉及授信字段更新
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

    // 如果没有执照上传，单独更新授信字段
    if (creditFields) {
      if (creditFields.maxDebtDays !== undefined) {
        await erpUpdateMaxDebtDays(customerId, creditFields.maxDebtDays);
      }
      if (creditFields.maxDebtOrderNum !== undefined) {
        await erpUpdateMaxDebtOrderNum(customerId, creditFields.maxDebtOrderNum);
      }
    }

    // 压单：标记压单结算单
    if (creditType === 'hold_order') {
      await erpMarkHoldOrders(formData.holdSettlementOrders as number[]);
    }

    // 标记 ERP 处理成功
    await updateErpMetaStatus(instanceId, 'erp_completed');
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
