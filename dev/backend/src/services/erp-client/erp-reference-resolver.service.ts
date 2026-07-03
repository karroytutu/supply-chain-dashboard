/**
 * ERP 参考数据解析服务
 * 封装 ID→名称解析和类型配置，供控制器调用
 * @module services/erp-client/erp-reference-resolver.service
 */

import {
  searchErpAssets,
  getErpAssetDetail,
  getErpDepartments,
  getErpStaff,
  getErpPaymentAccounts,
  getErpAssetCategories,
} from '../fixed-asset/fixed-asset.query';
import { getErpCustomerProfile } from './erp-customer.service';
import {
  getErpGrades,
  getErpGroups,
  getErpAreas,
  getErpAreaTree,
} from './erp-customer-reference.service';
import { fetchAllBrands } from './erp-brand.service';
import { searchErpSettlementOrders } from './erp-settlement.service';
import { searchSuppliers } from './erp-supplier.service';
import { searchPurchaseOrders } from './erp-purchase-order.service';
import { getProductById } from './erp-product.service';
import { fetchAllPagesSequential } from './erp-pagination';
import type { PurchaseOrderListItem } from './erp-purchase.types';

/** 解析结果项 */
export interface ResolvedItem {
  id: number;
  label: string;
}

/** 各 ERP 类型的标签字段映射 */
export const LABEL_FIELDS: Record<string, string> = {
  assets: 'name',
  departments: 'deptName',
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
  'purchase-settlements': 'billStr',
  'allocatable-purchase-details': 'billStr',
  'allocatable-expense-details': 'billStr',
  'supplier-debts': 'bizStr',
  'promotion-goods': 'name',
  brands: 'name',
};

/** 各 ERP 类型的值字段映射（选中后存储的 ID/key） */
export const VALUE_FIELDS: Record<string, string> = {
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
  prepayments: 'billId',
  'supplier-incomes': 'id',
  'purchase-settlements': 'billId',
  'allocatable-purchase-details': 'id',
  'allocatable-expense-details': 'id',
  'supplier-debts': 'bizId',
  'promotion-goods': 'goodsId',
  brands: 'originBrandId',
};

/** 递归展平树形结构 */
export function flattenTree<T extends { children?: T[] | null }>(nodes: T[]): T[] {
  const result: T[] = [];
  for (const node of nodes) {
    result.push(node);
    if (node.children?.length) {
      result.push(...flattenTree(node.children));
    }
  }
  return result;
}

/**
 * 解析 ERP ID → 名称
 * 供 GET /oa/erp-reference/:type/resolve?ids=1,2,3 端点使用
 */
