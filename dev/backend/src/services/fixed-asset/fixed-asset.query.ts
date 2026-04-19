/**
 * 固定资产审批模块 - 查询服务
 * 代理舟谱 API 查询 + 本地申请列表
 * @module services/fixed-asset/fixed-asset.query
 */

import { appQuery } from '../../db/appPool';
import { erpGet, erpPost } from '../erp-client';
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
// 舟谱 API 代理查询
// =====================================================

/**
 * 搜索舟谱资产
 */
export async function searchErpAssets(keyword: string, usageStatus?: string): Promise<ErpAsset[]> {
  const body: Record<string, any> = {
    current: 1,
    size: 50,
    cid: '10008421',
    uid: '1',
    total: 0,
    usageStatus: usageStatus || '',
  };

  const result = await erpPost<any>('/asset/page/search', body, {
    pathPrefix: '/messiah/',
    businessType: 'fixed_asset_search',
  });

  const records = result?.data?.records || [];
  if (keyword) {
    const kw = keyword.toLowerCase();
    return records.filter((r: ErpAsset) =>
      (r.code && r.code.toLowerCase().includes(kw)) ||
      (r.name && r.name.toLowerCase().includes(kw))
    );
  }
  return records;
}

/**
 * 获取舟谱资产详情（通过搜索 API 按 code 查询）
 */
export async function getErpAssetDetail(erpAssetId: number): Promise<ErpAsset | null> {
  const assets = await searchErpAssets('', '');
  return assets.find((a: ErpAsset) => a.id === erpAssetId) || null;
}

/**
 * 获取舟谱资产分类列表
 */
export async function getErpAssetCategories(): Promise<ErpAssetCategory[]> {
  const result = await erpGet<any>('/asset-type/get-all', {
    cid: '10008421',
    uid: '1',
  }, {
    pathPrefix: '/messiah/',
    businessType: 'fixed_asset_categories',
  });
  return result?.data || [];
}

/**
 * 获取舟谱员工列表
 */
export async function getErpStaff(): Promise<ErpStaff[]> {
  const result = await erpPost<any>('/staff/list-staff', {
    size: 200,
    current: 1,
    cid: '10008421',
    uid: '1',
  }, {
    pathPrefix: '/saas/pro/',
    businessType: 'fixed_asset_staff',
  });
  return result?.data?.records || [];
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
  const result = await erpGet<any>('/funds-account/list-payment-tree', {
    from: 'bill',
    typeIn: 'c,b,o',
    state: '0',
    page: '1',
    rows: '500',
    cid: '10008421',
    uid: '1',
  }, {
    pathPrefix: '/saas/pro/',
    businessType: 'fixed_asset_payment_accounts',
  });
  return result?.data || [];
}

// =====================================================
// 本地申请记录查询
// =====================================================

/**
 * 查询申请列表
 */
export async function getApplications(params: ApplicationListParams): Promise<{
  list: AssetApplication[];
  total: number;
}> {
  const { type, status, page = 1, pageSize = 20 } = params;

  const conditions: string[] = [];
  const queryParams: any[] = [];
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

  const list: AssetApplication[] = listResult.rows.map((row: any) => ({
    id: row.id,
    applicationNo: row.application_no,
    type: row.type,
    status: row.status,
    formData: typeof row.form_data === 'string' ? JSON.parse(row.form_data) : row.form_data,
    oaInstanceId: row.oa_instance_id,
    erpRequestLog: row.erp_request_log,
    erpResponseData: typeof row.erp_response_data === 'string' ? JSON.parse(row.erp_response_data) : row.erp_response_data,
    applicantId: row.applicant_id,
    applicantName: row.applicant_name,
    departmentId: row.department_id,
    remark: row.remark,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }));

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

  const row = result.rows[0];
  return {
    id: row.id,
    applicationNo: row.application_no,
    type: row.type,
    status: row.status,
    formData: typeof row.form_data === 'string' ? JSON.parse(row.form_data) : row.form_data,
    oaInstanceId: row.oa_instance_id,
    erpRequestLog: row.erp_request_log,
    erpResponseData: typeof row.erp_response_data === 'string' ? JSON.parse(row.erp_response_data) : row.erp_response_data,
    applicantId: row.applicant_id,
    applicantName: row.applicant_name,
    departmentId: row.department_id,
    remark: row.remark,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
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

  const row = result.rows[0];
  return {
    id: row.id,
    applicationNo: row.application_no,
    type: row.type,
    status: row.status,
    formData: typeof row.form_data === 'string' ? JSON.parse(row.form_data) : row.form_data,
    oaInstanceId: row.oa_instance_id,
    erpRequestLog: row.erp_request_log,
    erpResponseData: typeof row.erp_response_data === 'string' ? JSON.parse(row.erp_response_data) : row.erp_response_data,
    applicantId: row.applicant_id,
    applicantName: row.applicant_name,
    departmentId: row.department_id,
    remark: row.remark,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
