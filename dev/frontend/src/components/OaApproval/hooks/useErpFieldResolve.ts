/**
 * 批量预解析 ERP 字段 ID → 名称
 * 扫描 formSchema 中的 ERP 类型字段，优先使用 formData 中已存储的名称，
 * 无名称的 ID 收集后按 erpType 批量调用 resolveErpNames
 */
import { useState, useEffect } from 'react';
import type { FormSchema, FormField } from '@/types/oa-approval';
import { oaApprovalApi } from '@/services/api/oa-approval';
import type { ErpReferenceType } from '@/services/api/oa-approval';
import { ERP_SEARCH_API_MAP } from '@/constants/oa-approval-erp';

/** ERP 类型字段类型列表 */
const ERP_FIELD_TYPES = new Set([
  'erp_customer', 'erp_department', 'erp_staff',
  'erp_payment_account', 'erp_asset_category', 'asset_search', 'erp_settlement_order',
  'erp_grade', 'erp_group', 'erp_area',
]);

export interface ErpResolvedMap {
  /** key: "{erpType}:{id}", value: 名称 */
  [cacheKey: string]: string;
}

export function useErpFieldResolve(
  formSchema: FormSchema | undefined,
  formData: Record<string, unknown> | undefined,
): { resolvedMap: ErpResolvedMap; resolving: boolean } {
  const [resolvedMap, setResolvedMap] = useState<ErpResolvedMap>({});
  const [resolving, setResolving] = useState(false);

  useEffect(() => {
    if (!formSchema?.fields || !formData) {
      setResolvedMap({});
      setResolving(false);
      return;
    }

    const newMap: ErpResolvedMap = {};
    const pendingByType: Record<string, { ids: number[]; extraParams?: Record<string, string> }> = {};

    /** 收集所有需要解析的 ERP ID（包括顶层字段和 table children） */
    const collectErpIds = (fields: FormField[], parentRows?: Record<string, unknown>[]) => {
      for (const field of fields) {
        // 处理 table 类型：递归扫描 children，从每行数据中提取 ERP ID
        if (field.type === 'table' && field.children) {
          const tableRows = (formData[field.key] || parentRows) as Record<string, unknown>[] | undefined;
          if (tableRows && tableRows.length > 0) {
            collectErpIds(field.children, tableRows);
          }
          continue;
        }

        if (!ERP_FIELD_TYPES.has(field.type)) continue;

        const erpType = field.searchApi ? ERP_SEARCH_API_MAP[field.searchApi] : undefined;
        if (!erpType) continue;

        // table children 场景：从每行数据中提取
        if (parentRows) {
          for (const row of parentRows) {
            // 第一优先级：nameField 对应行中已有名称
            if (field.nameField) {
              const storedName = row[field.nameField];
              if (storedName && String(storedName).trim()) {
                const id = row[field.key];
                if (id != null) {
                  newMap[`${erpType}:${id}`] = String(storedName);
                }
                continue;
              }
            }

            const rawValue = row[field.key];
            if (rawValue == null) continue;
            const id = Number(rawValue);
            if (!isNaN(id)) {
              if (!pendingByType[erpType]) pendingByType[erpType] = { ids: [] };
              pendingByType[erpType].ids.push(id);
            }
          }
          continue;
        }

        // 顶层字段场景
        // 第一优先级：nameField 对应的 formData 中已有名称
        if (field.nameField) {
          const storedName = formData[field.nameField];
          if (storedName && String(storedName).trim()) {
            const id = formData[field.key];
            if (id != null) {
              newMap[`${erpType}:${id}`] = String(storedName);
            }
            continue;
          }
        }

        // 收集需要解析的 ID
        const rawValue = formData[field.key];
        if (rawValue == null) continue;

        if (field.type === 'erp_settlement_order') {
          const ids = Array.isArray(rawValue) ? rawValue : [];
          const extraParams = formData.customer ? { consumerId: String(formData.customer) } : undefined;
          if (ids.length > 0) {
            if (!pendingByType[erpType]) pendingByType[erpType] = { ids: [], extraParams };
            pendingByType[erpType].ids.push(...ids.map(Number));
            pendingByType[erpType].extraParams = extraParams;
          }
        } else {
          const id = Number(rawValue);
          if (!isNaN(id)) {
            if (!pendingByType[erpType]) pendingByType[erpType] = { ids: [] };
            pendingByType[erpType].ids.push(id);
          }
        }
      }
    };

    collectErpIds(formSchema.fields);

    // 如果没有需要解析的，直接返回
    if (Object.keys(pendingByType).length === 0) {
      setResolvedMap(newMap);
      setResolving(false);
      return;
    }

    // 批量解析
    setResolving(true);
    let cancelled = false;
    Promise.all(
      Object.entries(pendingByType).map(([erpType, { ids, extraParams }]) =>
        oaApprovalApi.resolveErpNames(erpType as ErpReferenceType, [...new Set(ids)], extraParams)
          .then((results) => {
            for (const item of results) {
              newMap[`${erpType}:${item.id}`] = item.label;
            }
          })
          .catch(() => { /* 解析失败不影响整体 */ })
      )
    ).finally(() => {
      if (!cancelled) {
        setResolvedMap(newMap);
        setResolving(false);
      }
    });

    return () => { cancelled = true; };
  }, [formSchema, formData]);

  return { resolvedMap, resolving };
}
