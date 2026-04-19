/**
 * 固定资产管理 API 服务
 * @module services/api/asset
 */

import request from './request';
import type {
  ErpAsset,
  ErpAssetCategory,
  ErpStaff,
  ErpDepartment,
  ErpPaymentAccount,
  AssetApplication,
  ApplicationType,
  ApplicationListParams,
  PaginatedResult,
  PurchaseFormData,
  TransferFormData,
  MaintenanceFormData,
  DisposalFormData,
} from '../../types/asset';

const BASE = '/fixed-assets';

// =====================================================
// 舟谱 ERP 代理查询
// =====================================================

/** 搜索舟谱资产 */
export async function searchErpAssets(keyword: string, usageStatus?: string): Promise<ErpAsset[]> {
  return request.get(`${BASE}/search`, { params: { keyword, usageStatus } });
}

/** 获取舟谱资产详情 */
export async function getErpAssetDetail(erpAssetId: number): Promise<ErpAsset> {
  return request.get(`${BASE}/${erpAssetId}`);
}

/** 获取舟谱资产分类 */
export async function getErpAssetCategories(): Promise<ErpAssetCategory[]> {
  return request.get(`${BASE}/categories`);
}

/** 获取舟谱员工列表 */
export async function getErpStaff(): Promise<ErpStaff[]> {
  return request.get(`${BASE}/staff`);
}

/** 获取舟谱部门列表 */
export async function getErpDepartments(): Promise<ErpDepartment[]> {
  return request.get(`${BASE}/departments`);
}

/** 获取舟谱付款账户 */
export async function getErpPaymentAccounts(): Promise<ErpPaymentAccount[]> {
  return request.get(`${BASE}/payment-accounts`);
}

// =====================================================
// 申请列表与详情
// =====================================================

/** 获取申请列表 */
export async function getApplications(params: ApplicationListParams): Promise<PaginatedResult<AssetApplication>> {
  const { type, ...rest } = params;
  const url = type ? `${BASE}/${type}/applications` : `${BASE}/purchase/applications`;
  return request.get(url, { params: rest });
}

/** 获取申请详情 */
export async function getApplicationDetail(id: number): Promise<AssetApplication> {
  return request.get(`${BASE}/applications/${id}`);
}

// =====================================================
// 创建申请
// =====================================================

/** 提交采购申请 */
export async function createPurchaseApplication(formData: PurchaseFormData, remark?: string) {
  return request.post(`${BASE}/purchase`, { type: 'purchase', formData, remark });
}

/** 提交调拨申请 */
export async function createTransferApplication(formData: TransferFormData, remark?: string) {
  return request.post(`${BASE}/transfer`, { type: 'transfer', formData, remark });
}

/** 提交维修申请 */
export async function createMaintenanceApplication(formData: MaintenanceFormData, remark?: string) {
  return request.post(`${BASE}/maintenance`, { type: 'maintenance', formData, remark });
}

/** 提交清理申请 */
export async function createDisposalApplication(formData: DisposalFormData, remark?: string) {
  return request.post(`${BASE}/disposal`, { type: 'disposal', formData, remark });
}

/** 重试失败的 ERP 操作 */
export async function retryErpOperation(id: number) {
  return request.post(`${BASE}/applications/${id}/retry`);
}
