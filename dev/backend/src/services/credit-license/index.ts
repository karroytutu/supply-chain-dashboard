/**
 * 客户授信营业执照后补上传 - 模块入口
 * @module services/credit-license
 */

export type {
  CreditLicenseDeferredStatus,
  CreditLicenseDeferredRow,
  CreditLicenseDeferredDTO,
  CreateDeferredUploadParams,
  CreditLicenseQueryParams,
} from './credit-license.types';

export {
  createDeferredUploadAfterApproval,
  supplementLicense,
  getMyDeferredUploads,
  getDeferredUploads,
  getDeferredByInstanceId,
} from './credit-license.service';

export {
  checkLicenseDeferredReminders,
} from './credit-license-reminder.task';

export {
  markOverdueDeferredUploads,
} from './credit-license-overdue.task';
