/**
 * OA审批 - ERP参考数据共享常量
 * 供 ErpFieldRenderer（表单）和 FormFieldRenderer（详情）共用
 * @module constants/oa-approval-erp
 */

import type { ErpReferenceType } from '@/services/api/oa-approval';

/** searchApi 到 erp-reference 路由 type 参数的映射 */
export const ERP_SEARCH_API_MAP: Record<string, ErpReferenceType> = {
  erp_assets: 'assets',
  erp_departments: 'departments',
  erp_staff: 'staff',
  erp_payment_accounts: 'payment-accounts',
  erp_asset_categories: 'asset-categories',
  erp_customers: 'customers',
  erp_settlement_orders: 'settlement-orders',
};

/** ERP 类型到标签字段名的映射 */
export const ERP_LABEL_FIELDS: Record<string, string> = {
  assets: 'name',
  departments: 'name',
  staff: 'name',
  'payment-accounts': 'name',
  'asset-categories': 'name',
  customers: 'name',
  'settlement-orders': 'bizStr',
};

/** ERP 类型到值字段名的映射 */
export const ERP_VALUE_FIELDS: Record<string, string> = {
  assets: 'id',
  departments: 'id',
  staff: 'id',
  'payment-accounts': 'id',
  'asset-categories': 'id',
  customers: 'id',
  'settlement-orders': 'bizId',
};
