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
      customerPathPrefix: erpApi?.customerPathPrefix || '/redcoast/',
      expenditureBillPath:
        erpApi?.expenditureBillPath || '/expenditure-bill/save-approve-cash-expenditure',
      assetCreatePath: erpApi?.assetCreatePath || '/asset/create',
      assetUpdatePath: erpApi?.assetUpdatePath || '/asset/update',
      assetClearPath: erpApi?.assetClearPath || '/asset-clear/do-clear',
      incomeBillPath: erpApi?.incomeBillPath || '/income/save-approve-cash-income',
      // 清理 API 路径配置
      expenditureBillReApprovePath:
        erpApi?.expenditureBillReApprovePath || '/expenditure-bill/re-approve-expenditure',
      expenditureBillCancelPath:
        erpApi?.expenditureBillCancelPath || '/expenditure-bill/cancel-expenditure',
      incomeReApprovePath: erpApi?.incomeReApprovePath || '/income/re-approve-income',
      incomeCancelPath: erpApi?.incomeCancelPath || '/income/cancel-income',
      // 数据源 API 路径（ERP 数据库迁移）
      debtPathPrefix: erpApi?.debtPathPrefix || '/toliman/',
      inventoryPathPrefix: erpApi?.inventoryPathPrefix || '/toliman/',
      salesDetailPathPrefix: erpApi?.salesDetailPathPrefix || '/toliman/',
      batchInventoryPathPrefix: erpApi?.batchInventoryPathPrefix || '/toliman/',
      wmsBaseUrl: erpApi?.wmsBaseUrl || 'https://wms.zhoupudata.com',
    };
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
