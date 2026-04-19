/**
 * ERP API 配置管理
 * 从环境变量读取舟谱 API 配置
 * @module services/erp-client/erp-config
 */

import { config } from '../../config';
import type { ErpApiConfig } from './erp-client.types';

/** ERP API 配置（延迟加载） */
let _erpConfig: ErpApiConfig | null = null;

/**
 * 获取 ERP API 配置
 */
export function getErpConfig(): ErpApiConfig {
  if (!_erpConfig) {
    const erpApi = (config as any).erpApi;
    _erpConfig = {
      baseUrl: erpApi?.baseUrl || 'https://portal.zhoupudata.com',
      tokenUrl: erpApi?.tokenUrl || '',
      cid: erpApi?.cid || '10008421',
      uid: erpApi?.uid || '1',
      timeout: erpApi?.timeout || 10000,
      retryMax: erpApi?.retryMax || 3,
      rateLimitMs: erpApi?.rateLimitMs || 200,
    };
  }
  return _erpConfig;
}

/**
 * API 版本号
 */
export const ERP_API_VERSION = '51';
