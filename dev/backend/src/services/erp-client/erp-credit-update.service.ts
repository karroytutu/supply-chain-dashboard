/**
 * ERP 客户授信更新服务
 * 代理舟谱客户最大欠款天数/单数更新 API
 * @module services/erp-client/erp-credit-update.service
 */

import { erpPost } from './erp-client';
import { getErpDefaults } from './erp-config';
import { getErpCustomerProfile } from './erp-customer.service';
import { cache } from '../../utils/cache';
import { CACHE_KEY } from '../../utils/cache-keys';
import { erpUploadImageToErp } from './erp-image-upload';

// =====================================================
// 更新方法
// =====================================================

/**
 * 更新最大欠款天数
 * POST /saas/pro/web/consumer/batch-edit-max-debt-days
 *
 * 请求参数：ids=[customerId], maxDebtDays=String(天数)
 * 对应 ERP 客户字段：maxDebtDays
 */
export async function erpUpdateMaxDebtDays(customerId: number, maxDebtDays: number): Promise<void> {
  const { cid, uid } = getErpDefaults();
  await erpPost(
    '/web/consumer/batch-edit-max-debt-days',
    { ids: [customerId], maxDebtDays: String(maxDebtDays), cid, uid },
    { pathPrefix: '/saas/pro/', businessType: 'credit_update_debt_days' }
  );
}

/**
 * 更新最大欠款单数
 * POST /saas/pro/web/consumer/batch-edit-max-debt-order-num
 *
 * 请求参数：ids=[customerId], maxDebtOrderNum=String(单数)
 * 对应 ERP 客户字段：maxDebtOrderNum
 */
export async function erpUpdateMaxDebtOrderNum(
  customerId: number,
  maxDebtOrderNum: number
): Promise<void> {
  const { cid, uid } = getErpDefaults();
  await erpPost(
    '/web/consumer/batch-edit-max-debt-order-num',
    { ids: [customerId], maxDebtOrderNum: String(maxDebtOrderNum), cid, uid },
    { pathPrefix: '/saas/pro/', businessType: 'credit_update_debt_order_num' }
  );
}

/** erpUploadBusinessLicense / erpUpdateCustomerProfile 可同时更新的客户字段 */
export interface CreditUpdateFields {
  maxDebtDays?: number;
  maxDebtOrderNum?: number;
  /** 结算方式（2=挂账，参见 CREDIT_SETTLE_METHOD_ON_ACCOUNT） */
  settleMethod?: number;
}

/**
 * 上传营业执照照片到 ERP，同时可更新授信字段
 * 1. GET /redcoast/store-query/query-store-web 获取客户完整资料
 * 2. POST /saas/pro/file/uploadWithoutWaterMark 上传图片获取 imgId
 * 3. POST /saas/pro/web/consumer/update-consumer 更新客户资料
 *    （追加 attachedPicIds + 更新授信字段）
 *
 * 将授信字段合并到同一次 update-consumer 调用中，避免以下问题：
 *   先 batch-edit 更新 maxDebtDays，再 update-consumer 用旧快照覆盖回去
 *
 * 任一图片上传失败时抛出错误，不静默跳过
 */
export async function erpUploadBusinessLicense(
  customerId: number,
  photoUrls: string[],
  creditFields?: CreditUpdateFields
): Promise<void> {
  // 步骤1：获取客户完整资料
  const customer = await getErpCustomerProfile(customerId);

  // 步骤2：逐个上传图片，收集 imgId
  const newImgIds: string[] = [];
  for (const photoUrl of photoUrls) {
    const imgId = await erpUploadImageToErp(photoUrl, 'store', 'credit_upload_license');
    if (imgId) {
      newImgIds.push(imgId);
    } else {
      throw new Error(`营业执照上传失败: 文件 ${photoUrl} 上传到 ERP 后未返回 imgId`);
    }
  }

  // 步骤3：更新客户资料，追加 attachedPicIds + 更新授信字段
  const existingPicIds = customer?.ext?.attachedPicIds || [];
  customer.ext = customer.ext || {};
  customer.ext.attachedPicIds = [...existingPicIds, ...newImgIds];

  // 同步更新授信字段，避免 update-consumer 用旧快照覆盖之前的 batch-edit 结果
  // 注意：ERP update-consumer 接口要求 maxDebtDays/maxDebtOrderNum 为字符串
  if (creditFields?.maxDebtDays !== undefined) {
    customer.maxDebtDays = String(creditFields.maxDebtDays);
  }
  if (creditFields?.maxDebtOrderNum !== undefined) {
    customer.maxDebtOrderNum = String(creditFields.maxDebtOrderNum);
  }
  if (creditFields?.settleMethod !== undefined) {
    customer.settleMethod = creditFields.settleMethod;
  }

  await erpPost('/web/consumer/update-consumer', customer, {
    pathPrefix: '/saas/pro/',
    businessType: 'credit_update_customer_profile',
  });

  // 写入后失效客户资料 + 搜索缓存，确保后续读取最新数据
  cache.invalidate(CACHE_KEY.ERP_CUSTOMER_PROFILE_PREFIX);
  cache.invalidate(CACHE_KEY.ERP_CUSTOMER_SEARCH_PREFIX);
}

/**
 * 通过 update-consumer API 原子更新客户资料字段
 * 用于无执照上传时，将授信字段和结算方式合并到单次 update-consumer 调用，
 * 避免 batch-edit + update-consumer 的快照竞态问题
 *
 * POST /saas/pro/web/consumer/update-consumer
 */
export async function erpUpdateCustomerProfile(
  customerId: number,
  updateFields: CreditUpdateFields
): Promise<void> {
  // 获取客户完整资料（含最新字段值）
  const customer = await getErpCustomerProfile(customerId);

  // 应用更新字段到 profile
  if (updateFields.maxDebtDays !== undefined) {
    customer.maxDebtDays = String(updateFields.maxDebtDays);
  }
  if (updateFields.maxDebtOrderNum !== undefined) {
    customer.maxDebtOrderNum = String(updateFields.maxDebtOrderNum);
  }
  if (updateFields.settleMethod !== undefined) {
    customer.settleMethod = updateFields.settleMethod;
  }

  await erpPost('/web/consumer/update-consumer', customer, {
    pathPrefix: '/saas/pro/',
    businessType: 'credit_update_customer_profile',
  });

  // 写入后失效客户资料 + 搜索缓存
  cache.invalidate(CACHE_KEY.ERP_CUSTOMER_PROFILE_PREFIX);
  cache.invalidate(CACHE_KEY.ERP_CUSTOMER_SEARCH_PREFIX);
}
