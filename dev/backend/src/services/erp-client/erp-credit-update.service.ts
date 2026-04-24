/**
 * ERP 客户授信更新服务
 * 代理舟谱客户最大欠款天数/单数更新 API
 * @module services/erp-client/erp-credit-update.service
 */

import { erpPost } from './erp-client';
import { getErpDefaults } from './erp-config';
import { getErpCustomerProfile } from './erp-customer.service';
import type { ErpCustomerProfile } from './erp-customer.service';

// =====================================================
// 更新方法
// =====================================================

/**
 * 更新最大欠款天数
 * POST /saas/pro/web/consumer/batch-edit-max-debt-days
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
 */
export async function erpUpdateMaxDebtOrderNum(customerId: number, maxDebtOrderNum: number): Promise<void> {
  const { cid, uid } = getErpDefaults();
  await erpPost(
    '/web/consumer/batch-edit-max-debt-order-num',
    { ids: [customerId], maxDebtOrderNum: String(maxDebtOrderNum), cid, uid },
    { pathPrefix: '/saas/pro/', businessType: 'credit_update_debt_order_num' }
  );
}

/**
 * 上传营业执照照片到 ERP（3步流程）
 * 1. GET /redcoast/store-query/query-store-web 获取客户完整资料
 * 2. POST /saas/pro/file/uploadWithoutWaterMark 上传图片获取 imgId
 * 3. POST /saas/pro/web/consumer/update-consumer 更新客户资料（追加 attachedPicIds）
 */
export async function erpUploadBusinessLicense(
  customerId: number,
  photoUrls: string[]
): Promise<void> {
  // 步骤1：获取客户完整资料
  const customer = await getErpCustomerProfile(customerId);

  // 步骤2：逐个上传图片，收集 imgId
  const newImgIds: string[] = [];
  for (const photoUrl of photoUrls) {
    const imgId = await erpUploadImage(photoUrl);
    if (imgId) {
      newImgIds.push(imgId);
    }
  }

  // 步骤3：更新客户资料，追加 attachedPicIds
  if (newImgIds.length > 0) {
    const existingPicIds = customer?.ext?.attachedPicIds || [];
    customer.ext = customer.ext || {};
    customer.ext.attachedPicIds = [...existingPicIds, ...newImgIds];

    await erpPost(
      '/web/consumer/update-consumer',
      customer,
      { pathPrefix: '/saas/pro/', businessType: 'credit_update_customer_profile' }
    );
  }
}

// =====================================================
// 内部方法
// =====================================================

/**
 * 上传图片到 ERP，返回 imgId
 * POST /saas/pro/file/uploadWithoutWaterMark (multipart/form-data)
 * 返回: { code: 0, data: [{ imgId: "xxx", downloadUrl: "https://..." }] }
 */
async function erpUploadImage(localFilePath: string): Promise<string | null> {
  const { getErpConfig } = await import('./erp-config');
  const { getErpAccessToken } = await import('./erp-auth');
  const config = getErpConfig();
  const token = await getErpAccessToken();

  // 动态导入避免循环依赖
  const FormData = (await import('form-data')).default;
  const fs = await import('fs');
  const path = await import('path');

  const form = new FormData();
  form.append('file', fs.createReadStream(localFilePath));

  const fullPath = `/saas/pro/file/uploadWithoutWaterMark`.replace(/\/+/g, '/');
  const url = `${config.baseUrl}${fullPath}`;

  const axios = (await import('axios')).default;
  const response = await axios.post(url, form, {
    headers: {
      'authorization': `Bearer ${token}`,
      'cid': config.cid,
      'uid': config.uid,
      'SaasCid': config.cid,
      ...form.getHeaders(),
    },
    timeout: config.timeout,
  });

  const data = response.data?.data;
  return Array.isArray(data) && data.length > 0 ? data[0].imgId : null;
}
