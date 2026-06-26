/**
 * OA - ERP参考数据共享常量
 * 供 ErpFieldRenderer（表单）和 FormFieldRenderer（详情）共用
 *
 * 架构说明：
 * - ERP_LABEL_FIELDS / ERP_VALUE_FIELDS 为本地 fallback，保证 API 不可用时仍可工作
 * - loadErpConfig() 从后端 API 加载最新配置并合并到上述 Map，新增类型无需前端改动
 * - ERP_SEARCH_API_MAP 是前端概念（searchApi 属性值 → 后端路由 type 参数），保持本地定义
 * @module constants/oa-erp
 */

import type { ErpReferenceType, ErpTypeConfig } from '@/services/api/oa';
import { getErpReferenceTypes } from '@/services/api/oa';

/** searchApi 到 erp-reference 路由 type 参数的映射（前端概念，本地维护） */
export const ERP_SEARCH_API_MAP: Record<string, ErpReferenceType> = {
  erp_assets: 'assets',
  erp_departments: 'departments',
  erp_staff: 'staff',
  erp_payment_accounts: 'payment-accounts',
  erp_asset_categories: 'asset-categories',
  erp_customers: 'customers',
  erp_settlement_orders: 'settlement-orders',
  erp_grades: 'grades',
  erp_groups: 'groups',
  erp_areas: 'areas',
  erp_suppliers: 'suppliers',
  erp_prepayments: 'prepayments',
  erp_supplier_incomes: 'supplier-incomes',
  erp_purchase_orders: 'purchase-orders',
  erp_supplier_debts: 'supplier-debts',
  promotion_goods: 'promotion-goods',
};

/** treeSearchApi 到 erp-reference 路由 type 参数的映射（树形数据专用） */
export const ERP_TREE_SEARCH_API_MAP: Record<string, ErpReferenceType> = {
  erp_areas_tree: 'areas-tree',
};

/** ERP 类型到标签字段名的映射（本地 fallback + API 动态合并） */
export const ERP_LABEL_FIELDS: Record<string, string> = {
  assets: 'name',
  departments: 'name',
  staff: 'name',
  'payment-accounts': 'name',
  'asset-categories': 'name',
  customers: 'name',
  'settlement-orders': 'bizStr',
  grades: 'name',
  groups: 'name',
  areas: 'name',
  suppliers: 'name',
  prepayments: 'paidBillStr',
  'supplier-incomes': 'billStr',
  'purchase-orders': 'billStr',
  'supplier-debts': 'bizStr',
  'promotion-goods': 'name',
};

/** ERP 类型到值字段名的映射（本地 fallback + API 动态合并） */
export const ERP_VALUE_FIELDS: Record<string, string> = {
  assets: 'id',
  departments: 'id',
  staff: 'id',
  'payment-accounts': 'id',
  'asset-categories': 'id',
  customers: 'id',
  'settlement-orders': 'bizId',
  grades: 'id',
  groups: 'id',
  areas: 'id',
  suppliers: 'originId',
  prepayments: 'id',
  'supplier-incomes': 'id',
  'purchase-orders': 'billId',
  'supplier-debts': 'bizId',
  'promotion-goods': 'goodsId',
};

// =====================================================
// API 驱动的动态配置加载
// =====================================================

let _configLoaded = false;

/**
 * 从后端 API 加载 ERP 参考类型配置并合并到本地 Map
 * - 首次调用时请求 API，后续调用直接返回缓存结果
 * - API 不可用时降级使用本地 fallback，不影响功能
 * - 新增 ERP 类型只需后端注册，前端零改动
 */
export async function loadErpConfig(): Promise<void> {
  if (_configLoaded) return;
  try {
    const types: ErpTypeConfig[] = await getErpReferenceTypes();
    for (const t of types) {
      ERP_LABEL_FIELDS[t.type] = t.labelField;
      ERP_VALUE_FIELDS[t.type] = t.valueField;
    }
    _configLoaded = true;
  } catch {
    // API 不可用，降级使用本地 fallback
  }
}
