/**
 * 固定资产审批模块 - 查询服务
 * 代理舟谱 API 查询 + 本地申请列表
 * @module services/fixed-asset/fixed-asset-query
 */

import { appQuery } from '../../db/appPool';
import { erpGet, erpPost, getErpConfig, getErpDefaults } from '../erp-client';
import type {
  ErpAsset,
  ErpAssetCategory,
  ErpStaff,
  ErpDepartment,
  ErpPaymentAccount,
  AssetApplication,
  ApplicationType,
  ApplicationStatus,
  ApplicationListParams,
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
    size: 50,
    cid,
    uid,
    total: 0,
    usageStatus: usageStatus || '',
  };

  const result = await erpPost<ErpPageData<ErpAsset>>('/asset/page/search', body, {
    pathPrefix: config.assetPathPrefix,
    businessType: 'fixed_asset_search',
  });

  const records = result?.records || [];
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
  return result || [];
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
  return result?.records || [];
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
  return result || [];
}

// =====================================================
// 本地申请记录查询
// =====================================================

/**
 * 将数据库行映射为 AssetApplication 对象
 */
function mapRowToApplication(row: Record<string, unknown>): AssetApplication {
  return {
    id: row.id as number,
    applicationNo: row.application_no as string,
    type: row.type as ApplicationType,
    status: row.status as ApplicationStatus,
    formData: typeof row.form_data === 'string' ? JSON.parse(row.form_data as string) : row.form_data as Record<string, unknown>,
    oaInstanceId: row.oa_instance_id as number | null,
    erpRequestLog: row.erp_request_log as Record<string, unknown> | null,
    erpResponseData: typeof row.erp_response_data === 'string' ? JSON.parse(row.erp_response_data as string) : row.erp_response_data as Record<string, unknown> | null,
    applicantId: row.applicant_id as number,
    applicantName: row.applicant_name as string | null,
    departmentId: row.department_id as number | null,
    remark: row.remark as string | null,
    createdAt: row.created_at as Date,
    updatedAt: row.updated_at as Date,
  };
}

/**
 * 查询申请列表
 */
export async function getApplications(params: ApplicationListParams): Promise<{
  list: AssetApplication[];
  total: number;
}> {
  const { type, status, page = 1, pageSize = 20 } = params;

  const conditions: string[] = [];
  const queryParams: unknown[] = [];
  let paramIndex = 1;

  if (type) {
    conditions.push(`type = $${paramIndex++}`);
    queryParams.push(type);
  }
  if (status) {
    conditions.push(`status = $${paramIndex++}`);
    queryParams.push(status);
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  // 查询总数
  const countResult = await appQuery(
    `SELECT COUNT(*) as total FROM asset_applications ${whereClause}`,
    queryParams
  );
  const total = parseInt(countResult.rows[0].total, 10);

  // 查询列表
  const offset = (page - 1) * pageSize;
  const listResult = await appQuery(
    `SELECT * FROM asset_applications ${whereClause}
     ORDER BY created_at DESC
     LIMIT $${paramIndex++} OFFSET $${paramIndex++}`,
    [...queryParams, pageSize, offset]
  );

  const list: AssetApplication[] = listResult.rows.map(mapRowToApplication);
  return { list, total };
}

/**
 * 获取申请详情
 */
export async function getApplicationById(id: number): Promise<AssetApplication | null> {
  const result = await appQuery(
    `SELECT * FROM asset_applications WHERE id = $1`,
    [id]
  );

  if (result.rows.length === 0) return null;
  return mapRowToApplication(result.rows[0]);
}

/**
 * 通过 OA 审批实例 ID 获取申请
 */
export async function getApplicationByOaInstanceId(oaInstanceId: number): Promise<AssetApplication | null> {
  const result = await appQuery(
    `SELECT * FROM asset_applications WHERE oa_instance_id = $1`,
    [oaInstanceId]
  );

  if (result.rows.length === 0) return null;
  return mapRowToApplication(result.rows[0]);
}
