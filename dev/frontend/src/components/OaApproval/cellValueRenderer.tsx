import React from 'react';
import { Typography } from 'antd';
import type { FormField } from '@/types/oa-approval';
import { formatCurrency } from '@/utils/format';
import { ERP_SEARCH_API_MAP } from '@/constants/oa-approval-erp';
import ErpNameDisplay from './ErpNameDisplay';
import type { ErpResolvedMap } from './hooks/useErpFieldResolve';

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
    case 'select':
      const option = childField.options?.find((o) => o.value === cellValue);
      return option?.label || String(cellValue);
    case 'erp_customer':
    case 'erp_department':
    case 'erp_staff':
    case 'erp_payment_account':
    case 'erp_asset_category':
    case 'asset_search': {
      // 第一优先级：行数据中已存储的名称（nameField）
      if (childField.nameField && rowData?.[childField.nameField]) {
        const storedName = String(rowData[childField.nameField]).trim();
        if (storedName) return storedName;
      }
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
    default:
      return String(cellValue);
  }
}
