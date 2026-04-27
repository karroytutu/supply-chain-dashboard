/**
 * ERP 客户授信更新服务
 * 代理舟谱客户最大欠款天数/单数更新 API
 * @module services/erp-client/erp-credit-update.service
 */

import { erpPost } from './erp-client';
import { getErpDefaults } from './erp-config';
import { getErpCustomerProfile } from './erp-customer.service';
import type { ErpCustomerProfile } from './erp-customer.service';
import { createLogEntry, writeErpLog } from './erp-logger';

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
export async function erpUpdateMaxDebtOrderNum(customerId: number, maxDebtOrderNum: number): Promise<void> {
  const { cid, uid } = getErpDefaults();
  await erpPost(
    '/web/consumer/batch-edit-max-debt-order-num',
    { ids: [customerId], maxDebtOrderNum: String(maxDebtOrderNum), cid, uid },
    { pathPrefix: '/saas/pro/', businessType: 'credit_update_debt_order_num' }
  );
}

/** erpUploadBusinessLicense 可同时更新的授信字段 */
export interface CreditUpdateFields {
  maxDebtDays?: number;
  maxDebtOrderNum?: number;
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
    const imgId = await erpUploadImage(photoUrl);
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

  await erpPost(
    '/web/consumer/update-consumer',
    customer,
    { pathPrefix: '/saas/pro/', businessType: 'credit_update_customer_profile' }
  );
}

// =====================================================
// 内部方法
// =====================================================

/**
 * 上传图片到 ERP，返回 imgId
 * POST /saas/pro/file/uploadWithoutWaterMark (multipart/form-data)
 * 返回: { code: 0, data: [{ imgId: "xxx", downloadUrl: "https://..." }] }
 *
 * 注意：此接口使用 multipart/form-data，无法走 erpRequest 统一客户端（仅支持 JSON），
 * 但需自行实现日志记录和错误码检查
 */
async function erpUploadImage(localFilePath: string): Promise<string | null> {
  const { getErpConfig } = await import('./erp-config');
  const { getErpAccessToken } = await import('./erp-auth');
  const config = getErpConfig();
  const token = await getErpAccessToken();

  // 动态导入避免循环依赖
  const FormData = (await import('form-data')).default;
  const fs = await import('fs');

  const form = new FormData();
  form.append('files', fs.createReadStream(localFilePath));
  form.append('categoryName', 'store');
  form.append('serviceName', 'saas');

  const fullPath = `/saas/pro/file/uploadWithoutWaterMark`.replace(/\/+/g, '/');
  const url = `${config.baseUrl}${fullPath}`;
  const requestId = createLogEntry();
  const startTime = Date.now();

  try {
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

    const responseData = response.data;
    const durationMs = Date.now() - startTime;

    // 检查舟谱 API 错误码
    if (responseData && typeof responseData === 'object' && responseData.code !== undefined && responseData.code !== 0) {
      const errMsg = responseData.message || `舟谱API错误(code=${responseData.code})`;
      // 记录失败日志
      writeErpLog({
        requestId,
        method: 'POST',
        path: fullPath,
        requestHeaders: { 'Content-Type': 'multipart/form-data' },
        responseStatus: response.status,
        responseBody: responseData,
        errorMessage: errMsg,
        durationMs,
        retryCount: 0,
        businessType: 'credit_upload_license',
      }).catch(() => {});
      throw new Error(errMsg);
    }

    const data = responseData?.data;
    const imgId = Array.isArray(data) && data.length > 0 ? data[0].imgId : null;

    // 记录成功日志
    writeErpLog({
      requestId,
      method: 'POST',
      path: fullPath,
      requestHeaders: { 'Content-Type': 'multipart/form-data' },
      responseStatus: response.status,
      responseBody: responseData,
      durationMs,
      retryCount: 0,
      businessType: 'credit_upload_license',
    }).catch(() => {});

    return imgId;
  } catch (error) {
    const durationMs = Date.now() - startTime;
    const errMsg = error instanceof Error ? error.message : String(error);

    // 非舟谱业务错误（网络错误等）也记录日志
    if (!(error instanceof Error && error.message.includes('舟谱API错误'))) {
      writeErpLog({
        requestId,
        method: 'POST',
        path: fullPath,
        requestHeaders: { 'Content-Type': 'multipart/form-data' },
        errorMessage: errMsg,
        durationMs,
        retryCount: 0,
        businessType: 'credit_upload_license',
      }).catch(() => {});
    }

    throw error;
  }
}
