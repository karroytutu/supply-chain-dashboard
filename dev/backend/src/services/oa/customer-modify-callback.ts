/**
 * 客户档案修改 - 回调逻辑
 * beforeSubmit: 校验提交者角色、补全客户名称
 * onApproved: 审批通过后更新 ERP 客户档案（含欠款再校验）
 * @module services/oa/customer-modify-callback
 */
import { createLogger } from '../../utils/logger';
const log = createLogger('OA');

import { getErpCustomerProfile, getCustomerDebtTotal } from '../erp-client/erp-customer.service';
import {
  erpUpdateCustomerFields,
  type CustomerFieldUpdates,
} from '../erp-client/erp-customer-update.service';
import { erpUploadImageToErp } from '../erp-client/erp-image-upload';
import {
  getErpGrades,
  getErpGroups,
  getErpAreas,
} from '../erp-client/erp-customer-reference.service';
import { updateErpMetaStatus, markErpFailed } from '../fixed-asset/erp-meta-utils';
import { getErpStaff } from '../fixed-asset/fixed-asset.query';
import { resolveLicenseFilePath } from '../../middleware/credit-upload';
import { CUSTOMER_STATE_DISABLED } from '../../utils/constants';
import fs from 'fs';
import type { OaInstanceRow } from './oa.types';
import type { FormAccessor } from './form-accessor';

/**
 * 捕获客户当前 ERP 档案的原始值，用于审批详情页变更对比
 * 返回 _original_* 前缀的字段，存入 formData
 */
async function captureOriginalValues(
  customerId: number,
  formData: Record<string, unknown>,
  existingProfile?: import('../erp-client/erp-customer.service').ErpCustomerProfile | null
): Promise<Record<string, unknown>> {
  const originals: Record<string, unknown> = {};

  // 获取客户当前档案（复用已有查询结果，避免重复请求）
  const profile = existingProfile ?? (await getErpCustomerProfile(customerId));
  if (!profile) return originals;

  // 文本字段直接从 profile 取（ErpCustomerProfile 已声明 contactName/contactTel）
  originals._original_customerName = profile.name ?? '';
  originals._original_contactName = profile.contactName ?? '';
  originals._original_contactTel = profile.contactTel ?? '';
  originals._original_customerState = profile.state ?? null;

  // 门头照：profile API 不返回 picture，从 formData 的 autoFill 值取
  originals._original_storefrontPhotoUrl = formData._storefrontPhotoUrl || '';

  // ERP 引用字段 ID（gradeId 不在显式接口上，通过索引签名访问）
  const gradeId = (profile as Record<string, unknown>).gradeId ?? null;
  const groupId = profile.groupId ?? null;
  const areaId = profile.areaId ?? null;
  const consumerManagerId = profile.consumerManagerId ?? null;

  originals._original_gradeId = gradeId;
  originals._original_groupId = groupId;
  originals._original_areaId = areaId;
  originals._original_consumerManagerId = consumerManagerId;

  // 注意：serviceStaffId 不在 ERP profile API 返回中，无法捕获真实原始值
  // 不参与变更对比，避免将提交值（新值）误当原始值导致 diff 恒等

  // 并行解析所有引用名称
  const [grades, groups, areas, staffList] = await Promise.all([
    gradeId ? getErpGrades() : Promise.resolve([]),
    groupId ? getErpGroups() : Promise.resolve([]),
    areaId ? getErpAreas() : Promise.resolve([]),
    consumerManagerId ? getErpStaff() : Promise.resolve([]),
  ]);

  // 等级名称
  if (gradeId) {
    const grade = grades.find(g => String(g.id) === String(gradeId));
    originals._original_gradeName = grade?.name ?? '';
  }

  // 渠道名称
  if (groupId) {
    const group = groups.find(g => String(g.id) === String(groupId));
    originals._original_groupName = group?.name ?? '';
  }

  // 片区名称
  if (areaId) {
    const area = areas.find(a => String(a.id) === String(areaId));
    originals._original_areaName = area?.name ?? '';
  }

  // 所属营销名称
  if (consumerManagerId) {
    const staff = staffList.find(s => String(s.id) === String(consumerManagerId));
    originals._original_consumerManagerName = staff?.name ?? '';
  }

  return originals;
}

/**
 * beforeSubmit: 校验提交者角色、补全客户名称、捕获原始值用于变更对比
 */
export async function beforeSubmitCustomerModify(
  formData: Record<string, unknown>,
  userId: number
): Promise<Record<string, unknown>> {
  const extraData: Record<string, unknown> = {};
  const customerId = Number(formData.customer);

  // 获取客户档案（一次查询，复用于兜底补全和变更对比捕获）
  let profile: import('../erp-client/erp-customer.service').ErpCustomerProfile | null = null;
  if (customerId) {
    try {
      profile = await getErpCustomerProfile(customerId);
    } catch {
      // ERP 不可用时跳过，不影响提交流程
    }

    // 兜底：如果前端未正确存入 _customerName，后端补全
    if (!formData._customerName && profile) {
      extraData._customerName = profile.name || '';
    }

    // 捕获原始值用于审批详情页变更对比（ERP 不可用时不阻塞提交）
    try {
      const originals = await captureOriginalValues(customerId, formData, profile);
      Object.assign(extraData, originals);
    } catch (err) {
      log.warn('捕获原始值失败，变更对比将不可用:', err);
    }
  }

  return extraData;
}

