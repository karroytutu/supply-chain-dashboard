/**
 * 客户授信申请 - 回调逻辑
 * beforeSubmit: 注入提交者角色到 formData，用于动态审批流
 * onApproved: 审批通过后调用 ERP API 更新授信信息
 * @module services/oa-approval/customer-credit-callback
 */

import { getUserRolesAndPermissions } from '../auth.service';
import { erpUpdateMaxDebtDays, erpUpdateMaxDebtOrderNum, erpUploadBusinessLicense } from '../erp-client/erp-credit-update.service';
import { erpMarkHoldOrders } from '../erp-client/erp-settlement.service';
import type { OaApprovalInstanceRow } from './oa-approval.types';

/** 允许提交客户授信申请的角色 */
const ALLOWED_ROLES = ['marketer', 'marketing_manager', 'current_accountant'];

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

  // 注入 _submitterRole 到 formData，供条件节点判断
  return { _submitterRole: submitterRole.code };
}

/**
 * onApproved: 审批通过后调用 ERP API 更新授信信息
 */
export async function onApprovedCustomerCredit(
  instance: OaApprovalInstanceRow,
  formData: Record<string, unknown>
): Promise<void> {
  const creditType = formData.creditType as string;
  const customerId = Number(formData.customer);

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
  } catch (error) {
    console.error('[CustomerCredit] ERP更新失败:', error);
    throw error;
  }
}
