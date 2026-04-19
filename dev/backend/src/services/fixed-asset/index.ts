/**
 * 固定资产审批模块入口
 * @module services/fixed-asset
 */

export type {
  ApplicationType,
  ApplicationStatus,
  TransferType,
  AssetUrgency,
  DisposalType,
  AssetApplication,
  ErpAsset,
  ErpAssetCategory,
  ErpStaff,
  ErpDepartment,
  ErpPaymentAccount,
  PurchaseLine,
  TransferLine,
  MaintenanceQuotation,
  UnitAllocation,
  CreatedAssetRecord,
  CreateApplicationRequest,
  ApplicationListParams,
} from './fixed-asset.types';

export {
  DISPOSAL_INCRDECR_MAP,
  FEE_SUBJECT,
  DEPRECIATION_METHODS,
} from './fixed-asset.types';

export {
  generateApplicationNo,
  calcMonthlyDepreciation,
  calcResidualValue,
  calcNetValue,
  validateMaintenanceCost,
  validateQuotationCount,
  getApplicationStatusLabel,
  getApplicationTypeLabel,
  getStatusForNode,
  buildAssetCreatePayload,
} from './fixed-asset-utils';

export {
  searchErpAssets,
  getErpAssetDetail,
  getErpAssetCategories,
  getErpStaff,
  getErpDepartments,
  getErpPaymentAccounts,
  getApplications,
  getApplicationById,
  getApplicationByOaInstanceId,
} from './fixed-asset.query';

export {
  createApplication,
  updateApplicationStatus,
  retryErpOperation,
} from './fixed-asset.mutation';

export {
  handleAssetPurchaseNodeCallback,
  handleAssetTransferApproved,
  handleAssetMaintenanceNodeCallback,
  handleAssetDisposalApproved,
} from './fixed-asset-callback';