/**
 * onApproved: 审批通过后更新 ERP 客户档案
 * 在 ERP 调用前后更新 erp_meta 状态，便于前端追踪和重试
 */
export async function onApprovedCustomerModify(
  instance: OaInstanceRow,
  form: FormAccessor
): Promise<void> {
  const customerId = form.getNumber('customer') ?? 0;
  const instanceId = instance.id;
  const customerState = form.getRaw('customerState');

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
    const storefrontPhoto = form.getRaw('storefrontPhoto');
    const hasPhotoUpload =
      storefrontPhoto &&
      Array.isArray(storefrontPhoto) &&
      (storefrontPhoto as Array<{ url?: string }>).some(p => p.url);

    if (hasPhotoUpload) {
      const photos = storefrontPhoto as Array<{ url?: string }>;
      const photo = photos.find(p => p.url);
      if (photo?.url) {
        const filePath = resolveLicenseFilePath(photo.url);
        if (fs.existsSync(filePath)) {
          const imgId = await erpUploadImageToErp(filePath, 'store', 'customer_modify_storefront');
          if (imgId) {
            newPictureImgId = imgId;
          } else {
            log.warn('门头照上传未返回 imgId');
          }
        } else {
          log.warn(`门头照文件不存在，跳过上传: ${filePath}`);
        }
      }
    }

    // ===== 构建更新字段 =====
    const updates: CustomerFieldUpdates = {};

    // 基本信息
    const customerName = form.getString('customerName');
    if (customerName !== undefined) updates.name = customerName;
    const contactName = form.getString('contactName');
    if (contactName !== undefined) updates.contactName = contactName;
    const contactTel = form.getString('contactTel');
    if (contactTel !== undefined) updates.contactTel = contactTel;
    
    // 状态
    if (customerState !== undefined) updates.state = Number(customerState);
    
    // 所属营销：存储 staff ID，需解析为 name 后同步更新 ERP
    const consumerManagerId = form.getRaw('consumerManagerId');
    if (consumerManagerId !== undefined && consumerManagerId !== null) {
      updates.consumerManagerId = Number(consumerManagerId);
      // 优先使用隐藏字段中的名称（由 erp_staff 下拉 nameField 自动填充）
      const consumerManagerName = form.getString('_consumerManagerName');
      if (consumerManagerName && consumerManagerName.trim()) {
        updates.consumerManagerName = consumerManagerName;
      } else {
        // 兜底：通过 ERP staff API 解析名称
        const staffList = await getErpStaff();
        const staff = staffList.find(s => String(s.id) === String(consumerManagerId));
        if (staff) {
          updates.consumerManagerName = staff.name;
        }
      }
    }
    
    // 服务员工：同所属营销，需同时更新 ID 和名称
    const serviceStaffId = form.getRaw('serviceStaffId');
    if (serviceStaffId !== undefined && serviceStaffId !== null) {
      updates.serviceStaffId = Number(serviceStaffId);
      const serviceStaffName = form.getString('_serviceStaffName');
      if (serviceStaffName && serviceStaffName.trim()) {
        updates.serviceStaffName = serviceStaffName;
      } else {
        const staffList = await getErpStaff();
        const staff = staffList.find(s => String(s.id) === String(serviceStaffId));
        if (staff) {
          updates.serviceStaffName = staff.name;
        }
      }
    }
    
    // 等级：需要同时更新 gradeId 和 gradeName
    const gradeId = form.getRaw('gradeId');
    if (gradeId !== undefined && gradeId !== null) {
      updates.gradeId = gradeId as string | number;
      const grades = await getErpGrades();
      const grade = grades.find(g => String(g.id) === String(gradeId));
      if (grade) updates.gradeName = grade.name;
    }
    
    // 渠道：需要同时更新 groupId 和 groupName
    const groupId = form.getRaw('groupId');
    if (groupId !== undefined && groupId !== null) {
      updates.groupId = groupId as string | number;
      const groups = await getErpGroups();
      const group = groups.find(g => String(g.id) === String(groupId));
      if (group) updates.groupName = group.name;
    }
    
    // 片区：需要同时更新 areaId 和 areaName
    const areaId = form.getRaw('areaId');
    if (areaId !== undefined && areaId !== null) {
      updates.areaId = areaId as string | number;
      const areas = await getErpAreas();
      const area = areas.find(a => String(a.id) === String(areaId));
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
