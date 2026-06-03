/**
 * 批量预解析 ERP 字段 ID → 名称
 * 扫描 formSchema 中的 ERP 类型字段，优先使用 formData 中已存储的名称，
 * 无名称的 ID 收集后按 erpType 批量调用 resolveErpNames
 */
import { useState, useEffect } from 'react';
import type { FormSchema, FormField } from '@/types/oa';
import { oaApi } from '@/services/api/oa';
import type { ErpReferenceType } from '@/services/api/oa';
import { ERP_SEARCH_API_MAP } from '@/constants/oa-erp';
import { resolveStoredName } from '../utils/resolveStoredName';

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
            // 第一优先级：nameField 对应行中已有名称（含 _ 前缀变体兜底）
            const storedName = resolveStoredName(field.nameField, row);
            if (storedName) {
              const id = row[field.key];
              if (id != null) {
                newMap[`${erpType}:${id}`] = storedName;
              }
              continue;
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
        // 第一优先级：nameField 对应的 formData 中已有名称（含 _ 前缀变体兜底）
        const storedName = resolveStoredName(field.nameField, formData);
        if (storedName) {
          const id = formData[field.key];
          if (id != null) {
            newMap[`${erpType}:${id}`] = storedName;
          }
          continue;
        }

        // 第二优先级：detailsField 存在且数据可解析时，渲染器可自行渲染，跳过 resolve
        if (field.detailsField) {
          const detailsValue = formData[field.detailsField];
          if (detailsValue) {
            try {
              const parsed = JSON.parse(String(detailsValue));
              if (Array.isArray(parsed) && parsed.length > 0) {
                continue; // detailsField 数据完整，无需 resolve
              }
            } catch {
              /* JSON 解析失败，降级到下方的 ID 解析逻辑 */
            }
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

        // === 变更对比：同时收集 _original_ 前缀的原始 ERP ID ===
        const originalKey = `_original_${field.key}`;
        const originalValue = formData[originalKey];
        if (originalValue != null && originalValue !== '') {
          // 对于有 nameField 的字段，检查是否存储了原始名称
          // nameField 可能带 _ 前缀（如 _consumerManagerName），后端存储时去掉了前缀
          if (field.nameField) {
            const cleanNameField = field.nameField.replace(/^_/, '');
            const originalNameKey = `_original_${cleanNameField}`;
            const originalName = formData[originalNameKey];
            if (originalName && String(originalName).trim()) {
              newMap[`${erpType}:${originalValue}`] = String(originalName);
              continue;
            }
          }
          // 对于无 nameField 的 ERP 字段（grade/group/area），检查是否存储了原始名称
          // 命名约定：_original_gradeId → _original_gradeName
          const nameKeyVariants = ['gradeName', 'groupName', 'areaName'];
          const baseKey = field.key; // e.g. gradeId, groupId, areaId
          let nameResolved = false;
          for (const nameVariant of nameKeyVariants) {
            if (baseKey.toLowerCase().startsWith(nameVariant.replace('Name', '').toLowerCase())) {
              const storedName = formData[`_original_${nameVariant}`];
              if (storedName && String(storedName).trim()) {
                newMap[`${erpType}:${originalValue}`] = String(storedName);
                nameResolved = true;
                break;
              }
            }
          }
          if (!nameResolved) {
            const origId = Number(originalValue);
            if (!isNaN(origId)) {
              if (!pendingByType[erpType]) pendingByType[erpType] = { ids: [] };
              pendingByType[erpType].ids.push(origId);
            }
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
        oaApi.resolveErpNames(erpType as ErpReferenceType, [...new Set(ids)], extraParams)
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
