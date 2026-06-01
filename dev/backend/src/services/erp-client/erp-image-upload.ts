/**
 * ERP 图片上传共享工具
 * 提取自 erp-credit-update.service.ts 的私有 erpUploadImage()
 * @module services/erp-client/erp-image-upload
 */

import { createLogEntry, writeErpLog } from './erp-logger';

/**
 * 上传图片到 ERP，返回 imgId
 * POST /saas/pro/file/uploadWithoutWaterMark (multipart/form-data)
 * 返回: { code: 0, data: [{ imgId: "xxx", downloadUrl: "https://..." }] }
 *
 * 注意：此接口使用 multipart/form-data，无法走 erpRequest 统一客户端（仅支持 JSON），
 * 但需自行实现日志记录和错误码检查
 *
 * @param localFilePath 本地文件路径
 * @param categoryName ERP 图片分类，默认 'store'（门头照）
 * @param businessType 日志业务类型标识
 */
export async function erpUploadImageToErp(
  localFilePath: string,
  categoryName = 'store',
  businessType = 'erp_image_upload'
): Promise<string | null> {
  const { getErpConfig } = await import('./erp-config');
  const { getErpAccessToken } = await import('./erp-auth');
  const config = getErpConfig();
  const token = await getErpAccessToken();

  const FormData = (await import('form-data')).default;
  const fs = await import('fs');

  const form = new FormData();
  form.append('files', fs.createReadStream(localFilePath));
  form.append('categoryName', categoryName);
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
        businessType,
      }).catch(() => {});
      throw new Error(errMsg);
    }

    const data = responseData?.data;
    const imgId = Array.isArray(data) && data.length > 0 ? data[0].imgId : null;

    writeErpLog({
      requestId,
      method: 'POST',
      path: fullPath,
      requestHeaders: { 'Content-Type': 'multipart/form-data' },
      responseStatus: response.status,
      responseBody: responseData,
      durationMs,
      retryCount: 0,
      businessType,
    }).catch(() => {});

    return imgId;
  } catch (error) {
    const durationMs = Date.now() - startTime;
    const errMsg = error instanceof Error ? error.message : String(error);

    if (!(error instanceof Error && error.message.includes('舟谱API错误'))) {
      writeErpLog({
        requestId,
        method: 'POST',
        path: fullPath,
        requestHeaders: { 'Content-Type': 'multipart/form-data' },
        errorMessage: errMsg,
        durationMs,
        retryCount: 0,
        businessType,
      }).catch(() => {});
    }

    throw error;
  }
}
