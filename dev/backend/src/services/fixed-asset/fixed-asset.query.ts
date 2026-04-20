/**
 * 固定资产审批模块 - 查询服务
 * 代理舟谱 API 查询
 * @module services/fixed-asset/fixed-asset-query
 */

import { erpGet, erpPost, getErpConfig, getErpDefaults } from '../erp-client';
import type {
  ErpAsset,
  ErpAssetCategory,
  ErpStaff,
  ErpDepartment,
  ErpPaymentAccount,
} from './fixed-asset.types';

// =====================================================
// 舟谱 ERP 资产缓存
// =====================================================

/** 资产列表缓存（5 分钟过期） */
let assetCache: { data: ErpAsset[]; expireAt: number } | null = null;
const CACHE_TTL = 5 * 60 * 1000;

// =====================================================
// 舟谱 API 代理查询
// =====================================================

/** ERP 分页响应结构（舟谱 API 返回的 data 部分） */
interface ErpPageData<T> {
  records: T[];
  total?: number;
  current?: number;
  size?: number;
}

/**
 * 搜索舟谱资产
 */
export async function searchErpAssets(keyword: string, usageStatus?: string): Promise<ErpAsset[]> {
  const { cid, uid } = getErpDefaults();
  const config = getErpConfig();

  const body: Record<string, unknown> = {
    current: 1,
    size: 500,
    cid,
    uid,
    total: 0,
    usageStatus: usageStatus || '',
  };

  const result = await erpPost<ErpPageData<ErpAsset>>('/asset/page/search', body, {
    pathPrefix: config.assetPathPrefix,
    businessType: 'fixed_asset_search',
  });

  // erpPost 返回完整响应 {"code":0,"data":{...}}，需从 data 字段取分页数据
  const pageData = ((result as any)?.data as ErpPageData<ErpAsset>) || result;
  const records = pageData?.records || [];
  if (keyword) {
    const kw = keyword.toLowerCase();
    return records.filter((r) =>
      (r.code && r.code.toLowerCase().includes(kw)) ||
      (r.name && r.name.toLowerCase().includes(kw))
    );
  }
  return records;
}

/**
 * 获取全部舟谱资产列表（带缓存）
 */
async function getAllErpAssets(): Promise<ErpAsset[]> {
  const now = Date.now();
  if (assetCache && assetCache.expireAt > now) {
    return assetCache.data;
  }
  const assets = await searchErpAssets('', '');
  assetCache = { data: assets, expireAt: now + CACHE_TTL };
  return assets;
}

/**
 * 获取舟谱资产详情（通过缓存查询）
 */
export async function getErpAssetDetail(erpAssetId: number): Promise<ErpAsset | null> {
  const assets = await getAllErpAssets();
  return assets.find((a) => a.id === erpAssetId) || null;
}

/**
 * 获取舟谱资产分类列表
 */
export async function getErpAssetCategories(): Promise<ErpAssetCategory[]> {
  const { cid, uid } = getErpDefaults();
  const config = getErpConfig();

  const result = await erpGet<ErpAssetCategory[]>('/asset-type/get-all', {
    cid,
    uid,
  }, {
    pathPrefix: config.assetPathPrefix,
    businessType: 'fixed_asset_categories',
  });
  // erpGet 返回完整响应 {"code":0,"data":[...]}
  const data = ((result as any)?.data as ErpAssetCategory[]) || result;
  return Array.isArray(data) ? data : [];
}

/**
 * 获取舟谱员工列表
 */
export async function getErpStaff(): Promise<ErpStaff[]> {
  const { cid, uid } = getErpDefaults();

  const result = await erpPost<ErpPageData<ErpStaff>>('/staff/list-staff', {
    size: 200,
    current: 1,
    cid,
    uid,
  }, {
    pathPrefix: '/saas/pro/',
    businessType: 'fixed_asset_staff',
  });
  // erpPost 返回完整响应 {"code":0,"data":{...}}
  const pageData = ((result as any)?.data as ErpPageData<ErpStaff>) || result;
  return pageData?.records || [];
}

/**
 * 获取舟谱部门列表（从员工数据提取去重）
 */
export async function getErpDepartments(): Promise<ErpDepartment[]> {
  const staff = await getErpStaff();
  const deptMap = new Map<number, string>();
  for (const s of staff) {
    if (s.deptId && s.deptName && !deptMap.has(s.deptId)) {
      deptMap.set(s.deptId, s.deptName);
    }
  }
  return Array.from(deptMap.entries()).map(([deptId, deptName]) => ({ deptId, deptName }));
}

/**
 * 获取舟谱付款账户列表（树形）
 */
export async function getErpPaymentAccounts(): Promise<ErpPaymentAccount[]> {
  const { cid, uid } = getErpDefaults();

  const result = await erpGet<ErpPaymentAccount[]>('/funds-account/list-payment-tree', {
    from: 'bill',
    typeIn: 'c,b,o',
    state: '0',
    page: '1',
    rows: '500',
    cid,
    uid,
  }, {
    pathPrefix: '/saas/pro/',
    businessType: 'fixed_asset_payment_accounts',
  });
  // erpGet 返回完整响应 {"code":0,"data":[...]}
  const data = ((result as any)?.data as ErpPaymentAccount[]) || result;
  return Array.isArray(data) ? data : [];
}
