/**
 * 固定资产审批模块入口
 * 仅保留回调处理器、ERP查询和工具函数
 * @module services/fixed-asset
 */

export type {
  ApplicationType,
  ApplicationStatus,
  TransferType,
  AssetUrgency,
  DisposalType,
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
} from './fixed-asset.types';

export {
  DISPOSAL_INCRDECR_MAP,
  FEE_SUBJECT,
  DEPRECIATION_METHODS,
} from './fixed-asset.types';

export {
  validateMaintenanceCost,
  validateQuotationCount,
  getApplicationStatusLabel,
  getApplicationTypeLabel,
  getStatusForNode,
  buildAssetCreatePayload,
  normalizeDateTime,
  generateNextAssetCode,
} from './fixed-asset-utils';

export {
  searchErpAssets,
  getErpAssetDetail,
  getErpAssetCategories,
  getErpStaff,
  getErpDepartments,
  getErpPaymentAccounts,
} from './fixed-asset.query';

export {
  handleAssetPurchaseNodeCallback,
} from './purchase-callback';

export {
  handleAssetTransferApproved,
} from './transfer-callback';

export {
  handleAssetMaintenanceNodeCallback,
} from './maintenance-callback';

export {
  handleAssetDisposalApproved,
} from './disposal-callback';

export {
  getErpMeta,
  setErpMeta,
  updateErpMetaStatus,
  mergeErpResponseData,
  markErpFailed,
  initErpMeta,
  generateApplicationNo,
  retryErpOperation,
} from './erp-meta-utils';

export type { ErpMetaStatus } from './erp-meta-utils';
