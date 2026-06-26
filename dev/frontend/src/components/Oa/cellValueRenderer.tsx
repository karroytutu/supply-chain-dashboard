import React from 'react';
import { Typography } from 'antd';
import type { FormField } from '@/types/oa';
import { formatCurrency } from '@/utils/format';
import { ERP_SEARCH_API_MAP } from '@/constants/oa-erp';
import ErpNameDisplay from './ErpNameDisplay';
import type { ErpResolvedMap } from './hooks/useErpFieldResolve';
import { resolveStoredName } from './utils/resolveStoredName';
import { buildDynamicOptions } from './fields/SelectFieldControl';

const { Text } = Typography;

/** 渲染表格单元格值 */
export function renderCellValue(
  childField: FormField,
  cellValue: unknown,
  rowData?: Record<string, unknown>,
  resolvedMap?: ErpResolvedMap,
): React.ReactNode {
  if (cellValue === null || cellValue === undefined || cellValue === '') {
    return <Text type="secondary">-</Text>;
  }
  switch (childField.type) {
    case 'money':
      return formatCurrency(cellValue as number);
    case 'number':
      return (cellValue as number).toLocaleString();
    case 'modal_select': {
      // 第一优先级：行数据中已存储的名称（nameField）
      const storedName = resolveStoredName(childField.nameField, rowData);
      if (storedName) return storedName;
      // 降级：显示原始值
      return String(cellValue);
    }
    case 'select': {
      // 优先使用静态选项
      const option = childField.options?.find((o) => o.value === cellValue);
      if (option) return option.label;
      // optionsFromField 动态选项（如从 _goodsUnits 数组中提取单位）
      if (childField.optionsFromField && rowData) {
        const dynamicOpts = buildDynamicOptions(rowData[childField.optionsFromField]);
        const dynOpt = dynamicOpts?.find((o) => o.value === cellValue);
        if (dynOpt) return dynOpt.label;
      }
      return String(cellValue);
    }
    case 'erp_customer':
    case 'erp_department':
    case 'erp_staff':
    case 'erp_payment_account':
    case 'erp_asset_category':
    case 'asset_search':
    case 'erp_supplier':
    case 'erp_purchase_order':
    case 'erp_prepayment':
    case 'erp_supplier_income': {
      // 第一优先级：行数据中已存储的名称（nameField，含 _ 前缀变体兜底）
      const storedName = resolveStoredName(childField.nameField, rowData);
      if (storedName) return storedName;
      // 第二优先级：批量预解析结果
      if (childField.searchApi) {
        const erpType = ERP_SEARCH_API_MAP[childField.searchApi];
        if (erpType) {
          const cacheKey = `${erpType}:${cellValue}`;
          if (resolvedMap?.[cacheKey]) {
            return resolvedMap[cacheKey];
          }
          // 第三优先级：ErpNameDisplay 兜底
          return <ErpNameDisplay erpType={erpType} id={cellValue} />;
        }
      }
      return String(cellValue);
    }
    case 'erp_settlement_order': {
      // 结算单类型不在表格子字段中使用，降级为文本
      return String(cellValue);
    }
    case 'formula': {
      // 快照语义：显示提交时存储的计算结果
      const num = Number(cellValue);
      const precision = childField.formulaPrecision ?? 2;
      return num.toLocaleString(undefined, { minimumFractionDigits: precision, maximumFractionDigits: precision });
    }
    default:
      return String(cellValue);
  }
}
