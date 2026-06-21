/**
 * 固定资产审批模块 - 查询服务
 * 代理舟谱 API 查询
 * @module services/fixed-asset/fixed-asset-query
 */

import { erpGet, erpPost, getErpConfig, getErpDefaults } from '../erp-client';
import { cache, CACHE_TTL as CACHE_TTL_CONFIG } from '../../utils/cache';
import type {
  ErpAsset,
  ErpAssetCategory,
  ErpStaff,
  ErpDepartment,
  ErpPaymentAccount,
} from './fixed-asset.types';

// =====================================================
// 舟谱 ERP 资产缓存（统一 MemoryCache）
// =====================================================

/** 资产列表缓存 Key */
const ASSET_CACHE_KEY = 'fixed-asset:erp-assets';
/** 资产列表缓存过期时间 */
const ASSET_CACHE_TTL = CACHE_TTL_CONFIG.LOW_FREQUENCY;

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
 * POST {assetPathPrefix}/asset/page/search
 *
 * 响应常用字段（ErpAsset）：
 *   id                        - 资产ID（表单存储值）
 *   code                      - 资产编号（下拉框显示标签）
 *   name                      - 资产名称（下拉框显示标签）
 *   assetTypeId / assetTypeName - 资产分类ID / 名称
 *   deptId / deptName         - 使用部门ID / 名称
 *   userId / userName         - 使用人ID / 名称
 *   depositAddress            - 存放地点
 *   originalValue             - 原值（字符串）
 *   accumulatedDepreciation   - 累计折旧（字符串）
 *   netValue                  - 净值（字符串）
 *   usageStatus / usageStatusStr - 使用状态码 / 名称
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
    return records.filter(
      r =>
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
  const cached = cache.get<ErpAsset[]>(ASSET_CACHE_KEY);
  if (cached) return cached;

  const assets = await searchErpAssets('', '');
  cache.set(ASSET_CACHE_KEY, assets, ASSET_CACHE_TTL);
  return assets;
}

/**
 * 获取舟谱资产详情（通过缓存查询）
 */
export async function getErpAssetDetail(erpAssetId: number): Promise<ErpAsset | null> {
  const assets = await getAllErpAssets();
  return assets.find(a => a.id === erpAssetId) || null;
}

/**
 * 获取舟谱资产分类列表
 * GET {assetPathPrefix}/asset-type/get-all
 *
 * 响应常用字段（ErpAssetCategory）：
 *   id                        - 分类ID
 *   name                      - 分类名称（如 房屋/建筑物、器具/工具/家具）
 *   code                      - 分类编码（如 01、03）
 *   depreciationMethod        - 折旧方法（如 YEARS_AVERAGE_METHOD）
 *   depreciationMethodName    - 折旧方法名称（如 年限平均法）
 *   estimatedServiceMonths    - 预计使用月数
 *   estimatedResidualValueRate - 预计残值率（百分比数值）
 *   isUsed                    - 是否已被资产引用
 *   children                  - 子分类（树形结构）
 */
export async function getErpAssetCategories(): Promise<ErpAssetCategory[]> {
  const { cid, uid } = getErpDefaults();
  const config = getErpConfig();

  const result = await erpGet<ErpAssetCategory[]>(
    '/asset-type/get-all',
    {
      cid,
      uid,
    },
    {
      pathPrefix: config.assetPathPrefix,
      businessType: 'fixed_asset_categories',
    }
  );
  // erpGet 返回完整响应 {"code":0,"data":[...]}
  const data = ((result as any)?.data as ErpAssetCategory[]) || result;
  return Array.isArray(data) ? data : [];
}

/**
 * 获取舟谱员工列表
 * POST /saas/pro/staff/list-staff
 *
 * 响应常用字段（ErpStaff）：
 *   id      - 员工ID（表单存储值）
 *   name    - 员工姓名（下拉框显示标签）
 *   deptId  - 部门ID
 *   deptName - 部门名称
 *   phone   - 联系电话
 *   isAdmin - 是否管理员
 */
export async function getErpStaff(keyword?: string): Promise<ErpStaff[]> {
  const { cid, uid } = getErpDefaults();
  const body: Record<string, unknown> = { size: 1000, current: 1, cid, uid };
  // ERP 原生搜索：按姓名/手机号/编码模糊匹配（注意 keyWord 大写W）
  if (keyword) body.keyWord = keyword;

  const result = await erpPost<ErpPageData<ErpStaff>>(
    '/staff/list-staff',
    body,
    {
      pathPrefix: '/saas/pro/',
      businessType: 'fixed_asset_staff',
    }
  );
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
 * GET /saas/pro/funds-account/list-payment-tree
 *
 * 响应常用字段（ErpPaymentAccount）：
 *   id          - 账户ID（表单存储值）
 *   name / text - 账户名称（下拉框显示标签，两个字段值相同）
 *   code        - 账户编码（如 1002）
 *   pid         - 父账户ID（0=顶级）
 *   level       - 层级（1=一级，2=二级）
 *   state       - 状态（NORMAL）
 *   initAmount  - 期初金额（字符串）
 *   children    - 子账户（树形结构）
 */
export async function getErpPaymentAccounts(): Promise<ErpPaymentAccount[]> {
  const { cid, uid } = getErpDefaults();

  const result = await erpGet<ErpPaymentAccount[]>(
    '/funds-account/list-payment-tree',
    {
      from: 'bill',
      typeIn: 'c,b,o',
      state: '0',
      page: '1',
      rows: '500',
      cid,
      uid,
    },
    {
      pathPrefix: '/saas/pro/',
      businessType: 'fixed_asset_payment_accounts',
    }
  );
  // erpGet 返回完整响应 {"code":0,"data":[...]}
  const data = ((result as any)?.data as ErpPaymentAccount[]) || result;
  return Array.isArray(data) ? data : [];
}
