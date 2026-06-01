/**
 * 客户档案修改 - 回调逻辑
 * beforeSubmit: 校验提交者角色、补全客户名称
 * onApproved: 审批通过后更新 ERP 客户档案（含欠款再校验）
 * @module services/oa-approval/customer-modify-callback
 */

import { getUserRolesAndPermissions } from '../auth.service';
import { getErpCustomerProfile } from '../erp-client/erp-customer.service';
import { getCustomerDebtTotal } from '../erp-client/erp-customer.service';
import { erpUpdateCustomerFields, type CustomerFieldUpdates } from '../erp-client/erp-customer-update.service';
import { erpUploadImageToErp } from '../erp-client/erp-image-upload';
import { getErpGrades, getErpGroups, getErpAreas } from '../erp-client/erp-customer-reference.service';
import { updateErpMetaStatus, markErpFailed } from '../fixed-asset/erp-meta-utils';
import { getErpStaff } from '../fixed-asset/fixed-asset.query';
import { resolveLicenseFilePath } from '../../middleware/credit-upload';
import {
  CUSTOMER_MODIFY_ALLOWED_ROLES,
  CUSTOMER_STATE_DISABLED,
} from '../../utils/constants';
import fs from 'fs';
import type { OaApprovalInstanceRow } from './oa-approval.types';

/**
 * beforeSubmit: 校验提交者角色、补全客户名称
 */
export async function beforeSubmitCustomerModify(
  formData: Record<string, unknown>,
  userId: number
): Promise<Record<string, unknown>> {
  // 校验提交者角色
  const { roles } = await getUserRolesAndPermissions(userId);
  const hasAllowedRole = roles.some(r => CUSTOMER_MODIFY_ALLOWED_ROLES.includes(r.code));
  if (!hasAllowedRole) {
    throw new Error('当前用户无权提交客户档案修改申请');
  }

  const extraData: Record<string, unknown> = {};

  // 兜底：如果前端未正确存入 _customerName，后端补全
  const customerId = Number(formData.customer);
  if (customerId && !formData._customerName) {
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
 * onApproved: 审批通过后更新 ERP 客户档案
 * 在 ERP 调用前后更新 erp_meta 状态，便于前端追踪和重试
 */
export async function onApprovedCustomerModify(
  instance: OaApprovalInstanceRow,
  formData: Record<string, unknown>
): Promise<void> {
  const customerId = Number(formData.customer);
  const instanceId = instance.id;
  const customerState = formData.customerState;

  // 标记 ERP 处理中
  await updateErpMetaStatus(instanceId, 'processing');

  try {
    // ===== 欠款再校验（如果要将客户停用） =====
    const isDisabling = String(customerState) === String(CUSTOMER_STATE_DISABLED);
    if (isDisabling) {
      const debtTotal = await getCustomerDebtTotal(customerId);
      if (debtTotal > 0) {
        throw new Error(
          `审批期间客户产生新欠款（¥${debtTotal.toFixed(2)}），无法停用，审批自动失败`
        );
      }
    }

    // ===== 处理门头照上传（如有） =====
    let newPictureImgId: string | undefined;
    const hasPhotoUpload = formData.storefrontPhoto
      && Array.isArray(formData.storefrontPhoto)
      && (formData.storefrontPhoto as Array<{ url?: string }>).some(p => p.url);

    if (hasPhotoUpload) {
      const photos = formData.storefrontPhoto as Array<{ url?: string }>;
      const photo = photos.find(p => p.url);
      if (photo?.url) {
        const filePath = resolveLicenseFilePath(photo.url);
        if (fs.existsSync(filePath)) {
          const imgId = await erpUploadImageToErp(filePath, 'store', 'customer_modify_storefront');
          if (imgId) {
            newPictureImgId = imgId;
          } else {
            console.warn('[CustomerModify] 门头照上传未返回 imgId');
          }
        } else {
          console.warn(`[CustomerModify] 门头照文件不存在，跳过上传: ${filePath}`);
        }
      }
    }

    // ===== 构建更新字段 =====
    const updates: CustomerFieldUpdates = {};

    // 基本信息
    if (formData.customerName !== undefined) updates.name = formData.customerName as string;
    if (formData.contactName !== undefined) updates.contactName = formData.contactName as string;
    if (formData.contactTel !== undefined) updates.contactTel = formData.contactTel as string;

    // 状态
    if (customerState !== undefined) updates.state = Number(customerState);

    // 所属营销：存储 staff ID，需解析为 name 后同步更新 ERP
    if (formData.consumerManagerId !== undefined && formData.consumerManagerId !== null) {
      updates.consumerManagerId = Number(formData.consumerManagerId);
      // 优先使用隐藏字段中的名称（由 erp_staff 下拉 nameField 自动填充）
      if (formData._consumerManagerName && String(formData._consumerManagerName).trim()) {
        updates.consumerManagerName = String(formData._consumerManagerName);
      } else {
        // 兜底：通过 ERP staff API 解析名称
        const staffList = await getErpStaff();
        const staff = staffList.find(s => String(s.id) === String(formData.consumerManagerId));
        if (staff) {
          updates.consumerManagerName = staff.name;
        }
      }
    }
    
    // 服务员工：同所属营销，需同时更新 ID 和名称
    if (formData.serviceStaffId !== undefined && formData.serviceStaffId !== null) {
      updates.serviceStaffId = Number(formData.serviceStaffId);
      if (formData._serviceStaffName && String(formData._serviceStaffName).trim()) {
        updates.serviceStaffName = String(formData._serviceStaffName);
      } else {
        const staffList = await getErpStaff();
        const staff = staffList.find(s => String(s.id) === String(formData.serviceStaffId));
        if (staff) {
          updates.serviceStaffName = staff.name;
        }
      }
    }

    // 等级：需要同时更新 gradeId 和 gradeName
    if (formData.gradeId !== undefined && formData.gradeId !== null) {
      updates.gradeId = formData.gradeId as string | number;
      const grades = await getErpGrades();
      const grade = grades.find(g => String(g.id) === String(formData.gradeId));
      if (grade) updates.gradeName = grade.name;
    }

    // 渠道：需要同时更新 groupId 和 groupName
    if (formData.groupId !== undefined && formData.groupId !== null) {
      updates.groupId = formData.groupId as string | number;
      const groups = await getErpGroups();
      const group = groups.find(g => String(g.id) === String(formData.groupId));
      if (group) updates.groupName = group.name;
    }

    // 片区：需要同时更新 areaId 和 areaName
    if (formData.areaId !== undefined && formData.areaId !== null) {
      updates.areaId = formData.areaId as string | number;
      const areas = await getErpAreas();
      const area = areas.find(a => String(a.id) === String(formData.areaId));
      if (area) updates.areaName = area.name;
    }

    // 门头照
    if (newPictureImgId) {
      updates.picture = newPictureImgId;
    }

    // ===== 调用 ERP 更新 =====
    await erpUpdateCustomerFields(customerId, updates);

    // 标记完成
    await updateErpMetaStatus(instanceId, 'erp_completed');
  } catch (error) {
    // 安全网：标记为失败，便于管理员重试
    await markErpFailed(instanceId, {
      error: error instanceof Error ? error.message : String(error),
      customerId,
    });
    throw error;
  }
}
