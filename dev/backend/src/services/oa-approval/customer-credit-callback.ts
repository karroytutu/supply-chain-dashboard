/**
 * 客户授信申请 - 回调逻辑
 * beforeSubmit: 注入提交者角色到 formData，用于动态审批流
 * onApproved: 审批通过后调用 ERP API 更新授信信息
 * @module services/oa-approval/customer-credit-callback
 */

import { getUserRolesAndPermissions } from '../auth.service';
import { erpUpdateMaxDebtDays, erpUpdateMaxDebtOrderNum, erpUploadBusinessLicense } from '../erp-client/erp-credit-update.service';
import { erpMarkHoldOrders } from '../erp-client/erp-settlement.service';
import { getCustomerLicenseInfo, getErpCustomerProfile } from '../erp-client/erp-customer.service';
import { updateErpMetaStatus, markErpFailed } from '../fixed-asset/erp-meta-utils';
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
    }
  }

  // 注入 _submitterRole 到 formData，供条件节点判断
  const extraData: Record<string, unknown> = { _submitterRole: submitterRole.code };

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
    switch (creditType) {
      case 'payment_period':
        // 账期：更新最大欠款天数
        await erpUpdateMaxDebtDays(customerId, formData.maxOverdueDays as number);
        break;

      case 'rolling_order':
        // 滚单：更新最大欠款天数 + 最大欠款单数
        await erpUpdateMaxDebtDays(customerId, formData.rollingMaxOverdueDays as number);
        await erpUpdateMaxDebtOrderNum(customerId, formData.rollingMaxOverdueOrders as number);
        break;

      case 'hold_order':
        // 压单：标记压单结算单
        await erpMarkHoldOrders(formData.holdSettlementOrders as number[]);
        break;

      default:
        console.warn(`[CustomerCredit] 未知的授信类型: ${creditType}`);
    }

    // 上传营业执照照片到 ERP
    if (formData.businessLicensePhotos) {
      const photos = formData.businessLicensePhotos;
      const photoUrls = Array.isArray(photos) ? photos.map(String) : [String(photos)];
      if (photoUrls.length > 0) {
        await erpUploadBusinessLicense(customerId, photoUrls);
      }
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