export async function resolveErpReference(
  type: string,
  ids: number[],
  consumerId?: string
): Promise<ResolvedItem[]> {
  const labelField = LABEL_FIELDS[type] || 'name';

  switch (type) {
    case 'customers': {
      const results = await Promise.allSettled(
        ids.map(async id => {
          const profile = await getErpCustomerProfile(id);
          return { id, label: String((profile as Record<string, unknown>)[labelField] ?? id) };
        })
      );
      return results.map((r, i) =>
        r.status === 'fulfilled' ? r.value : { id: ids[i], label: String(ids[i]) }
      );
    }

    case 'assets': {
      const results = await Promise.allSettled(
        ids.map(async id => {
          const asset = await getErpAssetDetail(id);
          return { id, label: String(asset?.[labelField as keyof typeof asset] ?? id) };
        })
      );
      return results.map((r, i) =>
        r.status === 'fulfilled' ? r.value : { id: ids[i], label: String(ids[i]) }
      );
    }

    case 'departments': {
      const all = await getErpDepartments();
      const map = new Map(all.map(d => [d.deptId, d.deptName]));
      return ids.map(id => ({ id, label: String(map.get(id) ?? id) }));
    }

    case 'staff': {
      const all = await getErpStaff();
      const map = new Map(all.map(s => [s.id, s.name]));
      return ids.map(id => ({ id, label: String(map.get(id) ?? id) }));
    }

    case 'payment-accounts': {
      const all = flattenTree(await getErpPaymentAccounts());
      const map = new Map(all.map(a => [a.id, a.name]));
      return ids.map(id => ({ id, label: String(map.get(id) ?? id) }));
    }

    case 'asset-categories': {
      const all = flattenTree(await getErpAssetCategories());
      const map = new Map(all.map(c => [c.id, c.name]));
      return ids.map(id => ({ id, label: String(map.get(id) ?? id) }));
    }

    case 'settlement-orders': {
      if (!consumerId) throw new Error('结算单解析需要 consumerId 参数');
      const all = await searchErpSettlementOrders({ traderId: consumerId });
      const buildLabel = (order: { bizStr: string; leftAmount: string }) => {
        const amount = parseFloat(order.leftAmount);
        if (isNaN(amount)) return order.bizStr;
        return `${order.bizStr} (¥${Number(amount).toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })})`;
      };
      const bizIdMap = new Map(all.map(o => [o.bizId, buildLabel(o)]));
      const idMap = new Map(all.map(o => [o.id, buildLabel(o)]));
      return ids.map(id => ({
        id,
        label: String(bizIdMap.get(id) ?? idMap.get(id) ?? id),
      }));
    }

    case 'grades': {
      const all = await getErpGrades();
      const map = new Map(all.map(g => [g.id, g.name]));
      return ids.map(id => ({ id, label: String(map.get(id) ?? map.get(String(id)) ?? id) }));
    }

    case 'groups': {
      const all = await getErpGroups();
      const map = new Map(all.map(g => [g.id, g.name]));
      return ids.map(id => ({ id, label: String(map.get(id) ?? map.get(String(id)) ?? id) }));
    }

    case 'areas': {
      const all = await getErpAreas();
      const map = new Map(all.map(a => [a.id, a.name]));
      return ids.map(id => ({ id, label: String(map.get(id) ?? map.get(String(id)) ?? id) }));
    }

    case 'areas-tree': {
      const tree = await getErpAreaTree();
      const flatList: Array<{ id: number | string; name: string }> = [];
      function flattenForResolve(nodes: Array<{ id: number | string; name: string; children?: any[] }>) {
        for (const node of nodes) {
          flatList.push({ id: node.id, name: node.name });
          if (node.children?.length) flattenForResolve(node.children);
        }
      }
      flattenForResolve(tree);
      const treeMap = new Map(flatList.map(a => [a.id, a.name]));
      return ids.map(id => ({ id, label: String(treeMap.get(id) ?? treeMap.get(String(id)) ?? id) }));
    }

    case 'purchase-orders': {
      const buildPOLabel = (o: PurchaseOrderListItem) => {
        const amount = parseFloat(o.totalAmount);
        const amountStr = isNaN(amount) ? '' : `¥${amount.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
        const date = String(o.operDateTime || '').slice(0, 10);
        return [o.billStr, date, amountStr].filter(Boolean).join(' | ');
      };
      const poResult = await searchPurchaseOrders({ states: ['UN_APPROVED'], size: 1000 });
      const poMap = new Map(poResult.records.map(o => [o.billId, buildPOLabel(o)]));
      return ids.map(id => ({ id, label: String(poMap.get(id) ?? id) }));
    }

    case 'suppliers': {
      const fetchPage = async (current: number) => {
        const batch = await searchSuppliers(undefined, current, 200);
        return { records: batch, total: batch.length < 200 ? batch.length : batch.length + 1 };
      };
      const allSuppliers = await fetchAllPagesSequential(fetchPage, 200);
      const supplierMap = new Map(allSuppliers.map(s => [s.originId, s.name]));
      return ids.map(id => ({ id, label: String(supplierMap.get(id) ?? id) }));
    }

    case 'promotion-goods': {
      const pgResults = await Promise.allSettled(
        ids.map(async id => {
          const p = await getProductById(id);
          return { id, label: String(p?.name ?? id) };
        })
      );
      return pgResults.map((r, i) =>
        r.status === 'fulfilled' ? r.value : { id: ids[i], label: String(ids[i]) }
      );
    }

    case 'brands': {
      const all = await fetchAllBrands();
      const map = new Map(all.map(b => [b.originBrandId, b.name]));
      return ids.map(id => ({ id, label: String(map.get(id) ?? id) }));
    }

    default:
      throw new Error(`不支持的参考数据类型: ${type}`);
  }
}
