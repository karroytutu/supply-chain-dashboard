/**
 * ERP 客户相关类型定义
 * @module services/erp-client/erp-customer.types
 */

/** ERP 客户对象 */
export interface ErpCustomer {
  id: number;
  name: string;
  code: string;
  shortName?: string;
  consumerCode?: string;
  docState?: number;
  contactName?: string;
  contactTel?: string;
  [key: string]: unknown;
}

/** ERP 客户详情（含完整字段） */
export interface ErpCustomerProfile {
  id: number;
  name: string;
  shortName?: string;
  consumerCode?: string;
  contactName?: string;
  contactTel?: string;
  state?: number;
  areaId?: number;
  groupId?: number;
  ext?: {
    attachedPicIds?: string[];
    [key: string]: unknown;
  };
  consumerManagerId?: number;
  settleConsumerId?: number;
  maxDebtAmount?: string;
  maxDebtDays?: string;
  maxDebtOrderNum?: string;
  settleMethod?: number;
  scanFullPay?: boolean;
  autoWriteOff?: boolean;
  cid?: string;
  uid?: string;
  /** 营业执照原图 URL 数组（CDN 直链） */
  attachedPicUrls?: string[];
  /** 营业执照缩略图 URL（CDN 直链，带 OSS 缩放） */
  attachedPicUrl?: string;
  [key: string]: unknown;
}

/** 客户执照信息 */
export interface CustomerLicenseInfo {
  hasLicense: boolean;
  imageCount: number;
  attachedPicUrls: string[];
}
