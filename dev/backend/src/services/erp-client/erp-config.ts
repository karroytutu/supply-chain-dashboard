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
      // 业务默认值
      defaultPaymentSubjectId: erpApi?.defaultPaymentSubjectId || 16,
      defaultSalesmanId: erpApi?.defaultSalesmanId || 1,
      defaultDeptId: erpApi?.defaultDeptId || 1,
      // API 路径配置
      assetPathPrefix: erpApi?.assetPathPrefix || '/messiah/',
      expenditureBillPath: erpApi?.expenditureBillPath || '/expenditure-bill/save-approve-cash-expenditure',
      assetCreatePath: erpApi?.assetCreatePath || '/asset/create',
      assetUpdatePath: erpApi?.assetUpdatePath || '/asset/update',
      assetClearPath: erpApi?.assetClearPath || '/asset-clear/do-clear',
      incomeBillPath: erpApi?.incomeBillPath || '/income/save-approve-cash-income',
    };

    // 开发环境警告
    if (!_erpConfig.tokenUrl && process.env.NODE_ENV === 'development') {
      console.warn('[ERP] tokenUrl 未配置，ERP 集成功能可能不可用');
    }
  }
  return _erpConfig;
}

/**
 * 获取 ERP 默认业务参数
 * 便捷函数，提取回调中常用的默认值
 */
export function getErpDefaults(): {
  cid: string;
  uid: string;
  defaultPaymentSubjectId: number;
  defaultSalesmanId: number;
  defaultDeptId: number;
} {
  const cfg = getErpConfig();
  return {
    cid: cfg.cid,
    uid: cfg.uid,
    defaultPaymentSubjectId: cfg.defaultPaymentSubjectId,
    defaultSalesmanId: cfg.defaultSalesmanId,
    defaultDeptId: cfg.defaultDeptId,
  };
}

/**
 * API 版本号
 */
export const ERP_API_VERSION = '51';
